import requests

BASE_URL = "http://localhost:8000"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "adminpass"
TIMEOUT = 30

def test_admin_retention_cleanup_dry_run_and_execute_modes():
    session = requests.Session()
    login_url = f"{BASE_URL}/auth/admin-login"
    retention_url = f"{BASE_URL}/admin/retention/cleanup"
    
    # Login as admin to get session cookie
    login_payload = {"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
    login_response = session.post(login_url, json=login_payload, timeout=TIMEOUT)
    assert login_response.status_code == 200, f"Admin login failed: {login_response.text}"
    
    # Dry-run mode retention cleanup (should return docs eligible without deleting)
    dry_run_payload = {"mode": "dry-run"}
    dry_run_response = session.post(retention_url, json=dry_run_payload, timeout=TIMEOUT)
    assert dry_run_response.status_code == 200, f"Dry-run retention cleanup failed: {dry_run_response.text}"
    dry_run_data = dry_run_response.json()
    # Assert response contains indication of documents eligible for purge
    assert isinstance(dry_run_data, dict), "Dry-run response is not a JSON object"
    assert "documents_eligible_for_purge" in dry_run_data or "message" in dry_run_data, (
        "Dry-run response missing expected keys"
    )
    
    # Execute mode retention cleanup with required confirmation header
    execute_payload = {"mode": "execute"}
    headers = {"X-Confirm-Retention-Cleanup": "true"}
    execute_response = session.post(retention_url, json=execute_payload, headers=headers, timeout=TIMEOUT)
    assert execute_response.status_code == 200, f"Execute retention cleanup failed: {execute_response.text}"
    execute_data = execute_response.json()
    assert isinstance(execute_data, dict), "Execute response is not a JSON object"
    # Expect a success message or status in response indicating purge completed
    assert "message" in execute_data or "status" in execute_data, (
        "Execute response missing expected keys"
    )
    
    # Logout to clear session
    logout_response = session.post(f"{BASE_URL}/auth/logout", timeout=TIMEOUT)
    assert logout_response.status_code == 200, f"Admin logout failed: {logout_response.text}"

test_admin_retention_cleanup_dry_run_and_execute_modes()