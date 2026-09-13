import requests

BASE_URL = "http://localhost:8000"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "adminpass"
TIMEOUT = 30

def test_admin_search_users_with_and_without_authentication():
    session = requests.Session()
    login_url = f"{BASE_URL}/auth/admin-login"
    search_url = f"{BASE_URL}/admin/search"

    # Step 1: Authenticate as admin and get the session cookie
    login_payload = {
        "username": ADMIN_USERNAME,
        "password": ADMIN_PASSWORD
    }
    try:
        login_resp = session.post(login_url, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Admin login failed, status code: {login_resp.status_code}"
        assert 'access_token' in login_resp.cookies, "access_token cookie not set after login"
    except requests.RequestException as e:
        assert False, f"Admin login request failed: {e}"

    # Step 2: Call GET /admin/search with admin cookie, expect 200 and paginated user results
    try:
        search_resp = session.get(search_url, timeout=TIMEOUT)
        assert search_resp.status_code == 200, f"Authorized /admin/search request failed, status code: {search_resp.status_code}"
        data = search_resp.json()
        # Basic checks for pagination keys in response (typical paginated response)
        assert isinstance(data, dict), "Response is not a JSON object"
        assert 'items' in data and isinstance(data['items'], list), "Response missing 'items' list"
        assert 'total' in data and isinstance(data['total'], int), "Response missing 'total' count"
    except (requests.RequestException, ValueError) as e:
        assert False, f"Authorized /admin/search request error: {e}"

    # Step 3: Call GET /admin/search without authentication, expect 401 Unauthorized
    try:
        resp_no_auth = requests.get(search_url, timeout=TIMEOUT)
        assert resp_no_auth.status_code == 401, f"Unauthorized /admin/search request did not return 401, got {resp_no_auth.status_code}"
    except requests.RequestException as e:
        assert False, f"Unauthorized /admin/search request failed: {e}"

test_admin_search_users_with_and_without_authentication()