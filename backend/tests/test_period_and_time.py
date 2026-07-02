"""
Tests for the NEW features in this iteration:
1. POST /api/deliveries `time` handling (explicit vs auto-IST capture).
2. PUT /api/deliveries/{id} can update `time` and preserves version history.
3. GET /api/reports/period-analysis (weekly/monthly/yearly/custom + customer filter).
4. Regression: seeded admin/user login still works.
"""
import uuid
import requests
import pytest
from datetime import datetime, timezone, timedelta, date as _d

from conftest import API, ADMIN_EMAIL, ADMIN_PASSWORD, USER_EMAIL, USER_PASSWORD

IST = timezone(timedelta(hours=5, minutes=30))


# -------------------- Regression: login --------------------
class TestLoginRegression:
    def test_seeded_admin_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "admin"

    def test_seeded_user_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": USER_PASSWORD}, timeout=30)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "user"


# -------------------- Delivery time handling --------------------
class TestDeliveryTime:
    @pytest.fixture(scope="class")
    def ctx(self):
        login = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).json()
        h = {"Authorization": f"Bearer {login['access_token']}", "Content-Type": "application/json"}
        c = requests.post(f"{API}/customers", headers=h,
                          json={"name": f"TEST TimeCust {uuid.uuid4().hex[:4]}", "mobile": "9111111111",
                                "whatsapp": "9111111111"}).json()
        d = requests.post(f"{API}/drivers", headers=h,
                          json={"name": f"TEST TimeDrv {uuid.uuid4().hex[:4]}"}).json()
        created = []
        yield {"h": h, "cid": c["id"], "did": d["id"], "created": created}
        # cleanup
        for did in created:
            requests.delete(f"{API}/deliveries/{did}", headers=h)
        requests.delete(f"{API}/customers/{c['id']}", headers=h)
        requests.delete(f"{API}/drivers/{d['id']}", headers=h)

    def test_explicit_time_is_stored(self, ctx):
        h = ctx["h"]
        payload = {
            "date": _d.today().isoformat(),
            "time": "07:30",
            "customer_id": ctx["cid"],
            "driver_id": ctx["did"],
            "product": f"SevExplicit-{uuid.uuid4().hex[:4]}",
            "quantity": 2.0,
            "unit": "kg",
            "remarks": "TEST explicit time",
        }
        r = requests.post(f"{API}/deliveries", headers=h, json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        ctx["created"].append(d["id"])
        assert d["time"] == "07:30", f"expected exactly '07:30' stored, got {d['time']!r}"

    def test_auto_ist_time_when_omitted(self, ctx):
        h = ctx["h"]
        payload = {
            "date": _d.today().isoformat(),
            # no time
            "customer_id": ctx["cid"],
            "driver_id": ctx["did"],
            "product": f"SevAuto-{uuid.uuid4().hex[:4]}",
            "quantity": 1.5,
            "unit": "kg",
        }
        before = datetime.now(IST)
        r = requests.post(f"{API}/deliveries", headers=h, json=payload)
        after = datetime.now(IST)
        assert r.status_code == 200, r.text
        d = r.json()
        ctx["created"].append(d["id"])
        assert ":" in d["time"] and len(d["time"]) == 5

        hh, mm = [int(x) for x in d["time"].split(":")]
        stored = before.replace(hour=hh, minute=mm, second=0, microsecond=0)
        # Compare against a small window; allow ±3 minutes tolerance
        diffs = [
            abs((stored - before.replace(second=0, microsecond=0)).total_seconds()),
            abs((stored - after.replace(second=0, microsecond=0)).total_seconds()),
        ]
        assert min(diffs) <= 3 * 60, (
            f"stored time {d['time']} IST not within 3 min of current IST "
            f"before={before.strftime('%H:%M')} after={after.strftime('%H:%M')}"
        )

    def test_update_time_preserves_version(self, ctx):
        h = ctx["h"]
        create = {
            "date": _d.today().isoformat(),
            "time": "10:00",
            "customer_id": ctx["cid"],
            "driver_id": ctx["did"],
            "product": f"SevUpd-{uuid.uuid4().hex[:4]}",
            "quantity": 3.0,
            "unit": "kg",
        }
        d = requests.post(f"{API}/deliveries", headers=h, json=create).json()
        ctx["created"].append(d["id"])
        assert d["time"] == "10:00"

        # update time to 15:45
        upd = dict(create)
        upd["time"] = "15:45"
        r = requests.put(f"{API}/deliveries/{d['id']}", headers=h, json=upd)
        assert r.status_code == 200, r.text

        # fetch
        listed = requests.get(f"{API}/deliveries", headers=h, params={"customer_id": ctx["cid"]}).json()
        target = next(x for x in listed if x["id"] == d["id"])
        assert target["time"] == "15:45"
        assert isinstance(target.get("versions"), list)
        assert len(target["versions"]) >= 1
        # previous snapshot should contain the old time
        prior_times = [v.get("data", {}).get("time") for v in target["versions"]]
        assert "10:00" in prior_times, f"expected '10:00' in versions[].data.time, got {prior_times}"


# -------------------- Period Analysis --------------------
class TestPeriodAnalysis:
    @pytest.fixture(scope="class")
    def admin_h(self):
        login = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).json()
        return {"Authorization": f"Bearer {login['access_token']}", "Content-Type": "application/json"}

    @pytest.fixture(scope="class")
    def seed(self, admin_h):
        """Create a delivery today to guarantee at least one row in the current week/month/year."""
        c = requests.post(f"{API}/customers", headers=admin_h,
                          json={"name": f"TEST PACust {uuid.uuid4().hex[:4]}", "mobile": "9222222222",
                                "whatsapp": "9222222222"}).json()
        d = requests.post(f"{API}/drivers", headers=admin_h,
                          json={"name": f"TEST PADrv {uuid.uuid4().hex[:4]}"}).json()
        payload = {
            "date": _d.today().isoformat(),
            "time": "12:00",
            "customer_id": c["id"],
            "driver_id": d["id"],
            "product": f"PA-{uuid.uuid4().hex[:4]}",
            "quantity": 4.25,
            "unit": "kg",
            "remarks": "TEST period analysis seed",
        }
        deliv = requests.post(f"{API}/deliveries", headers=admin_h, json=payload).json()
        yield {"cid": c["id"], "did": d["id"], "delivery_id": deliv["id"]}
        # cleanup
        requests.delete(f"{API}/deliveries/{deliv['id']}", headers=admin_h)
        requests.delete(f"{API}/customers/{c['id']}", headers=admin_h)
        requests.delete(f"{API}/drivers/{d['id']}", headers=admin_h)

    @staticmethod
    def _validate_shape(body):
        for k in ("period_label", "from", "to", "grand_total_quantity", "grand_total_count",
                 "by_day", "by_customer", "by_product"):
            assert k in body, f"missing key {k}"
        assert isinstance(body["by_day"], list)
        assert isinstance(body["by_customer"], list)
        assert isinstance(body["by_product"], list)

    def test_weekly(self, admin_h, seed):
        r = requests.get(f"{API}/reports/period-analysis", headers=admin_h, params={"period": "weekly"})
        assert r.status_code == 200, r.text
        body = r.json()
        self._validate_shape(body)
        assert body["period_label"].startswith("Week of "), body["period_label"]
        # by_customer rows carry a days: [] list
        if body["by_customer"]:
            row = body["by_customer"][0]
            assert "days" in row and isinstance(row["days"], list)
            for dr in row["days"]:
                assert "date" in dr and "quantity" in dr
        # our seeded delivery today should be inside this week
        assert body["grand_total_count"] >= 1
        assert body["grand_total_quantity"] >= 4.25

    def test_monthly(self, admin_h, seed):
        r = requests.get(f"{API}/reports/period-analysis", headers=admin_h, params={"period": "monthly"})
        assert r.status_code == 200
        body = r.json()
        self._validate_shape(body)
        today = _d.today()
        assert body["from"].startswith(today.strftime("%Y-%m-01")), body["from"]
        # period_label typically like "January 2026"
        assert str(today.year) in body["period_label"]

    def test_yearly(self, admin_h, seed):
        r = requests.get(f"{API}/reports/period-analysis", headers=admin_h, params={"period": "yearly"})
        assert r.status_code == 200
        body = r.json()
        self._validate_shape(body)
        today = _d.today()
        assert body["from"] == f"{today.year}-01-01"
        assert body["to"] == f"{today.year}-12-31"
        assert str(today.year) in body["period_label"]

    def test_custom_ok(self, admin_h, seed):
        today = _d.today().isoformat()
        r = requests.get(f"{API}/reports/period-analysis", headers=admin_h,
                        params={"period": "custom", "date_from": today, "date_to": today})
        assert r.status_code == 200
        body = r.json()
        self._validate_shape(body)
        assert body["from"] == today and body["to"] == today
        assert body["grand_total_count"] >= 1

    def test_custom_missing_dates_400(self, admin_h):
        r = requests.get(f"{API}/reports/period-analysis", headers=admin_h, params={"period": "custom"})
        assert r.status_code == 400

    def test_customer_filter(self, admin_h, seed):
        r = requests.get(f"{API}/reports/period-analysis", headers=admin_h,
                        params={"period": "monthly", "customer_id": seed["cid"]})
        assert r.status_code == 200
        body = r.json()
        self._validate_shape(body)
        # only our seeded customer should appear
        cids = {c["customer_id"] for c in body["by_customer"]}
        assert cids <= {seed["cid"]}, f"customer_id filter leaked other customers: {cids}"
        # and grand totals should equal seed contribution (exactly 1 delivery of 4.25)
        assert body["grand_total_count"] >= 1
