import io
import asyncio
import hashlib
from datetime import datetime, date, timedelta
from sqlalchemy import select, delete
from fastapi import BackgroundTasks, HTTPException, UploadFile
from starlette.datastructures import Headers

# Import application components
from backend import models, config, s3, schemas
from backend.db import AsyncSessionLocal
from backend.routes.users import upload_documents
from backend.routes.admin import (
    search_users,
    admin_soft_delete_document,
    admin_soft_delete_policy_category,
    admin_delete_user,
    retention_cleanup_job,
    admin_verify_document_integrity,
    admin_upload_user_documents
)

class MockRequest:
    def __init__(self, host="127.0.0.1"):
        self.client = type("Client", (), {"host": host})()
        from starlette.datastructures import Headers
        self.headers = Headers()

mock_request = MockRequest()

UPLOADED_TAGS = {}

# Mock S3 operations to avoid hitting AWS endpoints during automated tests
async def mock_upload_file_to_s3(file_content: bytes, object_key: str, content_type: str, tags: dict = None) -> str:
    global UPLOADED_TAGS
    UPLOADED_TAGS[object_key] = tags
    return object_key

async def mock_generate_presigned_url(object_key: str, expires_in: int = 3600) -> str:
    return f"https://mock-s3-url.com/{object_key}"

async def mock_delete_user_directory_from_s3(vehicle_reg_no: str) -> None:
    pass

async def mock_delete_s3_object(object_key: str) -> None:
    pass

s3.upload_file_to_s3 = mock_upload_file_to_s3
s3.generate_presigned_url = mock_generate_presigned_url
s3.delete_user_directory_from_s3 = mock_delete_user_directory_from_s3
s3.delete_s3_object = mock_delete_s3_object

TEST_REG = "MH12AB1234"
TEST_PHONE = "+919999999999"

async def run_tests():
    print("Starting automated verification for Insurance Policy Document Storing App...")

    async with AsyncSessionLocal() as db:
        # 1. Database Cleanup - ensure reproducible state
        print("Cleaning up database for test registration number...")
        await db.execute(delete(models.AuditLog).where(models.AuditLog.target_reg == TEST_REG))
        await db.execute(delete(models.Document).where(models.Document.vehicle_reg_no == TEST_REG))
        await db.execute(delete(models.User).where(models.User.vehicle_reg_no == TEST_REG))
        await db.commit()

        # 2. Test Case 1: Initial Upload (Version 1 via Public Signup)
        print("\n--- Test Case 1: Initial Upload (v1 via Signup) ---")
        bg_tasks = BackgroundTasks()
        file_v1 = UploadFile(
            filename="my_health_policy.pdf",
            file=io.BytesIO(b"health policy document body version 1 contents here"),
            headers=Headers({"content-type": "application/pdf"})
        )
        
        # Trigger upload / signup
        response = await upload_documents(
            request=mock_request,
            background_tasks=bg_tasks,
            vehicle_reg_no=TEST_REG,
            name="Test User",
            phone_number=TEST_PHONE,
            email="test@example.com",
            doc_types=["health_policy"],
            files=[file_v1],
            policy_start_dates=["2026-06-15"],
            policy_end_dates=["2027-06-15"],
            policy_numbers=["POL-V1-HEALTH"],
            version_notes=["First policy version note"],
            db=db
        )
        
        assert response.status == "success", "Failed to upload document"
        print("Upload success returned.")

        # Query and assert document state
        result = await db.execute(
            select(models.Document).filter(
                models.Document.vehicle_reg_no == TEST_REG,
                models.Document.doc_type == "health_policy"
            )
        )
        docs = result.scalars().all()
        assert len(docs) == 1, f"Expected 1 document, found {len(docs)}"
        doc_v1 = docs[0]
        assert doc_v1.version_number == 1, f"Expected version 1, got {doc_v1.version_number}"
        assert doc_v1.is_latest is True, "Expected version 1 to be latest"
        assert doc_v1.notes.get("version_note") == "First policy version note", "Mismatch in notes"
        assert doc_v1.notes.get("policy_number") == "POL-V1-HEALTH", "Mismatch in policy number"
        assert doc_v1.policy_start_date == date(2026, 6, 15), "Mismatch in policy start date"
        assert doc_v1.policy_end_date == date(2027, 6, 15), "Mismatch in policy end date"
        # Validate retain_until calculation: policy_end_date + 5 years
        expected_retain = date(2027, 6, 15) + timedelta(days=5*365)
        assert doc_v1.retain_until == expected_retain, f"Expected retain_until to be {expected_retain}, got {doc_v1.retain_until}"
        print("Verified Version 1 stored correctly with proper metadata and calculated retain_until.")

        # 3. Test Case 2: Duplicate Upload Block via Admin Upload
        print("\n--- Test Case 2: Duplicate File Upload Check ---")
        file_v1_dup = UploadFile(
            filename="my_health_policy_duplicate.pdf",
            file=io.BytesIO(b"health policy document body version 1 contents here"), # SAME CONTENT
            headers=Headers({"content-type": "application/pdf"})
        )

        try:
            await admin_upload_user_documents(
                vehicle_reg_no=TEST_REG,
                request=mock_request,
                background_tasks=bg_tasks,
                doc_types=["health_policy"],
                files=[file_v1_dup],
                policy_start_dates=["2026-06-15"],
                policy_end_dates=["2027-06-15"],
                policy_numbers=["POL-DUP-HEALTH"],
                version_notes=["Duplicate policy note"],
                db=db,
                _admin="admin"
            )
            assert False, "Expected HTTPException for duplicate file content but none raised."
        except HTTPException as ex:
            assert ex.status_code == 400, f"Expected 400 Bad Request, got {ex.status_code}"
            assert "Duplicate document detected" in ex.detail, f"Expected duplicate warning in exception detail, got: {ex.detail}"
            print("Verified: Duplicate upload blocked with 400 Bad Request.")

        # 4. Test Case 3: Version Increment (Version 2 via Admin Upload)
        print("\n--- Test Case 3: Version Auto-Incrementation ---")
        file_v2 = UploadFile(
            filename="my_health_policy_renewed.pdf",
            file=io.BytesIO(b"health policy document body version 2 different contents here"),
            headers=Headers({"content-type": "application/pdf"})
        )

        response = await admin_upload_user_documents(
            vehicle_reg_no=TEST_REG,
            request=mock_request,
            background_tasks=bg_tasks,
            doc_types=["health_policy"],
            files=[file_v2],
            policy_start_dates=["2027-06-15"],
            policy_end_dates=["2028-06-15"],
            policy_numbers=["POL-V2-HEALTH"],
            version_notes=["Second policy version note - Renewed"],
            db=db,
            _admin="admin"
        )
        
        assert response.status == "success", "Failed to upload v2 document"

        # Check DB docs
        result = await db.execute(
            select(models.Document).filter(
                models.Document.vehicle_reg_no == TEST_REG,
                models.Document.doc_type == "health_policy"
            ).order_by(models.Document.version_number)
        )
        docs = result.scalars().all()
        assert len(docs) == 2, f"Expected 2 documents in history, found {len(docs)}"
        
        # Verify version 1 is demoted
        d1 = docs[0]
        assert d1.version_number == 1
        assert d1.is_latest is False, "Expected version 1 to be set is_latest = False"
        
        # Verify version 2 is latest
        d2 = docs[1]
        assert d2.version_number == 2
        assert d2.is_latest is True, "Expected version 2 to be set is_latest = True"
        assert d2.notes.get("version_note") == "Second policy version note - Renewed"
        assert d2.notes.get("policy_number") == "POL-V2-HEALTH"
        assert d2.policy_start_date == date(2027, 6, 15)
        assert d2.policy_end_date == date(2028, 6, 15)
        print("Verified Version 2 successfully appended. Version 1 is marked inactive (is_latest=False).")

        # 5. Test Case 4: Admin Search Policy Expiration Date Range Filters
        print("\n--- Test Case 4: Admin Expiry Date Range Query ---")
        
        # Query that includes expiry (2028-06-15)
        print("Searching with date range that includes expiry (2027-01-01 to 2028-12-31)...")
        results_in_range = await search_users(
            reg_no=TEST_REG,
            start_date="2027-01-01",
            end_date="2028-12-31",
            db=db,
            _admin="admin"
        )
        assert len(results_in_range.users) == 1, f"Expected 1 test user in results list, got {len(results_in_range.users)}"
        
        # Query that excludes expiry
        print("Searching with date range that excludes expiry (2028-07-01 to 2029-12-31)...")
        results_out_of_range = await search_users(
            reg_no=TEST_REG,
            start_date="2028-07-01",
            end_date="2029-12-31",
            db=db,
            _admin="admin"
        )
        assert len(results_out_of_range.users) == 0, f"Expected 0 results, got {len(results_out_of_range.users)}"
        print("Verified: Admin search correctly filters by latest policy end_date range.")

        # 6. Test Case 5: S3 Upload Tagging Validation
        print("\n--- Test Case 5: S3 Upload Tagging Validation ---")
        # Ensure that the object tags were set during mock S3 upload
        assert d2.s3_key in UPLOADED_TAGS, "S3 key for v2 upload was not found in mock tag registry"
        tags = UPLOADED_TAGS[d2.s3_key]
        assert tags is not None, "Tags were not set"
        assert tags.get("vehicle_reg_no") == TEST_REG, f"Expected tag vehicle_reg_no={TEST_REG}, got {tags.get('vehicle_reg_no')}"
        assert tags.get("doc_type") == "health_policy", f"Expected tag doc_type=health_policy, got {tags.get('doc_type')}"
        assert tags.get("version") == "2", f"Expected tag version=2, got {tags.get('version')}"
        print("Verified: S3 upload tags set correctly for disaster recovery.")

        # 7. Test Case 6: Document Integrity Verification
        print("\n--- Test Case 6: Document Integrity Verification ---")
        # Since we mock S3 client, let's create a temporary mock for the aioboto3 Client
        class MockS3Client:
            async def __aenter__(self):
                return self
            async def __aexit__(self, exc_type, exc_val, exc_tb):
                pass
            async def get_object(self, Bucket, Key):
                if "v2_" in Key:
                    content = b"health policy document body version 2 different contents here"
                else:
                    content = b"health policy document body version 1 contents here"
                async def mock_read(*args, **kwargs):
                    return content
                return {"Body": type("MockBody", (), {"read": mock_read})()}

        class MockSession:
            def client(self, service, **kwargs):
                return MockS3Client()

        original_get_s3_session = s3.get_s3_session
        s3.get_s3_session = lambda: MockSession()

        # Run verification for v2 (Should MATCH)
        print("Running integrity verification for valid v2 document...")
        verify_resp_v2 = await admin_verify_document_integrity(
            vehicle_reg_no=TEST_REG,
            doc_id=d2.id,
            request=mock_request,
            db=db,
            _admin="admin"
        )
        assert verify_resp_v2.status == "verified"
        assert verify_resp_v2.hash_matched is True, "Expected hash to match"
        print("Verified: Document integrity verified successfully (match = True).")

        # Run verification for v1 (Should MATCH too)
        print("Running integrity verification for valid v1 document...")
        verify_resp_v1 = await admin_verify_document_integrity(
            vehicle_reg_no=TEST_REG,
            doc_id=d1.id,
            request=mock_request,
            db=db,
            _admin="admin"
        )
        assert verify_resp_v1.status == "verified"
        assert verify_resp_v1.hash_matched is True, "Expected hash to match"

        # Now test TAMPER detection by altering the DB stored hash for v2 temporarily
        print("Simulating document tampering in DB...")
        original_hash = d2.file_hash
        d2.file_hash = "tampered_fake_hash_value"
        await db.commit()

        print("Running integrity verification for tampered document...")
        verify_resp_tampered = await admin_verify_document_integrity(
            vehicle_reg_no=TEST_REG,
            doc_id=d2.id,
            request=mock_request,
            db=db,
            _admin="admin"
        )
        assert verify_resp_tampered.status == "verified"
        assert verify_resp_tampered.hash_matched is False, "Expected hash mismatch to alert tamper"
        print("Verified: Tamper detection flags altered document successfully.")

        # Restore original hash
        d2.file_hash = original_hash
        await db.commit()

        # Restore s3 session helper
        s3.get_s3_session = original_get_s3_session

        # 8. Test Case 7: Admin Soft-Delete with compliance reason & version promotion check
        print("\n--- Test Case 7: Admin Soft-Delete & Version Promotion ---")
        # Soft delete v2 (which is current latest)
        delete_payload = schemas.AdminSoftDeleteRequest(reason="Compliance cleanup: test soft-delete request")
        delete_resp = await admin_soft_delete_document(
            vehicle_reg_no=TEST_REG,
            doc_id=d2.id,
            payload=delete_payload,
            request=mock_request,
            db=db,
            _admin="admin"
        )
        assert delete_resp.status == "success"
        d1_id = d1.id
        d2_id = d2.id
        db.expire_all()
        res_d1 = await db.execute(select(models.Document).filter(models.Document.id == d1_id))
        d1_updated = res_d1.scalars().first()
        res_d2 = await db.execute(select(models.Document).filter(models.Document.id == d2_id))
        d2_updated = res_d2.scalars().first()

        assert d2_updated.is_deleted is True, "Expected v2 to be soft deleted"
        assert d2_updated.is_latest is False, "Expected v2 to be demoted from latest"
        assert d1_updated.is_latest is True, "Expected v1 to be promoted to latest"
        print("Verified: Admin soft-delete marks document deleted and successfully promotes the previous version to latest.")

        # Verify audit log contains the soft delete entry
        audit_res = await db.execute(
            select(models.AuditLog).filter(
                models.AuditLog.target_reg == TEST_REG,
                models.AuditLog.action == "deleted"
            )
        )
        delete_logs = audit_res.scalars().all()
        assert len(delete_logs) == 1, "Expected soft-delete action audit log entry"
        assert "Compliance cleanup: test soft-delete request" in delete_logs[0].notes, "Compliance reason was not saved in audit log"
        print("Verified: Soft-delete audit log captures compliance justification reason.")

        # 8.5. Test Case 7.5: Admin Soft-Delete Policy Category
        print("\n--- Test Case 7.5: Admin Soft-Delete Policy Category ---")
        # Soft-delete the entire health_policy category (which should delete d1, since d2 is already deleted)
        category_delete_payload = schemas.AdminSoftDeleteRequest(reason="Compliance cleanup: test category soft-delete request")
        cat_delete_resp = await admin_soft_delete_policy_category(
            vehicle_reg_no=TEST_REG,
            doc_type="health_policy",
            payload=category_delete_payload,
            request=mock_request,
            db=db,
            _admin="admin"
        )
        assert cat_delete_resp.status == "success"
        db.expire_all()
        res_d1_cat = await db.execute(select(models.Document).filter(models.Document.id == d1_id))
        d1_cat_updated = res_d1_cat.scalars().first()
        assert d1_cat_updated.is_deleted is True, "Expected d1 to be soft deleted via category delete"
        assert d1_cat_updated.is_latest is False, "Expected d1 to be demoted from latest"
        print("Verified: Admin soft-delete policy category marks all versions of that category deleted.")

        # 9. Test Case 8: Retention Cleanup Job (dry-run & confirmation execution)
        print("\n--- Test Case 8: Retention Cleanup Job ---")
        # We need a document that is past retain_until (e.g. retain_until is in the past)
        # Let's change d2's retain_until to yesterday
        d2.retain_until = date.today() - timedelta(days=1)
        await db.commit()

        # Dry Run cleanup
        print("Running retention cleanup in DRY RUN mode...")
        dry_run_resp = await retention_cleanup_job(
            request=mock_request,
            dry_run=True,
            x_confirm=None,
            db=db,
            _admin="admin"
        )
        assert "DRY RUN" in dry_run_resp.message, "Expected dry run indicator in response message"
        assert "Found 1" in dry_run_resp.message or "1 documents" in dry_run_resp.message, f"Expected 1 eligible document in dry run, message: {dry_run_resp.message}"
        
        # Verify d2 is still in DB after dry run
        result_check_d2 = await db.execute(select(models.Document).filter(models.Document.id == d2.id))
        assert result_check_d2.scalars().first() is not None, "Document was purged in dry run"
        print("Verified: Dry run identifies eligible records but does not purge them.")

        # Actual Cleanup (Fails without header)
        try:
            await retention_cleanup_job(
                request=mock_request,
                dry_run=False,
                x_confirm=None,
                db=db,
                _admin="admin"
            )
            assert False, "Expected HTTP 400 due to missing X-Confirm header"
        except HTTPException as ex:
            assert ex.status_code == 400
            print("Verified: Actual purge blocked without X-Confirm header confirmation.")

        # Actual Cleanup with Header (Succeeds)
        print("Running retention cleanup with X-Confirm header...")
        cleanup_resp = await retention_cleanup_job(
            request=mock_request,
            dry_run=False,
            x_confirm="YES_DELETE_PERMANENTLY",
            db=db,
            _admin="admin"
        )
        assert "successfully completed" in cleanup_resp.message
        
        # Verify d2 is purged from DB
        result_purged = await db.execute(select(models.Document).filter(models.Document.id == d2.id))
        assert result_purged.scalars().first() is None, "Document was not purged from DB"
        print("Verified: Retention cleanup permanently purges eligible records.")

        # 10. Test Case 9: Paginated Searches
        print("\n--- Test Case 9: Paginated Searches ---")
        # Search users with pagination limit = 1
        page_resp = await search_users(
            reg_no=TEST_REG,
            limit=1,
            offset=0,
            db=db,
            _admin="admin"
        )
        assert len(page_resp.users) <= 1, f"Expected at most 1 user, got {len(page_resp.users)}"
        assert page_resp.limit == 1
        assert page_resp.offset == 0
        assert page_resp.total >= 1
        print("Verified: Paginated search endpoint returns total count, limit, and offset metadata.")

        # Final Cleanup via admin_delete_user
        print("\nCleaning up test records by deleting user via admin endpoint...")
        delete_user_resp = await admin_delete_user(
            vehicle_reg_no=TEST_REG,
            db=db,
            _admin="admin"
        )
        assert delete_user_resp.status == "success"

        # Verify user is completely deleted from DB
        result_check_user = await db.execute(select(models.User).filter(models.User.vehicle_reg_no == TEST_REG))
        assert result_check_user.scalars().first() is None, "User record was not deleted from DB"

        # Verify user documents are deleted from DB
        result_check_docs = await db.execute(select(models.Document).filter(models.Document.vehicle_reg_no == TEST_REG))
        assert len(result_check_docs.scalars().all()) == 0, "User documents were not deleted from DB"

        print("Cleanup done.")

    print("\nSUCCESS: All automated checks passed successfully!")

if __name__ == "__main__":
    asyncio.run(run_tests())
