# Operations Guide: System Settings, Alerts & Write Auditing

This document describes the operational configuration boundary, persistent alerting behavior, and physical write auditing in the Document Management System.

---

## ⚙️ Settings Boundary: Runtime Tuning vs. Secure `.env`

The Document Management System maintains a strict boundary between operational settings and core security credentials:

| Setting Category | Storage Location | Mutability | Examples |
|---|---|---|---|
| **Security & Infrastructure Credentials** | [`.env`](file:///d:/Projects/Document%20handler/.env) | **Immutable at runtime** | Database passwords, AWS Access Keys, S3 Bucket names, KMS Key IDs, JWT secret keys |
| **Operational Settings** | `system_settings` table (DB) | **Editable in Admin UI** | Daily backup schedule time (hour/minute UTC), disk space alert threshold (%), retention counts, S3 backup prefix |

### Dynamic Scheduler Rescheduling
When an administrator modifies the backup hour or minute in the **Settings & Backup** tab, the endpoint calls `reschedule_backup_job(hour, minute)` in [`backend/main.py`](file:///d:/Projects/Document%20handler/backend/main.py). The APScheduler cron trigger updates immediately in-memory without requiring a server reboot.

---

## 🚨 Persistent System Failure Alerts

To guarantee that silent background failures never slip past the engineering or operations team:

* **Alert Schema (`system_alerts` table)**:
  * `id`: UUID primary key
  * `alert_type`: String (e.g. `backup_failure`, `disk_space_critical`)
  * `severity`: String (`CRITICAL`, `WARNING`, `INFO`)
  * `message`: Human-readable error description
  * `details`: Structured JSONB payload containing exception tracebacks or disk metrics
  * `is_acknowledged`: Boolean flag (default `False`)
  * `created_at`: Timestamp
  * `acknowledged_at`: Timestamp (populated upon click)
  * `acknowledged_by`: Username of the acknowledging admin
* **Dashboard Sticky Banner**:
  * Unacknowledged alerts render as a prominent, pulsing banner at the top of every dashboard view.
  * The banner does **not** disappear on browser refresh or page navigation; it strictly requires an administrator to review the issue and click **Acknowledge**.

---

## 📝 Structured Storage Write Logging (`storage_logs`)

Every physical write operation to storage (document uploads, deletions, retention purges, and automated database backups) generates an audit entry in the `storage_logs` table:

* **Logged Attributes:**
  * `timestamp`: Precise UTC event time.
  * `operation`: `UPLOAD`, `DELETE`, `PURGE_RETENTION`, or `BACKUP_SNAPSHOT`.
  * `target_path`: Remote S3 object key.
  * `size_bytes`: Byte length of the written file.
  * `checksum_sha256`: Cryptographic SHA-256 digest of the payload.
  * `triggered_by`: Origin identity (`admin:<username>`, `system:apscheduler`, etc.).
  * `status`: `SUCCESS` or `FAILED`.
  * `error_message`: Error details if status is `FAILED`.
* **Performance Guarantee:**
  * Physical storage logging is offloaded to FastAPI's `BackgroundTasks` to guarantee zero latency penalty on user-facing API responses.
