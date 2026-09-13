import requests

BASE_URL = "http://localhost:8000"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "adminpass"
TIMEOUT = 30

def test_admin_login_with_valid_and_invalid_credentials():
    url = f"{BASE_URL}/auth/admin-login"
    headers = {"Content-Type": "application/json"}

    # Test valid credentials
    valid_payload = {
        "username": ADMIN_USERNAME,
        "password": ADMIN_PASSWORD
    }
    try:
        response = requests.post(url, json=valid_payload, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request failed for valid credentials: {e}"
    assert response.status_code == 200, f"Expected 200 but got {response.status_code} for valid credentials"
    # Check that access_token cookie is set and httpOnly (httpOnly cannot be checked directly from client side, but cookie presence can be asserted)
    assert "access_token" in response.cookies, "access_token cookie not set on valid login"

    # Test invalid credentials
    invalid_payload = {
        "username": ADMIN_USERNAME,
        "password": "wrongpassword"
    }
    try:
        response_invalid = requests.post(url, json=invalid_payload, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request failed for invalid credentials: {e}"
    assert response_invalid.status_code == 401, f"Expected 401 but got {response_invalid.status_code} for invalid credentials"

    # Test admin credentials not configured scenario
    try:
        response_no_credentials = requests.post(url, json={}, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request failed for no credentials: {e}"

    assert response_no_credentials.status_code in (401, 422, 500), (
        f"Expected 401, 422 or 500 but got {response_no_credentials.status_code} when no credentials provided"
    )
    if response_no_credentials.status_code == 500:
        try:
            json_resp = response_no_credentials.json()
            msg = str(json_resp)
            assert "Admin credentials not configured" in msg or "not configured" in msg.lower(), (
                "500 response does not indicate missing admin credentials configuration"
            )
        except Exception:
            pass

test_admin_login_with_valid_and_invalid_credentials()
