import requests

BASE_URL = "http://localhost:8000"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "adminpass"
TIMEOUT = 30

def test_admin_logout_clears_session_cookie():
    session = requests.Session()
    login_url = f"{BASE_URL}/auth/admin-login"
    logout_url = f"{BASE_URL}/auth/logout"
    login_payload = {
        "username": ADMIN_USERNAME,
        "password": ADMIN_PASSWORD
    }
    headers = {"Content-Type": "application/json"}

    try:
        # Login as admin
        login_resp = session.post(login_url, json=login_payload, headers=headers, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Admin login failed with status {login_resp.status_code}"
        assert 'access_token' in session.cookies, "access_token cookie not set after login"

        # Logout
        logout_resp = session.post(logout_url, headers=headers, timeout=TIMEOUT)
        assert logout_resp.status_code == 200, f"Logout failed with status {logout_resp.status_code}"

        # Check cookie cleared: access_token should be expired or removed
        cookie = session.cookies.get('access_token')
        assert cookie is None or cookie == "", "access_token cookie was not cleared on logout"

    finally:
        session.close()


test_admin_logout_clears_session_cookie()
