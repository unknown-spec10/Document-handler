# Workflows Guide: Administrative Operations & Document Lifecycle

This document describes the primary administrative workflows for managing users, uploading insurance policies, versioning documents, and enforcing compliance retention.

---

## 👤 User & Policy Creation Workflow

1. **Authentication**:
   * Admin navigates to `/admin` and logs in using credentials defined in `.env`.
   * FastAPI issues an `access_token` stored as an `httpOnly` secure cookie.
2. **User Registration**:
   * Admin clicks **Add User** in the dashboard header.
   * Required fields:
     * **Vehicle Registration Number**: Validated by regex (`^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$`), checked in real-time for database uniqueness.
     * **Phone Number**: Mandatory 10-digit Indian phone number (`^[6-9]\d{9}$`).
     * **Owner Name**: 2-100 characters.
     * **Email Address**: Valid email format.

---

## 📄 Document Upload & Versioning Workflow

Documents are uploaded via an append-only versioning scheme:

1. **File Validation**:
   * File types allowed: `application/pdf`, `image/jpeg`, `image/png`.
   * Size limit: 50MB per file (validated via streaming headers before memory consumption).
2. **Content Deduplication**:
   * System calculates SHA-256 digest of file content. Duplicate uploads under the same registration are rejected with `400 Bad Request`.
3. **Version Progression**:
   * If a document for `(vehicle_reg_no, doc_type)` already exists, the highest version number is incremented (`v1` -> `v2`).
   * The previous version is marked `is_latest = False`.
   * The new version is marked `is_latest = True`.
4. **S3 Storage & Tagging**:
   * Uploaded to `uploads/{vehicle_reg_no}/{doc_type}/v{version}_{uuid}_{filename}` with SSE-S3 encryption and compliance tags (`vehicle_reg_no`, `doc_type`, `version`).
5. **Retention Period Calculation**:
   * Documents are automatically assigned `retain_until = policy_end_date + 5 years`.

---

## 🗑️ Deletion & Retention Cleanup Workflow

1. **Soft Deletion**:
   * When an admin soft-deletes a document, `is_deleted = True` and `is_latest = False` are set.
   * The preceding historical version is automatically promoted to `is_latest = True` so active policy visibility is preserved.
2. **Scheduled / Manual Retention Purge**:
   * Located in the **Retention** tab.
   * **Dry-Run Mode**: Scans for documents where `retain_until <= TODAY` AND (`is_deleted == True` OR `is_latest == False`).
   * **Permanent Purge**: Requires header `X-Confirm: YES_DELETE_PERMANENTLY` and explicit confirmation. Deletes the physical file from S3 and permanently removes the record from PostgreSQL.
