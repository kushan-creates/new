"""
Kushan.Ji Delivery Management System - FastAPI Backend
JWT auth + RBAC (Admin / User) + MongoDB persistence.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone, date
from pathlib import Path
from typing import Any, Dict, List, Optional

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Header, Request, status
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

# ---------------------------------------------------------------------------
# Config / startup
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "kushan-ji-super-secret-change-me-prod")
JWT_ALG = "HS256"
ACCESS_TOKEN_TTL_MIN = 60 * 24 * 7  # 7 days

# IST offset for automatic time capture (India Standard Time)
IST = timezone(timedelta(hours=5, minutes=30))

DEFAULT_ADMIN_EMAIL = "admin@kushanji.com"
DEFAULT_ADMIN_PASSWORD = "Admin@123"
DEFAULT_USER_EMAIL = "user@kushanji.com"
DEFAULT_USER_PASSWORD = "User@123"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Kushan.Ji Delivery API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("kushanji")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_token(user_id: str, role: str, tv: int) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "tv": tv,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_TTL_MIN),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def clean(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not doc:
        return None
    doc.pop("_id", None)
    return doc


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class LoginIn(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str = "user"  # "admin" | "user"


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class PasswordReset(BaseModel):
    new_password: str


class ChangePassword(BaseModel):
    current_password: str
    new_password: str


class ChangeEmail(BaseModel):
    current_password: str
    new_email: str


class ChangeName(BaseModel):
    name: str


class CustomerIn(BaseModel):
    name: str
    mobile: str = ""
    whatsapp: str = ""


class DriverIn(BaseModel):
    name: str


class DeliveryIn(BaseModel):
    date: str  # ISO date YYYY-MM-DD
    customer_id: str
    driver_id: str
    product: str
    quantity: float
    unit: str = "kg"
    remarks: str = ""
    time: Optional[str] = None  # HH:MM — if omitted, server auto-captures IST


class SettingsIn(BaseModel):
    business_name: Optional[str] = None
    business_logo: Optional[str] = None  # base64
    default_unit: Optional[str] = None
    default_products: Optional[List[str]] = None
    theme: Optional[str] = None


# ---------------------------------------------------------------------------
# Auth dependencies
# ---------------------------------------------------------------------------
async def get_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await db.users.find_one({"id": payload.get("sub")})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="User is inactive")
    if user.get("token_version", 0) != payload.get("tv", 0):
        raise HTTPException(status_code=401, detail="Token revoked")
    return user


async def admin_only(user=Depends(get_user)) -> Dict[str, Any]:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return user


async def audit(
    user: Dict[str, Any],
    action: str,
    resource: str,
    resource_id: str = "",
    old: Any = None,
    new: Any = None,
    device: str = "",
):
    def sanitize(v: Any) -> Any:
        # strip ObjectId/non-JSON-safe types by stringifying anything weird
        import json as _json
        try:
            return _json.loads(_json.dumps(v, default=str))
        except Exception:
            return str(v)

    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user.get("id"),
        "user_name": user.get("name"),
        "role": user.get("role"),
        "action": action,
        "resource": resource,
        "resource_id": resource_id,
        "old_value": sanitize(old) if old is not None else None,
        "new_value": sanitize(new) if new is not None else None,
        "device": device,
        "timestamp": now_iso(),
    })


# ---------------------------------------------------------------------------
# Startup seed
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup():
    # indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.customers.create_index("id", unique=True)
    await db.drivers.create_index("id", unique=True)
    await db.deliveries.create_index("id", unique=True)
    await db.deliveries.create_index("date")
    await db.deliveries.create_index("customer_id")
    await db.audit_logs.create_index("timestamp")

    # seed admin
    if not await db.users.find_one({"email": DEFAULT_ADMIN_EMAIL}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "name": "Administrator",
            "email": DEFAULT_ADMIN_EMAIL,
            "password_hash": hash_pw(DEFAULT_ADMIN_PASSWORD),
            "role": "admin",
            "is_active": True,
            "token_version": 0,
            "created_at": now_iso(),
        })
        log.info("Seeded default admin: %s", DEFAULT_ADMIN_EMAIL)

    if not await db.users.find_one({"email": DEFAULT_USER_EMAIL}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "name": "Demo User",
            "email": DEFAULT_USER_EMAIL,
            "password_hash": hash_pw(DEFAULT_USER_PASSWORD),
            "role": "user",
            "is_active": True,
            "token_version": 0,
            "created_at": now_iso(),
        })
        log.info("Seeded default user: %s", DEFAULT_USER_EMAIL)

    # seed default settings if missing
    if not await db.settings.find_one({"id": "global"}):
        await db.settings.insert_one({
            "id": "global",
            "business_name": "Kushan.Ji Namkeen Distribution",
            "business_logo": "",
            "default_unit": "kg",
            "default_products": ["Sev", "Bhujia", "Gathiya", "Chana Dal", "Mixture", "Papdi"],
            "theme": "light",
            "updated_at": now_iso(),
        })


@app.on_event("shutdown")
async def shutdown():
    client.close()


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"app": "Kushan.Ji API", "status": "ok", "time": now_iso()}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
def user_public(u: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": u["id"],
        "name": u["name"],
        "email": u["email"],
        "role": u["role"],
        "is_active": u.get("is_active", True),
        "created_at": u.get("created_at"),
    }


@api.post("/auth/login", response_model=TokenOut)
async def login(body: LoginIn, request: Request):
    user = await db.users.find_one({"email": body.email.lower().strip()})
    if not user or not verify_pw(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="User is inactive")
    token = make_token(user["id"], user["role"], user.get("token_version", 0))
    await audit(user, "login", "auth", user["id"], device=request.headers.get("x-client-type", ""))
    return TokenOut(access_token=token, user=user_public(user))


@api.get("/auth/me")
async def me(user=Depends(get_user)):
    return user_public(user)


@api.post("/auth/change-password")
async def change_password(body: ChangePassword, user=Depends(get_user)):
    if not verify_pw(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 4:
        raise HTTPException(status_code=400, detail="Password too short (min 4 chars)")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_pw(body.new_password)}, "$inc": {"token_version": 1}},
    )
    await audit(user, "change_password", "user", user["id"])
    # issue new token since tv changed
    fresh = await db.users.find_one({"id": user["id"]})
    token = make_token(fresh["id"], fresh["role"], fresh["token_version"])
    return {"status": "ok", "access_token": token}


@api.post("/auth/change-email")
async def change_email(body: ChangeEmail, user=Depends(get_user)):
    if not verify_pw(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    new_email = body.new_email.lower().strip()
    if await db.users.find_one({"email": new_email, "id": {"$ne": user["id"]}}):
        raise HTTPException(status_code=400, detail="Email already in use")
    await db.users.update_one({"id": user["id"]}, {"$set": {"email": new_email}})
    await audit(user, "change_email", "user", user["id"], old=user["email"], new=new_email)
    return {"status": "ok", "email": new_email}


@api.post("/auth/change-name")
async def change_name(body: ChangeName, user=Depends(get_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"name": body.name.strip()}})
    await audit(user, "change_name", "user", user["id"], old=user["name"], new=body.name)
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# User management (admin)
# ---------------------------------------------------------------------------
@api.get("/users")
async def list_users(_=Depends(admin_only)):
    cur = db.users.find({}, {"_id": 0, "password_hash": 0})
    return [u async for u in cur]


@api.post("/users")
async def create_user(body: UserCreate, admin=Depends(admin_only)):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already in use")
    if body.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Invalid role")
    doc = {
        "id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "email": email,
        "password_hash": hash_pw(body.password),
        "role": body.role,
        "is_active": True,
        "token_version": 0,
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    await audit(admin, "create", "user", doc["id"], new={"name": doc["name"], "email": email, "role": body.role})
    return user_public(doc)


@api.put("/users/{user_id}")
async def update_user(user_id: str, body: UserUpdate, admin=Depends(admin_only)):
    existing = await db.users.find_one({"id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    update = {k: v for k, v in body.dict().items() if v is not None}
    if update:
        await db.users.update_one({"id": user_id}, {"$set": update})
    await audit(admin, "update", "user", user_id, old=user_public(existing), new=update)
    new_doc = await db.users.find_one({"id": user_id})
    return user_public(new_doc)


@api.post("/users/{user_id}/reset-password")
async def reset_password(user_id: str, body: PasswordReset, admin=Depends(admin_only)):
    existing = await db.users.find_one({"id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"password_hash": hash_pw(body.new_password)}, "$inc": {"token_version": 1}},
    )
    await audit(admin, "reset_password", "user", user_id)
    return {"status": "ok"}


@api.delete("/users/{user_id}")
async def delete_user(user_id: str, admin=Depends(admin_only)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    existing = await db.users.find_one({"id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.delete_one({"id": user_id})
    await audit(admin, "delete", "user", user_id, old=user_public(existing))
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------
@api.get("/customers")
async def list_customers(user=Depends(get_user)):
    cur = db.customers.find({}, {"_id": 0}).sort("name", 1).limit(5000)
    return [c async for c in cur]


@api.post("/customers")
async def create_customer(body: CustomerIn, user=Depends(get_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "mobile": body.mobile.strip(),
        "whatsapp": (body.whatsapp or body.mobile).strip(),
        "created_at": now_iso(),
    }
    await db.customers.insert_one(doc)
    doc.pop("_id", None)
    await audit(user, "create", "customer", doc["id"], new=doc)
    return clean(doc)


@api.put("/customers/{cid}")
async def update_customer(cid: str, body: CustomerIn, user=Depends(get_user)):
    existing = await db.customers.find_one({"id": cid})
    if not existing:
        raise HTTPException(status_code=404, detail="Customer not found")
    update = {"name": body.name.strip(), "mobile": body.mobile.strip(), "whatsapp": (body.whatsapp or body.mobile).strip()}
    await db.customers.update_one({"id": cid}, {"$set": update})
    await audit(user, "update", "customer", cid, old=clean(existing), new=update)
    new_doc = await db.customers.find_one({"id": cid}, {"_id": 0})
    return new_doc


@api.delete("/customers/{cid}")
async def delete_customer(cid: str, user=Depends(get_user)):
    existing = await db.customers.find_one({"id": cid})
    if not existing:
        raise HTTPException(status_code=404, detail="Customer not found")
    await db.customers.delete_one({"id": cid})
    await audit(user, "delete", "customer", cid, old=clean(existing))
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Drivers
# ---------------------------------------------------------------------------
@api.get("/drivers")
async def list_drivers(user=Depends(get_user)):
    cur = db.drivers.find({}, {"_id": 0}).sort("name", 1).limit(1000)
    return [d async for d in cur]


@api.post("/drivers")
async def create_driver(body: DriverIn, user=Depends(get_user)):
    doc = {"id": str(uuid.uuid4()), "name": body.name.strip(), "created_at": now_iso()}
    await db.drivers.insert_one(doc)
    doc.pop("_id", None)
    await audit(user, "create", "driver", doc["id"], new=doc)
    return clean(doc)


@api.put("/drivers/{did}")
async def update_driver(did: str, body: DriverIn, user=Depends(get_user)):
    existing = await db.drivers.find_one({"id": did})
    if not existing:
        raise HTTPException(status_code=404, detail="Driver not found")
    await db.drivers.update_one({"id": did}, {"$set": {"name": body.name.strip()}})
    await audit(user, "update", "driver", did, old=clean(existing), new={"name": body.name.strip()})
    new_doc = await db.drivers.find_one({"id": did}, {"_id": 0})
    return new_doc


@api.delete("/drivers/{did}")
async def delete_driver(did: str, user=Depends(get_user)):
    existing = await db.drivers.find_one({"id": did})
    if not existing:
        raise HTTPException(status_code=404, detail="Driver not found")
    await db.drivers.delete_one({"id": did})
    await audit(user, "delete", "driver", did, old=clean(existing))
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Deliveries
# ---------------------------------------------------------------------------
async def enrich_delivery(d: Dict[str, Any]) -> Dict[str, Any]:
    cust = await db.customers.find_one({"id": d.get("customer_id")}, {"_id": 0})
    drv = await db.drivers.find_one({"id": d.get("driver_id")}, {"_id": 0})
    d["customer_name"] = cust["name"] if cust else "Unknown"
    d["customer_mobile"] = cust["mobile"] if cust else ""
    d["customer_whatsapp"] = cust["whatsapp"] if cust else ""
    d["driver_name"] = drv["name"] if drv else "Unknown"
    return d


@api.get("/deliveries")
async def list_deliveries(
    user=Depends(get_user),
    q: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    customer_id: Optional[str] = None,
    driver_id: Optional[str] = None,
    product: Optional[str] = None,
    limit: int = 500,
):
    flt: Dict[str, Any] = {"deleted_at": {"$exists": False}}
    if date_from and date_to:
        flt["date"] = {"$gte": date_from, "$lte": date_to}
    elif date_from:
        flt["date"] = {"$gte": date_from}
    elif date_to:
        flt["date"] = {"$lte": date_to}
    if customer_id:
        flt["customer_id"] = customer_id
    if driver_id:
        flt["driver_id"] = driver_id
    if product:
        flt["product"] = {"$regex": product, "$options": "i"}
    cur = db.deliveries.find(flt, {"_id": 0}).sort([("date", -1), ("time", -1)]).limit(limit)
    items = [await enrich_delivery(d) async for d in cur]
    if q:
        ql = q.lower()
        items = [
            d for d in items
            if ql in d["customer_name"].lower()
            or ql in d["driver_name"].lower()
            or ql in d["product"].lower()
            or ql in (d.get("remarks") or "").lower()
        ]
    return items


@api.post("/deliveries")
async def create_delivery(body: DeliveryIn, user=Depends(get_user)):
    now_ist = datetime.now(IST)
    entry_time = (body.time or "").strip() or now_ist.strftime("%H:%M")
    # duplicate detection: same date+customer+driver+product+quantity in last 5 min
    dup = await db.deliveries.find_one({
        "date": body.date,
        "customer_id": body.customer_id,
        "driver_id": body.driver_id,
        "product": body.product,
        "quantity": body.quantity,
        "deleted_at": {"$exists": False},
    })
    is_dup = dup is not None
    doc = {
        "id": str(uuid.uuid4()),
        "date": body.date,
        "time": entry_time,
        "customer_id": body.customer_id,
        "driver_id": body.driver_id,
        "product": body.product.strip(),
        "quantity": float(body.quantity),
        "unit": body.unit,
        "remarks": body.remarks or "",
        "created_by": user["id"],
        "created_by_name": user["name"],
        "created_at": now_iso(),
        "versions": [],
    }
    await db.deliveries.insert_one(doc)
    doc.pop("_id", None)
    await audit(user, "create", "delivery", doc["id"], new={k: v for k, v in doc.items() if k != "versions"})
    out = await enrich_delivery(clean(doc))
    out["duplicate_warning"] = is_dup
    return out


@api.put("/deliveries/{did}")
async def update_delivery(did: str, body: DeliveryIn, user=Depends(get_user)):
    existing = await db.deliveries.find_one({"id": did, "deleted_at": {"$exists": False}})
    if not existing:
        raise HTTPException(status_code=404, detail="Delivery not found")
    # version history
    versions = existing.get("versions", [])
    versions.append({
        "snapshot_at": now_iso(),
        "by_user_id": user["id"],
        "by_user_name": user["name"],
        "data": {k: existing.get(k) for k in ("date", "customer_id", "driver_id", "product", "quantity", "unit", "remarks", "time")},
    })
    update = {
        "date": body.date,
        "time": (body.time or "").strip() or existing.get("time"),
        "customer_id": body.customer_id,
        "driver_id": body.driver_id,
        "product": body.product.strip(),
        "quantity": float(body.quantity),
        "unit": body.unit,
        "remarks": body.remarks or "",
        "updated_at": now_iso(),
        "versions": versions,
    }
    await db.deliveries.update_one({"id": did}, {"$set": update})
    await audit(user, "update", "delivery", did, old=clean({k: existing[k] for k in existing if k != "_id"}), new=update)
    new_doc = await db.deliveries.find_one({"id": did}, {"_id": 0})
    return await enrich_delivery(new_doc)


@api.delete("/deliveries/{did}")
async def delete_delivery(did: str, user=Depends(get_user)):
    existing = await db.deliveries.find_one({"id": did})
    if not existing:
        raise HTTPException(status_code=404, detail="Delivery not found")
    await db.deliveries.update_one({"id": did}, {"$set": {"deleted_at": now_iso(), "deleted_by": user["id"]}})
    await audit(user, "soft_delete", "delivery", did, old=clean(dict(existing)))
    return {"status": "ok"}


@api.post("/deliveries/{did}/restore")
async def restore_delivery(did: str, user=Depends(get_user)):
    existing = await db.deliveries.find_one({"id": did})
    if not existing or not existing.get("deleted_at"):
        raise HTTPException(status_code=404, detail="No deleted delivery found")
    await db.deliveries.update_one({"id": did}, {"$unset": {"deleted_at": "", "deleted_by": ""}})
    await audit(user, "restore", "delivery", did)
    return {"status": "ok"}


@api.get("/deliveries/trash")
async def list_trash(user=Depends(get_user)):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    # auto-purge older than 30 days
    await db.deliveries.delete_many({"deleted_at": {"$lt": cutoff}})
    cur = db.deliveries.find({"deleted_at": {"$exists": True}}, {"_id": 0}).sort("deleted_at", -1).limit(500)
    return [await enrich_delivery(d) async for d in cur]


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@api.get("/dashboard")
async def dashboard(user=Depends(get_user)):
    today = date.today().isoformat()
    month_start = today[:7] + "-01"

    today_q: List[Dict[str, Any]] = []
    month_q: List[Dict[str, Any]] = []
    async for d in db.deliveries.find({"date": today, "deleted_at": {"$exists": False}}, {"_id": 0}):
        today_q.append(d)
    async for d in db.deliveries.find({"date": {"$gte": month_start}, "deleted_at": {"$exists": False}}, {"_id": 0}):
        month_q.append(d)

    today_qty = sum(float(d.get("quantity", 0)) for d in today_q)
    today_customers = len({d["customer_id"] for d in today_q})
    month_qty = sum(float(d.get("quantity", 0)) for d in month_q)

    # top customers (this month)
    cust_agg: Dict[str, float] = {}
    for d in month_q:
        cust_agg[d["customer_id"]] = cust_agg.get(d["customer_id"], 0) + float(d.get("quantity", 0))
    top_cust = sorted(cust_agg.items(), key=lambda x: x[1], reverse=True)[:5]
    top_customers = []
    for cid, qty in top_cust:
        c = await db.customers.find_one({"id": cid}, {"_id": 0})
        top_customers.append({"id": cid, "name": c["name"] if c else "Unknown", "quantity": qty})

    # top products
    prod_agg: Dict[str, float] = {}
    for d in month_q:
        prod_agg[d["product"]] = prod_agg.get(d["product"], 0) + float(d.get("quantity", 0))
    top_products = [{"product": p, "quantity": q} for p, q in sorted(prod_agg.items(), key=lambda x: x[1], reverse=True)[:5]]

    # daily analytics (last 7 days)
    daily = []
    for i in range(6, -1, -1):
        d_date = (date.today() - timedelta(days=i)).isoformat()
        qty = sum(float(d.get("quantity", 0)) for d in month_q if d.get("date") == d_date)
        cnt = sum(1 for d in month_q if d.get("date") == d_date)
        daily.append({"date": d_date, "quantity": qty, "count": cnt})

    return {
        "today_deliveries": len(today_q),
        "today_quantity": today_qty,
        "today_customers": today_customers,
        "monthly_deliveries": len(month_q),
        "monthly_quantity": month_qty,
        "top_customers": top_customers,
        "top_products": top_products,
        "daily_analytics": daily,
    }


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------
@api.get("/reports/customer-summary")
async def customer_summary(
    user=Depends(get_user),
    customer_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    flt: Dict[str, Any] = {"deleted_at": {"$exists": False}}
    if customer_id:
        flt["customer_id"] = customer_id
    if date_from and date_to:
        flt["date"] = {"$gte": date_from, "$lte": date_to}
    rows = []
    async for d in db.deliveries.find(flt, {"_id": 0}).sort("date", 1).limit(10000):
        rows.append(await enrich_delivery(d))
    total_qty = sum(r["quantity"] for r in rows)
    return {"rows": rows, "total_quantity": total_qty, "count": len(rows)}


@api.get("/reports/driver-summary")
async def driver_summary(
    user=Depends(get_user),
    driver_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    flt: Dict[str, Any] = {"deleted_at": {"$exists": False}}
    if driver_id:
        flt["driver_id"] = driver_id
    if date_from and date_to:
        flt["date"] = {"$gte": date_from, "$lte": date_to}
    rows = []
    async for d in db.deliveries.find(flt, {"_id": 0}).sort("date", 1).limit(10000):
        rows.append(await enrich_delivery(d))
    total_qty = sum(r["quantity"] for r in rows)
    return {"rows": rows, "total_quantity": total_qty, "count": len(rows)}


@api.get("/reports/product-summary")
async def product_summary(
    user=Depends(get_user),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    flt: Dict[str, Any] = {"deleted_at": {"$exists": False}}
    if date_from and date_to:
        flt["date"] = {"$gte": date_from, "$lte": date_to}
    agg: Dict[str, Dict[str, Any]] = {}
    async for d in db.deliveries.find(flt, {"_id": 0}).limit(50000):
        k = d["product"]
        cur = agg.setdefault(k, {"product": k, "quantity": 0.0, "count": 0, "unit": d.get("unit", "kg")})
        cur["quantity"] += float(d["quantity"])
        cur["count"] += 1
    return {"rows": sorted(agg.values(), key=lambda r: r["quantity"], reverse=True)}


@api.get("/reports/period-analysis")
async def period_analysis(
    user=Depends(get_user),
    period: str = "monthly",  # weekly | monthly | yearly | custom
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    customer_id: Optional[str] = None,
):
    """Detailed per-day breakdown grouped by customer/product for a period.

    Returns:
      - period_label, from, to
      - by_day: [{date, quantity, count}]
      - by_customer: [{customer_id, name, quantity, count, days: [{date, quantity}]}]
      - by_product: [{product, quantity, count}]
      - grand_total_quantity, grand_total_count
    """
    today = date.today()
    if period == "weekly":
        start = today - timedelta(days=today.weekday())  # Monday
        end = start + timedelta(days=6)
        label = f"Week of {start.isoformat()}"
    elif period == "monthly":
        start = today.replace(day=1)
        # last day of month
        if start.month == 12:
            end = start.replace(year=start.year + 1, month=1) - timedelta(days=1)
        else:
            end = start.replace(month=start.month + 1) - timedelta(days=1)
        label = start.strftime("%B %Y")
    elif period == "yearly":
        start = today.replace(month=1, day=1)
        end = today.replace(month=12, day=31)
        label = f"Year {start.year}"
    else:
        if not (date_from and date_to):
            raise HTTPException(status_code=400, detail="date_from and date_to required for custom period")
        start = date.fromisoformat(date_from)
        end = date.fromisoformat(date_to)
        label = f"{date_from} → {date_to}"

    flt: Dict[str, Any] = {
        "deleted_at": {"$exists": False},
        "date": {"$gte": start.isoformat(), "$lte": end.isoformat()},
    }
    if customer_id:
        flt["customer_id"] = customer_id

    by_day: Dict[str, Dict[str, float]] = {}
    by_customer: Dict[str, Dict[str, Any]] = {}
    by_product: Dict[str, Dict[str, Any]] = {}
    grand_qty = 0.0
    grand_count = 0

    async for d in db.deliveries.find(flt, {"_id": 0}).limit(100000):
        qty = float(d.get("quantity", 0))
        grand_qty += qty
        grand_count += 1

        # by day
        day_row = by_day.setdefault(d["date"], {"date": d["date"], "quantity": 0.0, "count": 0})
        day_row["quantity"] += qty
        day_row["count"] += 1

        # by customer with per-day days list
        cid = d["customer_id"]
        cust_row = by_customer.setdefault(cid, {"customer_id": cid, "name": "", "quantity": 0.0, "count": 0, "days": {}})
        cust_row["quantity"] += qty
        cust_row["count"] += 1
        cust_row["days"][d["date"]] = cust_row["days"].get(d["date"], 0.0) + qty

        # by product
        p = d["product"]
        prod_row = by_product.setdefault(p, {"product": p, "quantity": 0.0, "count": 0})
        prod_row["quantity"] += qty
        prod_row["count"] += 1

    # resolve customer names
    cids = list(by_customer.keys())
    if cids:
        async for c in db.customers.find({"id": {"$in": cids}}, {"_id": 0}):
            if c["id"] in by_customer:
                by_customer[c["id"]]["name"] = c["name"]

    # flatten days dict → sorted list
    customer_list = []
    for row in by_customer.values():
        row["days"] = sorted(
            [{"date": k, "quantity": v} for k, v in row["days"].items()],
            key=lambda x: x["date"],
        )
        if not row["name"]:
            row["name"] = "Unknown"
        customer_list.append(row)
    customer_list.sort(key=lambda r: r["quantity"], reverse=True)

    return {
        "period_label": label,
        "from": start.isoformat(),
        "to": end.isoformat(),
        "grand_total_quantity": grand_qty,
        "grand_total_count": grand_count,
        "by_day": sorted(by_day.values(), key=lambda r: r["date"]),
        "by_customer": customer_list,
        "by_product": sorted(by_product.values(), key=lambda r: r["quantity"], reverse=True),
    }


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------
@api.get("/audit-logs")
async def get_audit_logs(_=Depends(admin_only), limit: int = 200):
    cur = db.audit_logs.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit)
    return [a async for a in cur]


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------
@api.get("/settings")
async def get_settings(user=Depends(get_user)):
    s = await db.settings.find_one({"id": "global"}, {"_id": 0})
    return s


@api.put("/settings")
async def update_settings(body: SettingsIn, admin=Depends(admin_only)):
    update = {k: v for k, v in body.dict().items() if v is not None}
    update["updated_at"] = now_iso()
    await db.settings.update_one({"id": "global"}, {"$set": update}, upsert=True)
    await audit(admin, "update", "settings", "global", new=update)
    s = await db.settings.find_one({"id": "global"}, {"_id": 0})
    return s


# ---------------------------------------------------------------------------
# Mount + CORS
# ---------------------------------------------------------------------------
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
