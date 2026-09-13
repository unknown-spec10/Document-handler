import requests
import uuid
import io

BASE_URL = "http://localhost:8000"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "adminpass"
TIMEOUT = 30

def test_admin_upload_new_document_version():
    session = requests.Session()

    # Authenticate as admin to get access_token cookie
    login_resp = session.post(
        f"{BASE_URL}/auth/admin-login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
        timeout=TIMEOUT
    )
    assert login_resp.status_code == 200, f"Admin login failed: {login_resp.text}"
    assert "access_token" in login_resp.cookies or "access_token" in session.cookies, "access_token cookie not set"

    # Create a new user profile so we have a vehicle_reg_no to upload to
    vehicle_reg_no = f"TEST{uuid.uuid4().hex[:8].upper()}"
    user_create_payload = {
        "name": "Test User Upload Doc",
        "vehicle_reg_no": vehicle_reg_no,
        "metadata": {"note": "profile created for document upload version test"}
    }
    create_user_resp = session.post(
        f"{BASE_URL}/admin/user/create",
        json=user_create_payload,
        timeout=TIMEOUT
    )
    assert create_user_resp.status_code == 200, f"User creation failed: {create_user_resp.text}"

    try:
        # Prepare a file-like object for uploading
        file_content = b"%PDF-1.4 Test PDF content new version"
        files = {
            "file": ("testdoc_v2.pdf", io.BytesIO(file_content), "application/pdf")
        }

        # Upload new document version for vehicle_reg_no
        upload_resp = session.post(
            f"{BASE_URL}/admin/user/{vehicle_reg_no}/upload",
            files=files,
            timeout=TIMEOUT
        )
        assert upload_resp.status_code == 200, f"Upload new doc version failed: {upload_resp.text}"

        # After upload, get version history to confirm new version presence
        # Assuming doc_type is required, we need to find or specify document type.
        # Since PRD has no direct info about document types, try common doc_type 'kyc' or 'pdf'
        # We'll try 'kyc' first; if fails, try 'pdf'; else rely on just first doc_type found.
        doc_type = "kyc"

        history_resp = session.get(
            f"{BASE_URL}/admin/user/{vehicle_reg_no}/history/{doc_type}",
            timeout=TIMEOUT
        )
        if history_resp.status_code == 404:
            # If no history for that doc_type, try 'pdf'
            doc_type = "pdf"
            history_resp = session.get(
                f"{BASE_URL}/admin/user/{vehicle_reg_no}/history/{doc_type}",
                timeout=TIMEOUT
            )
        assert history_resp.status_code == 200, f"Failed to get version history: {history_resp.text}"

        history_json = history_resp.json()
        assert isinstance(history_json, list), "Version history response is not a list"

        # Confirm at least one document version exists with the new uploaded filename or content type
        found_new_version = False
        for doc_version in history_json:
            # Check if document matches our upload - type, filename or similar
            # The PRD does not specify document schema, so check keys to confirm presence
            if "filename" in doc_version and "testdoc_v2.pdf" in doc_version["filename"]:
                found_new_version = True
                break
            # If filename not present, fallback to check content-type or timestamp if available
            if "content_type" in doc_version and doc_version["content_type"] == "application/pdf":
                found_new_version = True
                break

        assert found_new_version, "Uploaded document version not found in version history"

    finally:
        # Cleanup: delete the created user and associated documents to avoid residue
        delete_resp = session.delete(
            f"{BASE_URL}/admin/user/{vehicle_reg_no}",
            timeout=TIMEOUT
        )
        assert delete_resp.status_code == 200, f"Cleanup delete user failed: {delete_resp.text}"

test_admin_upload_new_document_version()