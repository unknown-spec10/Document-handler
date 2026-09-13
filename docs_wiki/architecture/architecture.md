# Document Management System (DMS) — Architecture & Design Decisions

This document details the architectural choices, design patterns, and engineering decisions implemented in the Document Management System (KYC Portal) to ensure high concurrency, security, and portability.

---

## 1. Concurrency & Non-Blocking I/O (Async Everywhere)
- **Problem**: In a standard FastAPI setup, synchronous database (SQLAlchemy/psycopg2) and AWS (boto3) requests block the execution thread. Under heavy traffic, worker threads exhaust quickly, causing latency and timeouts.
- **Solution**: 
  - **`asyncpg` Database Driver**: Migrated database configurations to use `postgresql+asyncpg` with `create_async_engine` and `AsyncSession`. Database operations are awaited, yielding control back to the event loop during network wait times.
  - **`aioboto3` for AWS S3 & SNS**: Replaced synchronous `boto3` calls with `aioboto3` async client context managers. File uploads to S3, presigned URL generation, and SNS SMS dispatches are fully non-blocking.
  - **FastAPI Event Loop**: The entire request-response cycle executes on a single event loop, achieving massive concurrent request handling capability with minimal memory footprint.

---

## 2. S3 Presigned URLs & Regional Endpoint Alignment
- **Problem**: Standard `boto3` presigned URL generation uses the global S3 endpoint (`s3.amazonaws.com`) by default. If a bucket is located in a specific region (like `ap-south-1`), requests redirect to the regional endpoint. The browser follows this redirect, changing the HTTP `Host` header to the regional domain, which invalidates the presigned signature and throws a `SignatureDoesNotMatch` error.
- **Solution**: 
  - We explicitly configure the S3 client with the regional **`endpoint_url`** (e.g., `https://s3.ap-south-1.amazonaws.com`).
  - This forces Boto3 to sign the request with the correct regional host header directly, avoiding redirects and ensuring reliable document previews.

---

## 3. Database Architecture & AWS RDS Integration
- **Relational Integrity**: Uses PostgreSQL with three tables (`users`, `documents`, `audit_logs`) mapped via SQLAlchemy. Foreign key constraints enforce that documents are linked to valid registered users.
- **Vehicle Reg as Primary Key**: The `User` table uses `vehicle_reg_no` (Vehicle Registration Number) as the primary key. All other user fields (except `name`) are optional.
- **Database Performance Indexing**:
  - `ix_audit_logs_target_reg_timestamp` on `(target_reg, timestamp DESC)`: Speeds up audit log lookups.
  - `ix_documents_latest_deleted_expiry` on `(is_latest, is_deleted, policy_end_date)`: Speeds up admin dashboard counts and expiring lists.
  - `ix_users_phone_number` on `users(phone_number)`: Optimizes phone search queries.
  - Redundant single-column indexes on columns already covered by constraints or prefixes (such as the foreign key B-Tree index on `vehicle_reg_no`, which is covered by the prefix of the unique version constraint index) have been dropped to keep the database slim.

---

## 4. Security & Administration System
- **Cookie-Based JWT Session**: Authentication tokens are delivered via `httpOnly` cookies (`access_token`). This shields the token from Cross-Site Scripting (XSS) attacks since JavaScript cannot read `httpOnly` cookies.
- **Admin Authentication**: Customer login is disabled. Only the administrator can log in via `/auth/admin-login` to access dashboard controls.
- **File Encryption**: All uploaded files are encrypted at rest using server-side encryption (**SSE-S3** / `AES256`) during the `put_object` call.

---

## 5. Frontend Bundle Optimization (Lazy Loading)
- **Problem**: Bundling the entire application into a single JavaScript file makes the initial page load slow, especially since the user upload interface and the admin console are completely distinct.
- **Solution**: 
  - Implemented **`React.lazy()`** and **`Suspense`** to split the pages into separate chunk files.
  - The admin module is only downloaded when `/admin` is accessed, decreasing the initial page bundle size by over 40%.

---

## 6. Docker Container Orchestration & Reverse Proxy
- **CORS & Cookie Isolation**: Running frontends and backends on different ports or domains triggers browser CORS issues and cookie-blocking policies (SameSite).
- **Reverse Proxy Solution**: 
  - The `frontend` container is built as a multi-stage image. The compiled assets are served by an **Nginx** server on port `80`.
  - Nginx is configured to serve the frontend on `/` and reverse-proxy all `/api/*` traffic to `http://backend:8000/*`.
  - To the browser, the frontend and backend share the **same origin** (e.g., `http://localhost:5174`), completely bypassing CORS and ensuring browsers accept and return JWT cookies automatically.

---

## 7. Public Signup & Admin Document Auditing
- **Public Signup**: Enables users to enter their name, vehicle registration number, optional metadata, and upload files concurrently in a single atomic database and S3 transaction.
- **Deduplication Check**: Computes SHA-256 hashes of all uploads. Matches are blocked at the API layer to prevent duplicate storage.
- **Document Versioning & Promotion**: Document histories are append-only. Uploading a new file version automatically marks previous versions as inactive (`is_latest=False`). Soft-deleting the active latest version automatically promotes the most recent remaining historical version of that type to `is_latest=True`.
- **Retention Purge Controls**: Implements a strict `policy_end_date + 5 years` expiration window. The daily cleanup job identifies expired files, supports dry-run scans, and requires an explicit `X-Confirm` header to prevent accidental permanent purges.

---

## 8. Document & User Deletion Workflows (Soft-Delete vs. Hard-Delete)

To comply with auditing and security requirements, the system supports distinct workflows for document deletion (compliance-audited soft-deletes) and user profile deletion (permanent hard-deletes).

### 8.1. Document Version Soft-Delete
When an administrator deletes an individual document version (`DELETE /admin/user/{vehicle_reg_no}/documents/{doc_id}`):
1. **Soft-Delete Tagging**: The database record is marked as soft-deleted (`is_deleted = True`) and a `deleted_at` timestamp is set.
2. **Version Promotion (If Latest)**: If the soft-deleted version was currently active (`is_latest = True`), it is set to `is_latest = False`. The database is queried for the next most recent, active (non-deleted) version of that category, which is automatically promoted to `is_latest = True` to preserve record continuity.
3. **Physical Deletion**: The underlying physical file is permanently removed from the AWS S3 bucket immediately to reclaim storage.
4. **Audit Logging**: An audit log entry is recorded with the action type `deleted`, referencing the document ID and storing the administrator's mandatory compliance justification reason.
5. **Cache Invalidation**: Automatically purges all Redis cached dashboard statistics.

### 8.2. Entire Policy Category Soft-Delete
When an administrator deletes an entire policy category (`DELETE /admin/user/{vehicle_reg_no}/policy/{doc_type}`):
1. **Category-Wide Soft-Delete**: All active database versions of that category are marked as soft-deleted (`is_deleted = True`, `is_latest = False`, and `deleted_at = datetime.utcnow()`).
2. **Physical Deletion**: All physical files associated with all versions of that category are permanently removed from AWS S3.
3. **Audit Logging**: Separate compliance-justified audit entries are created for each deleted document version.
4. **Cache Invalidation**: Automatically clears Redis cached overview statistics.

### 8.3. User Profile Hard-Delete
When an administrator deletes a user profile (`DELETE /admin/user/{vehicle_reg_no}`):
* This is a **Hard Delete** (permanent deletion):
  1. **Recursive S3 Purge**: The entire user folder prefix in AWS S3 (`uploads/{vehicle_reg_no}/`) is recursively deleted, permanently erasing all documents.
  2. **Cascade DB Cleanup**: Database records are manually cascaded and hard-deleted from `audit_logs` and `documents` tables where they belong to the user.
  3. **User Record Purge**: The user record is hard-deleted from the `users` table.
  4. **Cache Invalidation**: Clears all Redis cached admin statistics.
