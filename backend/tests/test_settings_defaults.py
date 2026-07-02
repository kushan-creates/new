"""
Focused tests for /api/settings default_unit + default_products persistence.
Verifies the (backend part of the) fix requested in the review.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://delivery-sync-pro.preview.emergentagent.com").rstrip("/")
ADMIN = {"email": "admin@kushanji.com", "password": "Admin@123"}


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def original_settings(admin_headers):
    r = requests.get(f"{BASE_URL}/api/settings", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    return r.json()


class TestSettingsBundleDefault:
    def test_put_bundle_and_mix_namkeen(self, admin_headers):
        body = {
            "default_unit": "bundle",
            "default_products": ["Mix Namkeen", "Sev", "Bhujia"],
            "business_name": "Kushan.Ji Namkeen",
        }
        r = requests.put(f"{BASE_URL}/api/settings", headers=admin_headers, json=body, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("default_unit") == "bundle"
        assert data.get("default_products") == ["Mix Namkeen", "Sev", "Bhujia"]

    def test_get_returns_persisted_values(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/settings", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("default_unit") == "bundle"
        assert data.get("default_products") == ["Mix Namkeen", "Sev", "Bhujia"]

    def test_switch_to_boxes_and_namkeen_combo(self, admin_headers):
        body = {
            "default_unit": "boxes",
            "default_products": ["Namkeen Combo", "Sev"],
            "business_name": "Kushan.Ji Namkeen",
        }
        r = requests.put(f"{BASE_URL}/api/settings", headers=admin_headers, json=body, timeout=15)
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/settings", headers=admin_headers, timeout=15)
        assert r2.status_code == 200
        d = r2.json()
        assert d["default_unit"] == "boxes"
        assert d["default_products"] == ["Namkeen Combo", "Sev"]


class TestDeliveryPersistsBundleUnit:
    """Save a delivery with unit='bundle' and product='Mix Namkeen', verify it persists."""

    created_id = None
    cust_id = None
    drv_id = None

    def test_setup_bundle_settings(self, admin_headers):
        body = {
            "default_unit": "bundle",
            "default_products": ["Mix Namkeen", "Sev", "Bhujia"],
            "business_name": "Kushan.Ji Namkeen",
        }
        r = requests.put(f"{BASE_URL}/api/settings", headers=admin_headers, json=body, timeout=15)
        assert r.status_code == 200

    def test_seed_customer_and_driver(self, admin_headers):
        c = requests.post(f"{BASE_URL}/api/customers", headers=admin_headers,
                          json={"name": "TEST_BundleCust", "phone": "9990001111"}, timeout=15)
        assert c.status_code in (200, 201)
        TestDeliveryPersistsBundleUnit.cust_id = c.json()["id"]

        d = requests.post(f"{BASE_URL}/api/drivers", headers=admin_headers,
                          json={"name": "TEST_BundleDrv", "phone": "9990002222"}, timeout=15)
        assert d.status_code in (200, 201)
        TestDeliveryPersistsBundleUnit.drv_id = d.json()["id"]

    def test_create_delivery_with_bundle(self, admin_headers):
        payload = {
            "date": "2026-01-15",
            "time": "10:00",
            "customer_id": self.cust_id,
            "driver_id": self.drv_id,
            "product": "Mix Namkeen",
            "quantity": 1,
            "unit": "bundle",
            "remarks": "TEST_bundle_qty",
        }
        r = requests.post(f"{BASE_URL}/api/deliveries", headers=admin_headers, json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        j = r.json()
        assert j["unit"] == "bundle"
        assert j["product"] == "Mix Namkeen"
        assert float(j["quantity"]) == 1.0
        TestDeliveryPersistsBundleUnit.created_id = j["id"]

    def test_get_delivery_verifies_persistence(self, admin_headers):
        # Fetch full deliveries list and locate the created id
        r = requests.get(f"{BASE_URL}/api/deliveries", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        items = r.json()
        # items may be list or {items: [...]}
        rows = items if isinstance(items, list) else items.get("items", [])
        match = next((d for d in rows if d.get("id") == self.created_id), None)
        assert match is not None, "created delivery not returned in list"
        assert match["unit"] == "bundle"
        assert match["product"] == "Mix Namkeen"

    def test_cleanup(self, admin_headers):
        if self.created_id:
            requests.delete(f"{BASE_URL}/api/deliveries/{self.created_id}", headers=admin_headers, timeout=15)
        if self.cust_id:
            requests.delete(f"{BASE_URL}/api/customers/{self.cust_id}", headers=admin_headers, timeout=15)
        if self.drv_id:
            requests.delete(f"{BASE_URL}/api/drivers/{self.drv_id}", headers=admin_headers, timeout=15)


class TestRestoreSafeDefaults:
    """Restore known-safe defaults after all tests."""

    def test_restore_defaults(self, admin_headers):
        body = {
            "default_unit": "kg",
            "default_products": ["Sev", "Bhujia", "Gathiya", "Chana Dal", "Mixture", "Papdi"],
            "business_name": "Kushan.Ji Namkeen",
        }
        r = requests.put(f"{BASE_URL}/api/settings", headers=admin_headers, json=body, timeout=15)
        assert r.status_code == 200
        assert r.json()["default_unit"] == "kg"
