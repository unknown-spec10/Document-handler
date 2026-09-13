# 🚨 Disaster Recovery Runbook: PostgreSQL & Document Management System

**Target Audience:** DevOps Engineer / Systems Administrator on-call at 2:00 AM under pressure.  
**System:** FastAPI Backend + Local PostgreSQL (`dms-postgres` on Docker) + AWS S3 Storage.  
**Environment:** Windows Host (PowerShell / Command Prompt).  
**Host DB Port:** `5433` (Docker maps host `5433` to container `5432`).  
**Default DB Credentials:** User: `postgres`, Password: `root`, DB: `postgres`.  

---

## 🛑 1. Emergency Pre-Flight Assessment

Before touching anything, diagnose the failure:

1. **Check if the Docker container is running:**
   ```powershell
   docker ps -a --filter "name=dms-postgres"
   ```
2. **Check container logs for corruption or crash loops:**
   ```powershell
   docker logs --tail 100 dms-postgres
   ```
3. **If the database is corrupt or data has been destroyed, proceed to Section 2.**

---

## 📋 2. Prerequisites & Tooling Verification

Open **PowerShell** or **Command Prompt** as Administrator:

1. **Verify Docker Desktop Engine is active:**
   ```powershell
   docker info
   ```
2. **Verify AWS CLI is installed and configured:**
   ```powershell
   aws --version
   aws sts get-caller-identity
   ```
   *If AWS CLI is not configured, set environment variables for this session:*
   ```powershell
   $env:AWS_ACCESS_KEY_ID="<YOUR_AWS_ACCESS_KEY_ID>"
   $env:AWS_SECRET_ACCESS_KEY="<YOUR_AWS_SECRET_ACCESS_KEY>"
   $env:AWS_DEFAULT_REGION="ap-south-1"
   ```

---

## 🔍 3. Locate & Download the S3 Snapshot

All automated database dumps are stored in the dedicated S3 prefix `backups/postgres/` with compression format (`.dump`).

1. **List all available snapshots in S3 (sorted newest first):**
   ```powershell
   aws s3 ls s3://document-managerr/backups/postgres/
   ```
   *Example output:*
   ```text
   2026-09-12 02:00:05    1584201 db_snapshot_20260912_020001.dump
   2026-09-11 02:00:04    1581200 db_snapshot_20260911_020000.dump
   ```

2. **Create a local recovery directory and download the target snapshot:**
   ```powershell
   mkdir C:\dms_recovery -Force
   cd C:\dms_recovery

   # Replace with the exact snapshot filename you wish to restore:
   $SNAPSHOT="db_snapshot_20260912_020001.dump"
   aws s3 cp "s3://document-managerr/backups/postgres/$SNAPSHOT" ".\$SNAPSHOT"
   ```

3. **Verify the downloaded file integrity:**
   ```powershell
   # Ensure the file is non-zero
   Get-Item ".\$SNAPSHOT" | Select-Object Name, Length, LastWriteTime

   # (Optional) Verify SHA-256 matches metadata:
   Get-FileHash -Algorithm SHA256 ".\$SNAPSHOT"
   ```

---

## 🔄 4. Clean Container Spin-Up & Volume Reset

To prevent old corrupted blocks from interfering, start with a pristine PostgreSQL state.

1. **Navigate to the application root directory:**
   ```powershell
   cd "d:\Projects\Document handler"
   ```

2. **Stop running services and wipe the corrupted Docker volume:**
   > ⚠️ **CAUTION:** This removes the local `pgdata` volume. Ensure you have downloaded the S3 snapshot first!
   ```powershell
   docker compose down -v
   ```

3. **Start clean PostgreSQL and Redis containers:**
   ```powershell
   docker compose up -d
   ```

4. **Wait 5 seconds and confirm PostgreSQL is healthy:**
   ```powershell
   docker compose exec db pg_isready -U postgres -d postgres
   ```
   *Expected response:* `postgres:5432 - accepting connections`

---

## 📥 5. Restore the Database Snapshot

We stream the `.dump` file directly into the PostgreSQL container using `pg_restore`. Custom format (`-F c`) enables clean schema and data recreation.

1. **Execute the database restoration:**
   ```powershell
   # From C:\dms_recovery (where you downloaded the snapshot):
   cd C:\dms_recovery

   Get-Content -Raw ".\$SNAPSHOT" | docker exec -i dms-postgres pg_restore -U postgres -d postgres --clean --if-exists --no-owner --no-privileges
   ```
   *Alternative single-line command (PowerShell):*
   ```powershell
   cmd /c "docker exec -i dms-postgres pg_restore -U postgres -d postgres --clean --if-exists --no-owner --no-privileges < C:\dms_recovery\$SNAPSHOT"
   ```

   > [!NOTE]
   > Notice messages about non-existent objects during `--clean` are normal and expected because it is a fresh container.

---

## ✅ 6. Verify Post-Restore Data Integrity

Run verification queries inside the container to ensure tables and records have been fully restored.

1. **Check Table Row Counts:**
   ```powershell
   docker exec -it dms-postgres psql -U postgres -d postgres -c @"
   SELECT 'users' AS table_name, count(*) AS row_count FROM users
   UNION ALL
   SELECT 'documents', count(*) FROM documents
   UNION ALL
   SELECT 'audit_logs', count(*) FROM audit_logs
   UNION ALL
   SELECT 'system_alerts', count(*) FROM system_alerts
   UNION ALL
   SELECT 'storage_logs', count(*) FROM storage_logs;
   "@
   ```

2. **Verify Alembic Migration Version:**
   ```powershell
   docker exec -it dms-postgres psql -U postgres -d postgres -c "SELECT version_num FROM alembic_version;"
   ```
   *Expected version:* `36541e3ffc19` (or latest head)

3. **Sample Recent Restored Documents:**
   ```powershell
   docker exec -it dms-postgres psql -U postgres -d postgres -c @"
   SELECT vehicle_reg_no, doc_type, version_number, original_filename, uploaded_at 
   FROM documents 
   ORDER BY uploaded_at DESC 
   LIMIT 5;
   "@
   ```

---

## 🚀 7. Reconnect Application & Verify Health

1. **Return to repository root and run schema sync validation:**
   ```powershell
   cd "d:\Projects\Document handler"
   .\myenv\Scripts\python.exe -m alembic current
   ```

2. **Launch the application stack:**
   ```cmd
   start.bat
   ```

3. **Verify API Endpoints:**
   - Open browser or curl: `http://127.0.0.1:8000/`  
     *Expected:* `{"status":"healthy","service":"document-management-system-api"}`
   - Open Admin Dashboard: `http://localhost:5173/`
   - Log in and verify that all users, documents, and policies are visible.
   - Navigate to **Settings & Backup** tab and click **Refresh Status** to confirm S3 and Disk Health.

---

## 🔐 APPENDIX: Scoped AWS IAM Backup Policy

To enforce least-privilege security so application credentials cannot delete or tamper with backups, attach this policy to the dedicated IAM user/role configured via `BACKUP_AWS_ACCESS_KEY_ID`:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowListBackupPrefix",
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket"
            ],
            "Resource": "arn:aws:s3:::document-managerr",
            "Condition": {
                "StringLike": {
                    "s3:prefix": [
                        "backups/postgres/*",
                        "backups/postgres"
                    ]
                }
            }
        },
        {
            "Sid": "AllowBackupUploadAndVerify",
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:PutObjectRetention",
                "s3:PutObjectLegalHold"
            ],
            "Resource": "arn:aws:s3:::document-managerr/backups/postgres/*"
        },
        {
            "Sid": "DenyAppAccessToBackups",
            "Effect": "Deny",
            "Action": [
                "s3:DeleteObject",
                "s3:DeleteObjectVersion"
            ],
            "Resource": "arn:aws:s3:::document-managerr/backups/postgres/*",
            "Condition": {
                "StringNotLike": {
                    "aws:PrincipalArn": "arn:aws:iam::*:role/AdminOrBackupRestorerRole"
                }
            }
        }
    ]
}
```

---
**Runbook maintained by Document Management System Core Team.**
