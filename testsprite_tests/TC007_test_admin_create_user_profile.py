import requests

BASE_URL = "http://localhost:8000"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "adminpass"
TIMEOUT = 30

def test_admin_create_user_profile():
    session = requests.Session()
    try:
        # Authenticate as admin to get session cookie
        login_payload = {"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        login_response = session.post(
            f"{BASE_URL}/auth/admin-login",
            json=login_payload,
            timeout=TIMEOUT,
        )
        assert login_response.status_code == 200, f"Admin login failed: {login_response.text}"
        assert "access_token" in login_response.cookies, "access_token cookie not set after login"

        # Prepare user profile creation payload
        # As no schema details for user creation data given, create minimal required valid data
        user_profile_payload = {
            "name": "Test User",
            "vehicle_reg_no": "TEST1234",
            "metadata": {"email": "testuser@example.com", "phone": "1234567890"}
        }

        # Make the POST request to create user profile
        create_response = session.post(
            f"{BASE_URL}/admin/user/create",
            json=user_profile_payload,
            timeout=TIMEOUT,
        )
        assert create_response.status_code == 200, f"Failed to create user profile: {create_response.text}"
        resp_json = create_response.json()
        # StatusResponse assumed to have "status" or similar key; check status exists and is success
        assert isinstance(resp_json, dict), "Response is not a JSON object"
        # If StatusResponse schema not defined explicitly, we at least confirm presence of success indication
        assert "status" in resp_json or "message" in resp_json or "detail" in resp_json, \
            "Response JSON does not have expected keys for StatusResponse"

    finally:
        # Clean up: delete created user profile to avoid pollution
        # Delete endpoint: DELETE /admin/user/{vehicle_reg_no}
        delete_response = session.delete(
            f"{BASE_URL}/admin/user/{user_profile_payload['vehicle_reg_no']}",
            timeout=TIMEOUT,
        )
        # Delete should succeed or user may not exist if creation failed, so no assert here
        # Just ignore delete errors silently

test_admin_create_user_profile()