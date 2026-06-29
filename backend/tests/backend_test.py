"""
Comprehensive backend tests for Kushan.Ji Delivery Management System.
Covers auth, user mgmt, customers, drivers, deliveries, dashboard,
reports, audit logs, settings.
"""
import time
import uuid
import requests
import pytest

from conftest import API, ADMIN_EMAIL, ADMIN_PASSWORD, USER_EMAIL, USER_PASSWORD


# -------------------- Health --------------------
class TestHealth:
    def test_root(self):
        r = requests.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "ok"


# -------------------- Auth --------------------
class TestAuth:
    def test_login_admin_ok(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data and data.get("token_type") == "bearer"
        assert data["user"]["role"] == "admin"
        assert data["user"]["email"] == ADMIN_EMAIL

    def test_login_user_ok(self):
        r = requests.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": USER_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["role"] == "user"

    def test_login_bad_creds(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, admin_headers):
        r = requests.get(f"{API}/auth/me", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_missing_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_change_name(self, user_headers):
        new_name = f"Demo User {uuid.uuid4().hex[:4]}"
        r = requests.post(f"{API}/auth/change-name", headers=user_headers, json={"name": new_name})
        assert r.status_code == 200
        me = requests.get(f"{API}/auth/me", headers=user_headers).json()
        assert me["name"] == new_name
        # restore
        requests.post(f"{API}/auth/change-name", headers=user_headers, json={"name": "Demo User"})

    def test_change_password_rotates_token(self):
        # Use a fresh user to avoid breaking session
        login = requests.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": USER_PASSWORD}).json()
        old_token = login["access_token"]
        h = {"Authorization": f"Bearer {old_token}", "Content-Type": "application/json"}

        # wrong current password
        r = requests.post(f"{API}/auth/change-password", headers=h,
                          json={"current_password": "wrong", "new_password": "User@1234"})
        assert r.status_code == 400

        # correct
        new_pw = "User@1234"
        r = requests.post(f"{API}/auth/change-password", headers=h,
                          json={"current_password": USER_PASSWORD, "new_password": new_pw})
        assert r.status_code == 200
        new_token = r.json()["access_token"]

        # old token should be revoked
        r_old = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {old_token}"})
        assert r_old.status_code == 401

        # new token works
        r_new = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {new_token}"})
        assert r_new.status_code == 200

        # restore password
        h_new = {"Authorization": f"Bearer {new_token}", "Content-Type": "application/json"}
        rr = requests.post(f"{API}/auth/change-password", headers=h_new,
                           json={"current_password": new_pw, "new_password": USER_PASSWORD})
        assert rr.status_code == 200

    def test_change_email_validation(self, user_headers):
        # wrong current password
        r = requests.post(f"{API}/auth/change-email", headers=user_headers,
                          json={"current_password": "wrong", "new_email": "x@y.com"})
        assert r.status_code == 400

        # uniqueness: try setting to admin email
        r = requests.post(f"{API}/auth/change-email", headers=user_headers,
                          json={"current_password": USER_PASSWORD, "new_email": ADMIN_EMAIL})
        assert r.status_code == 400


# -------------------- User management --------------------
class TestUserMgmt:
    def test_list_users_admin(self, admin_headers):
        r = requests.get(f"{API}/users", headers=admin_headers)
        assert r.status_code == 200
        users = r.json()
        assert any(u["email"] == ADMIN_EMAIL for u in users)
        # ensure _id not leaked
        for u in users:
            assert "_id" not in u
            assert "password_hash" not in u

    def test_list_users_non_admin_forbidden(self, user_headers):
        r = requests.get(f"{API}/users", headers=user_headers)
        assert r.status_code == 403

    def test_user_crud_flow(self, admin_headers):
        email = f"TEST_{uuid.uuid4().hex[:8]}@kushanji.com"
        # create
        r = requests.post(f"{API}/users", headers=admin_headers,
                          json={"name": "TEST User", "email": email, "password": "Temp@123", "role": "user"})
        assert r.status_code == 200, r.text
        uid = r.json()["id"]

        # update -> deactivate + role
        r = requests.put(f"{API}/users/{uid}", headers=admin_headers, json={"is_active": False, "role": "admin"})
        assert r.status_code == 200
        assert r.json()["is_active"] is False
        assert r.json()["role"] == "admin"

        # reset password
        r = requests.post(f"{API}/users/{uid}/reset-password", headers=admin_headers,
                          json={"new_password": "Temp@456"})
        assert r.status_code == 200

        # delete
        r = requests.delete(f"{API}/users/{uid}", headers=admin_headers)
        assert r.status_code == 200

        # verify deleted
        r = requests.put(f"{API}/users/{uid}", headers=admin_headers, json={"is_active": True})
        assert r.status_code == 404

    def test_non_admin_cant_create_user(self, user_headers):
        r = requests.post(f"{API}/users", headers=user_headers,
                          json={"name": "X", "email": "x@x.com", "password": "x", "role": "user"})
        assert r.status_code == 403


# -------------------- Customers --------------------
class TestCustomers:
    def test_customer_crud(self, admin_headers):
        # create
        body = {"name": f"TEST Cust {uuid.uuid4().hex[:4]}", "mobile": "9999999999", "whatsapp": "9999999999"}
        r = requests.post(f"{API}/customers", headers=admin_headers, json=body)
        assert r.status_code == 200
        cid = r.json()["id"]
        assert "_id" not in r.json()
        assert r.json()["name"] == body["name"]

        # list and verify present
        r = requests.get(f"{API}/customers", headers=admin_headers)
        assert r.status_code == 200
        assert any(c["id"] == cid for c in r.json())

        # update
        new = {"name": body["name"] + " EDIT", "mobile": "8888888888", "whatsapp": "8888888888"}
        r = requests.put(f"{API}/customers/{cid}", headers=admin_headers, json=new)
        assert r.status_code == 200
        assert r.json()["mobile"] == "8888888888"

        # delete
        r = requests.delete(f"{API}/customers/{cid}", headers=admin_headers)
        assert r.status_code == 200


# -------------------- Drivers --------------------
class TestDrivers:
    def test_driver_crud(self, user_headers):
        r = requests.post(f"{API}/drivers", headers=user_headers, json={"name": f"TEST Driver {uuid.uuid4().hex[:4]}"})
        assert r.status_code == 200
        did = r.json()["id"]

        r = requests.put(f"{API}/drivers/{did}", headers=user_headers, json={"name": "TEST Driver Updated"})
        assert r.status_code == 200
        assert r.json()["name"] == "TEST Driver Updated"

        r = requests.get(f"{API}/drivers", headers=user_headers)
        assert r.status_code == 200
        assert any(d["id"] == did for d in r.json())

        r = requests.delete(f"{API}/drivers/{did}", headers=user_headers)
        assert r.status_code == 200


# -------------------- Deliveries --------------------
class TestDeliveries:
    @pytest.fixture(scope="class")
    def seed_ids(self):
        login = requests.post(f"{API}/auth/login", json={"email": "admin@kushanji.com", "password": "Admin@123"}).json()
        admin_token = login["access_token"]
        h = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
        c = requests.post(f"{API}/customers", headers=h,
                          json={"name": f"TEST DCust {uuid.uuid4().hex[:4]}", "mobile": "9000000000", "whatsapp": "9000000000"}).json()
        d = requests.post(f"{API}/drivers", headers=h, json={"name": f"TEST DDrv {uuid.uuid4().hex[:4]}"}).json()
        yield {"customer_id": c["id"], "driver_id": d["id"], "headers": h}
        requests.delete(f"{API}/customers/{c['id']}", headers=h)
        requests.delete(f"{API}/drivers/{d['id']}", headers=h)

    def test_delivery_create_and_filters(self, seed_ids):
        h = seed_ids["headers"]
        from datetime import date as _d
        today = _d.today().isoformat()
        payload = {
            "date": today,
            "customer_id": seed_ids["customer_id"],
            "driver_id": seed_ids["driver_id"],
            "product": "Sev",
            "quantity": 5.5,
            "unit": "kg",
            "remarks": "TEST",
        }
        r = requests.post(f"{API}/deliveries", headers=h, json=payload)
        assert r.status_code == 200, r.text
        d1 = r.json()
        assert "time" in d1 and ":" in d1["time"]
        assert d1["duplicate_warning"] is False
        assert d1["customer_name"] != "Unknown"

        # duplicate detection
        r2 = requests.post(f"{API}/deliveries", headers=h, json=payload)
        assert r2.status_code == 200
        assert r2.json()["duplicate_warning"] is True

        # filter by customer
        r = requests.get(f"{API}/deliveries", headers=h, params={"customer_id": seed_ids["customer_id"]})
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert d1["id"] in ids

        # filter q (text)
        r = requests.get(f"{API}/deliveries", headers=h, params={"q": "Sev"})
        assert r.status_code == 200

        # filter product + date range
        r = requests.get(f"{API}/deliveries", headers=h,
                         params={"product": "Sev", "date_from": today, "date_to": today})
        assert r.status_code == 200
        assert len(r.json()) >= 1

        # update -> version snapshot
        upd = dict(payload)
        upd["quantity"] = 7.0
        r = requests.put(f"{API}/deliveries/{d1['id']}", headers=h, json=upd)
        assert r.status_code == 200
        # fetch raw via list to inspect versions
        listed = requests.get(f"{API}/deliveries", headers=h, params={"customer_id": seed_ids["customer_id"]}).json()
        target = next(x for x in listed if x["id"] == d1["id"])
        assert target["quantity"] == 7.0
        assert isinstance(target.get("versions"), list)
        assert len(target["versions"]) >= 1
        assert target["versions"][0]["data"]["quantity"] == 5.5

        # soft delete
        r = requests.delete(f"{API}/deliveries/{d1['id']}", headers=h)
        assert r.status_code == 200
        # not in list
        listed = requests.get(f"{API}/deliveries", headers=h, params={"customer_id": seed_ids["customer_id"]}).json()
        assert all(x["id"] != d1["id"] for x in listed)

        # in trash
        trash = requests.get(f"{API}/deliveries/trash", headers=h).json()
        assert any(x["id"] == d1["id"] for x in trash)

        # restore
        r = requests.post(f"{API}/deliveries/{d1['id']}/restore", headers=h)
        assert r.status_code == 200
        listed = requests.get(f"{API}/deliveries", headers=h, params={"customer_id": seed_ids["customer_id"]}).json()
        assert any(x["id"] == d1["id"] for x in listed)

        # clean up
        requests.delete(f"{API}/deliveries/{d1['id']}", headers=h)
        # delete the second duplicate too
        listed_all = requests.get(f"{API}/deliveries", headers=h, params={"customer_id": seed_ids["customer_id"]}).json()
        for x in listed_all:
            requests.delete(f"{API}/deliveries/{x['id']}", headers=h)


# -------------------- Dashboard --------------------
class TestDashboard:
    def test_dashboard_shape(self, admin_headers):
        r = requests.get(f"{API}/dashboard", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        for k in [
            "today_deliveries", "today_quantity", "today_customers",
            "monthly_deliveries", "monthly_quantity",
            "top_customers", "top_products", "daily_analytics",
        ]:
            assert k in d
        assert isinstance(d["daily_analytics"], list)
        assert len(d["daily_analytics"]) == 7


# -------------------- Reports --------------------
class TestReports:
    def test_customer_summary(self, admin_headers):
        r = requests.get(f"{API}/reports/customer-summary", headers=admin_headers,
                         params={"date_from": "2020-01-01", "date_to": "2099-01-01"})
        assert r.status_code == 200
        body = r.json()
        assert "rows" in body and "total_quantity" in body and "count" in body

    def test_driver_summary(self, admin_headers):
        r = requests.get(f"{API}/reports/driver-summary", headers=admin_headers)
        assert r.status_code == 200
        assert "rows" in r.json()

    def test_product_summary(self, admin_headers):
        r = requests.get(f"{API}/reports/product-summary", headers=admin_headers)
        assert r.status_code == 200
        assert "rows" in r.json()


# -------------------- Audit logs --------------------
class TestAudit:
    def test_audit_admin_only(self, user_headers):
        r = requests.get(f"{API}/audit-logs", headers=user_headers)
        assert r.status_code == 403

    def test_audit_admin_ok(self, admin_headers):
        r = requests.get(f"{API}/audit-logs", headers=admin_headers)
        assert r.status_code == 200
        logs = r.json()
        assert isinstance(logs, list)
        # at least login action should exist from earlier
        actions = {log.get("action") for log in logs}
        assert "login" in actions


# -------------------- Settings --------------------
class TestSettings:
    def test_get_settings(self, user_headers):
        r = requests.get(f"{API}/settings", headers=user_headers)
        assert r.status_code == 200
        s = r.json()
        assert s["id"] == "global"
        assert "business_name" in s
        assert "_id" not in s

    def test_update_settings_admin(self, admin_headers):
        # capture original
        original = requests.get(f"{API}/settings", headers=admin_headers).json()
        new_name = f"Kushan.Ji Test {uuid.uuid4().hex[:4]}"
        r = requests.put(f"{API}/settings", headers=admin_headers,
                         json={"business_name": new_name, "default_unit": "kg",
                               "default_products": ["Sev", "Bhujia"]})
        assert r.status_code == 200
        assert r.json()["business_name"] == new_name
        # restore
        requests.put(f"{API}/settings", headers=admin_headers,
                     json={"business_name": original["business_name"],
                           "default_unit": original.get("default_unit", "kg"),
                           "default_products": original.get("default_products", [])})

    def test_update_settings_non_admin_forbidden(self, user_headers):
        r = requests.put(f"{API}/settings", headers=user_headers, json={"business_name": "Hack"})
        assert r.status_code == 403
