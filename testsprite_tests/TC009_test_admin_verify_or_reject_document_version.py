import requests
import uuid
import time

BASE_URL = "http://localhost:8000"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "adminpass"
TIMEOUT = 30


def test_admin_verify_or_reject_document_version():
    session = requests.Session()

    try:
        # Step 1: Admin login to get session cookie
        login_resp = session.post(
            f"{BASE_URL}/auth/admin-login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
            timeout=TIMEOUT,
        )
        assert login_resp.status_code == 200, f"Admin login failed: {login_resp.text}"

        # Step 2: Create a user profile to upload a document and get doc_id (resource IDs)
        vehicle_reg_no = f"TEST-{uuid.uuid4().hex[:8].upper()}"
        user_data = {
            "name": "Test User",
            "vehicle_reg_no": vehicle_reg_no,
            "metadata": {"info": "test profile"},
            "documents": [
                {
                    "filename": "test-doc.pdf",
                    "content": "JVBERi0xLjQKJcfs...",  # base64 dummy content placeholder or empty
                    "content_type": "application/pdf"
                }
            ],
        }
        # Since the API requires PDF/JPEG/PNG binary files and no explicit documents upload fields schema,
        # we interpret that user registration documents are files. We'll simulate the register call using multipart.

        # Prepare multipart files and data
        files = {
            "documents": (
                "test-doc.pdf",
                b"%PDF-1.4\n%dummy pdf content\n%%EOF",
                "application/pdf",
            )
        }
        data = {
            "name": user_data["name"],
            "vehicle_reg_no": vehicle_reg_no,
            "metadata": '{"info":"test profile"}',
        }
        register_resp = requests.post(
            f"{BASE_URL}/users/register",
            data=data,
            files=files,
            timeout=TIMEOUT,
        )
        assert register_resp.status_code == 200, f"User registration failed: {register_resp.text}"

        # Step 3: Admin login again to have cookie (since previous is separate session)
        session = requests.Session()
        login_resp = session.post(
            f"{BASE_URL}/auth/admin-login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
            timeout=TIMEOUT,
        )
        assert login_resp.status_code == 200, f"Admin login failed: {login_resp.text}"

        # Step 4: Get documents for the user to obtain a doc_id
        user_detail_resp = session.get(
            f"{BASE_URL}/admin/user/{vehicle_reg_no}",
            timeout=TIMEOUT,
        )
        assert user_detail_resp.status_code == 200, f"Failed to get user detail: {user_detail_resp.text}"
        user_detail = user_detail_resp.json()
        # Find a document id from user's documents (should exist)
        documents = user_detail.get("documents", [])
        assert documents, "No documents found for new user"

        # Each document may have multiple versions; pick the first document's first version doc_id
        # The PRD doesn't specify exact JSON structure of documents, but we expect doc_id
        doc_id = None
        for doc in documents:
            # doc expected fields: id, versions, etc.
            doc_id = doc.get("id")
            if doc_id:
                break
        assert doc_id, "Document ID not found"

        # Step 5: Verify document version by approving it
        verify_payload = {
            "decision": "approved",  # or "rejected"
            "reason": "Verified successfully"
        }
        verify_resp = session.post(
            f"{BASE_URL}/admin/user/{vehicle_reg_no}/documents/{doc_id}/verify",
            json=verify_payload,
            timeout=TIMEOUT,
        )
        assert verify_resp.status_code == 200, f"Document verify approval failed: {verify_resp.text}"
        verify_result = verify_resp.json()
        assert verify_result.get("status") in ["approved", "rejected"], "Verification response status invalid"

        # Step 6: Test rejection of the same document version
        verify_payload_reject = {
            "decision": "rejected",
            "reason": "Verification failed due to missing info"
        }
        verify_resp_reject = session.post(
            f"{BASE_URL}/admin/user/{vehicle_reg_no}/documents/{doc_id}/verify",
            json=verify_payload_reject,
            timeout=TIMEOUT,
        )
        assert verify_resp_reject.status_code == 200, f"Document verify rejection failed: {verify_resp_reject.text}"
        verify_result_reject = verify_resp_reject.json()
        assert verify_result_reject.get("status") in ["approved", "rejected"], "Verification response status invalid"

    finally:
        # Cleanup: Delete the user profile created for test
        try:
            # Need admin authenticated session for delete
            session = requests.Session()
            login_resp = session.post(
                f"{BASE_URL}/auth/admin-login",
                json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
                timeout=TIMEOUT,
            )
            if login_resp.status_code == 200:
                del_resp = session.delete(
                    f"{BASE_URL}/admin/user/{vehicle_reg_no}",
                    timeout=TIMEOUT,
                )
                # Don't assert here to avoid masking earlier errors
        except Exception:
            pass


test_admin_verify_or_reject_document_version()
