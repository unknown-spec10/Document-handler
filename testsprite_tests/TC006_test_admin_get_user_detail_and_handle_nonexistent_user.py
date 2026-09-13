import requests

BASE_URL = "http://localhost:8000"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "adminpass"
TIMEOUT = 30


def test_admin_get_user_detail_and_handle_nonexistent_user():
    session = requests.Session()

    # Admin login to get access_token cookie
    login_payload = {"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
    login_resp = session.post(
        f"{BASE_URL}/auth/admin-login",
        json=login_payload,
        timeout=TIMEOUT,
    )
    assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"

    # Create a new user with POST /admin/user/create (because we need existing user to test GET detail)
    new_vehicle_reg_no = "TESTREG123"
    new_user_data = {
        "name": "Test User",
        "vehicle_reg_no": new_vehicle_reg_no,
        "metadata": {"test": "metadata"},
        "documents": []
    }
    try:
        create_resp = session.post(
            f"{BASE_URL}/admin/user/create",
            json=new_user_data,
            timeout=TIMEOUT,
        )
        assert create_resp.status_code == 200, f"User creation failed with status {create_resp.status_code}"

        # Test GET /admin/user/{vehicle_reg_no} for existing user
        get_existing_resp = session.get(
            f"{BASE_URL}/admin/user/{new_vehicle_reg_no}",
            timeout=TIMEOUT,
        )
        assert get_existing_resp.status_code == 200, f"Expected 200 for existing user, got {get_existing_resp.status_code}"
        data = get_existing_resp.json()
        # Validate that response contains expected keys for user details and presigned document links
        assert "vehicle_reg_no" in data and data["vehicle_reg_no"] == new_vehicle_reg_no
        assert "documents" in data and isinstance(data["documents"], list)

        # Test GET /admin/user/{vehicle_reg_no} for non-existent user
        nonexistent_reg_no = "NONEXISTENT123"
        get_nonexistent_resp = session.get(
            f"{BASE_URL}/admin/user/{nonexistent_reg_no}",
            timeout=TIMEOUT,
        )
        assert get_nonexistent_resp.status_code == 404, f"Expected 404 for non-existent user, got {get_nonexistent_resp.status_code}"

    finally:
        # Cleanup: delete the created user
        delete_resp = session.delete(
            f"{BASE_URL}/admin/user/{new_vehicle_reg_no}",
            timeout=TIMEOUT,
        )
        # Accept either 200 or 404 if already deleted
        assert delete_resp.status_code in (200, 404)


test_admin_get_user_detail_and_handle_nonexistent_user()