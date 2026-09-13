import os
import shutil
import tempfile
import hashlib
import asyncio
import traceback
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
import aioboto3
from botocore.exceptions import ClientError
from botocore.config import Config
from sqlalchemy import select, desc
from backend import config, models
from backend.db import AsyncSessionLocal

# Scoped backup client singleton
_backup_s3_client = None

def get_backup_s3_session() -> aioboto3.Session:
    """Returns an aioboto3 Session configured with scoped backup credentials."""
    access_key = config.BACKUP_AWS_ACCESS_KEY_ID or config.AWS_ACCESS_KEY_ID
    secret_key = config.BACKUP_AWS_SECRET_ACCESS_KEY or config.AWS_SECRET_ACCESS_KEY
    region = config.BACKUP_AWS_REGION or config.AWS_REGION

    if not access_key or not secret_key:
        raise ValueError("Backup AWS credentials are not configured in environment")

    return aioboto3.Session(
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region
    )

async def get_backup_s3_client():
    """Return the global async backup S3 client singleton."""
    global _backup_s3_client
    if _backup_s3_client is None:
        session = get_backup_s3_session()
        region = config.BACKUP_AWS_REGION or config.AWS_REGION
        endpoint_url = f"https://s3.{region}.amazonaws.com" if region else None
        s3_cfg = Config(signature_version='s3v4', max_pool_connections=25)
        _backup_s3_client = await session.client("s3", endpoint_url=endpoint_url, config=s3_cfg).__aenter__()
    return _backup_s3_client

async def close_backup_s3_client():
    """Closes the backup S3 client singleton on app shutdown."""
    global _backup_s3_client
    if _backup_s3_client is not None:
        try:
            await _backup_s3_client.__aexit__(None, None, None)
        except Exception as e:
            print(f"Error closing backup S3 client: {e}")
        finally:
            _backup_s3_client = None

# --- Helper to fetch dynamic settings from DB with config.py fallback ---
async def get_runtime_setting(key: str, default: Any) -> Any:
    """Fetch setting from system_settings DB table, falling back to default."""
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(models.SystemSetting).filter(models.SystemSetting.key == key))
            row = result.scalar_one_or_none()
            if row is not None and row.value is not None:
                return row.value
    except Exception:
        pass
    return default

# --- Operational Pre-Checks ---
def check_disk_space(path: str = ".") -> Dict[str, Any]:
    """
    Checks host disk space using shutil.disk_usage.
    Returns a dict with total_gb, free_gb, used_gb, and percent_used.
    """
    total, used, free = shutil.disk_usage(path)
    percent_used = round((used / total) * 100, 2)
    return {
        "total_gb": round(total / (1024 ** 3), 2),
        "used_gb": round(used / (1024 ** 3), 2),
        "free_gb": round(free / (1024 ** 3), 2),
        "percent_used": percent_used
    }

async def record_system_alert(alert_type: str, severity: str, message: str, details: Optional[Dict[str, Any]] = None):
    """Inserts a persistent alert into system_alerts table."""
    try:
        async with AsyncSessionLocal() as db:
            alert = models.SystemAlert(
                alert_type=alert_type,
                severity=severity,
                message=message,
                details=details or {},
                is_acknowledged=False
            )
            db.add(alert)
            await db.commit()
    except Exception as e:
        print(f"[ALERTS] Failed to record system alert: {e}")

async def record_storage_log(
    operation: str,
    target_path: str,
    size_bytes: Optional[int],
    checksum_sha256: Optional[str],
    triggered_by: str,
    status: str,
    error_message: Optional[str] = None
):
    """Inserts a structured write log entry into storage_logs table."""
    try:
        async with AsyncSessionLocal() as db:
            log_entry = models.StorageLog(
                operation=operation,
                target_path=target_path,
                size_bytes=size_bytes,
                checksum_sha256=checksum_sha256,
                triggered_by=triggered_by,
                status=status,
                error_message=error_message
            )
            db.add(log_entry)
            await db.commit()
    except Exception as e:
        print(f"[STORAGE_LOGS] Failed to record storage log: {e}")

def calculate_sha256_and_size(filepath: str) -> tuple[str, int]:
    """Calculates SHA-256 hash and byte size of a local file in chunks."""
    hasher = hashlib.sha256()
    size = 0
    with open(filepath, "rb") as f:
        while chunk := f.read(1024 * 1024):  # 1MB chunks
            hasher.update(chunk)
            size += len(chunk)
    return hasher.hexdigest(), size

# --- Core Execution Steps ---

async def execute_pg_dump(output_filepath: str) -> None:
    """
    Executes pg_dump via docker exec on container dms-postgres in custom format (-F c).
    Streams stdout directly to output_filepath.
    """
    cmd = [
        "docker", "exec", "dms-postgres",
        "pg_dump", "-U", "postgres", "-d", "postgres", "-F", "c"
    ]

    with open(output_filepath, "wb") as out_file:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=out_file,
            stderr=asyncio.subprocess.PIPE
        )
        _, stderr = await proc.communicate()

        if proc.returncode != 0:
            err_msg = stderr.decode(errors="replace").strip() if stderr else "Unknown error"
            raise RuntimeError(f"docker pg_dump failed with exit code {proc.returncode}: {err_msg}")

async def upload_backup_file_to_s3(
    local_filepath: str,
    s3_key: str,
    sha256_hash: str
) -> Dict[str, Any]:
    """
    Uploads the backup file to S3 with encryption and optional Object Lock.
    Falls back gracefully if Object Lock is not enabled on the bucket.
    """
    s3_client = await get_backup_s3_client()
    bucket = config.BACKUP_S3_BUCKET_NAME or config.S3_BUCKET_NAME

    # Setup encryption
    extra_args: Dict[str, Any] = {
        "Bucket": bucket,
        "Key": s3_key,
        "ContentType": "application/octet-stream",
        "Metadata": {
            "sha256": sha256_hash,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    }

    if config.BACKUP_KMS_KEY_ID:
        extra_args["ServerSideEncryption"] = "aws:kms"
        extra_args["SSEKMSKeyId"] = config.BACKUP_KMS_KEY_ID
    else:
        extra_args["ServerSideEncryption"] = "AES256"

    # Attempt S3 Object Lock retention (28-day retention window)
    retain_until = datetime.now(timezone.utc) + timedelta(days=28)
    object_lock_args = {
        **extra_args,
        "ObjectLockMode": "COMPLIANCE",
        "ObjectLockRetainUntilDate": retain_until
    }

    with open(local_filepath, "rb") as f:
        file_bytes = f.read()

    try:
        # Try putting object with Object Lock
        await s3_client.put_object(Body=file_bytes, **object_lock_args)
        object_lock_applied = True
    except ClientError as e:
        err_code = e.response.get("Error", {}).get("Code", "")
        # If bucket lacks Object Lock or request invalid for unversioned bucket, fallback gracefully
        if err_code in ("InvalidRequest", "BucketNotObjectLockEnabled", "MethodNotAllowed", "AccessDenied"):
            print(f"[BACKUP] Object Lock not available ({err_code}). Uploading with standard encryption + IAM policy.")
            await s3_client.put_object(Body=file_bytes, **extra_args)
            object_lock_applied = False
        else:
            raise

    return {
        "bucket": bucket,
        "key": s3_key,
        "object_lock_applied": object_lock_applied
    }

async def verify_s3_upload(s3_key: str, expected_size: int, expected_sha256: str) -> None:
    """
    Verifies the uploaded S3 object using head_object:
    Checks existence, ContentLength matches local size, and metadata sha256.
    """
    s3_client = await get_backup_s3_client()
    bucket = config.BACKUP_S3_BUCKET_NAME or config.S3_BUCKET_NAME

    try:
        resp = await s3_client.head_object(Bucket=bucket, Key=s3_key)
        remote_size = resp.get("ContentLength", 0)
        if remote_size != expected_size:
            raise ValueError(
                f"S3 backup size mismatch: local={expected_size} bytes, remote={remote_size} bytes"
            )
        metadata = resp.get("Metadata", {})
        remote_sha = metadata.get("sha256")
        if remote_sha and remote_sha != expected_sha256:
            raise ValueError(
                f"S3 backup checksum mismatch: expected={expected_sha256}, remote={remote_sha}"
            )
    except ClientError as e:
        raise RuntimeError(f"Post-upload S3 verification failed for {s3_key}: {e}")

async def prune_s3_backups(
    retention_days: int = 7,
    retention_weeks: int = 4
) -> List[str]:
    """
    Retention policy: Retain 7 daily snapshots + 4 weekly (Sunday) snapshots.
    Older snapshots beyond this retention window are deleted.
    """
    s3_client = await get_backup_s3_client()
    bucket = config.BACKUP_S3_BUCKET_NAME or config.S3_BUCKET_NAME
    prefix = await get_runtime_setting("backup_s3_prefix", config.BACKUP_S3_PREFIX)

    paginator = s3_client.get_paginator("list_objects_v2")
    objects = []
    async for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        if "Contents" in page:
            objects.extend(page["Contents"])

    if not objects:
        return []

    # Sort objects newest first
    objects.sort(key=lambda x: x["LastModified"], reverse=True)

    now = datetime.now(timezone.utc)
    daily_cutoff = now - timedelta(days=retention_days)
    max_retention_cutoff = now - timedelta(days=retention_weeks * 7)

    keys_to_keep = set()
    weekly_sundays_kept = 0

    for obj in objects:
        key = obj["Key"]
        mtime = obj["LastModified"]

        # 1. Keep all snapshots under retention_days old
        if mtime >= daily_cutoff:
            keys_to_keep.add(key)
            continue

        # 2. For snapshots between 7 and 28 days old: keep Sunday snapshots up to 4
        if mtime >= max_retention_cutoff and mtime.weekday() == 6:  # 6 is Sunday
            if weekly_sundays_kept < retention_weeks:
                keys_to_keep.add(key)
                weekly_sundays_kept += 1
                continue

    # Identify keys to delete
    keys_to_delete = [obj["Key"] for obj in objects if obj["Key"] not in keys_to_keep]

    deleted_keys = []
    for key in keys_to_delete:
        try:
            await s3_client.delete_object(Bucket=bucket, Key=key)
            deleted_keys.append(key)
            await record_storage_log(
                operation="PURGE_RETENTION",
                target_path=key,
                size_bytes=None,
                checksum_sha256=None,
                triggered_by="system:retention_prune",
                status="SUCCESS"
            )
        except ClientError as e:
            print(f"[RETENTION] Failed to prune aged backup {key}: {e}")

    return deleted_keys

# --- High-Level Automated Backup Orchestrator ---

async def run_automated_backup(triggered_by: str = "system:apscheduler") -> Dict[str, Any]:
    """
    End-to-end backup pipeline:
    1. Check disk space (> threshold% raises error & alert).
    2. Stream pg_dump from dms-postgres to local temp file.
    3. Calculate SHA-256 and byte size.
    4. Upload to S3 with SSE and Object Lock (with graceful fallback).
    5. Verify S3 object via head_object.
    6. Prune aged snapshots per retention policy.
    7. Clean up local temp file in finally block.
    8. Record structured storage log.
    9. On failure: record persistent system alert and failed storage log.
    """
    temp_filepath = None
    timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    prefix = await get_runtime_setting("backup_s3_prefix", config.BACKUP_S3_PREFIX)
    if not prefix.endswith("/"):
        prefix += "/"
    s3_key = f"{prefix}db_snapshot_{timestamp_str}.dump"

    threshold = await get_runtime_setting("disk_space_threshold_percent", config.DISK_SPACE_THRESHOLD_PERCENT)
    retention_days = await get_runtime_setting("backup_retention_days", config.BACKUP_RETENTION_DAYS)
    retention_weeks = await get_runtime_setting("backup_retention_weeks", config.BACKUP_RETENTION_WEEKS)

    try:
        # Step 1: Disk Space Pre-check
        disk_stats = check_disk_space(".")
        if disk_stats["percent_used"] > float(threshold):
            alert_msg = (
                f"Backup aborted: Host disk usage is {disk_stats['percent_used']}% "
                f"(threshold: {threshold}%). Free space: {disk_stats['free_gb']} GB."
            )
            await record_system_alert(
                alert_type="disk_space_critical",
                severity="CRITICAL",
                message=alert_msg,
                details=disk_stats
            )
            await record_storage_log(
                operation="BACKUP_SNAPSHOT",
                target_path=s3_key,
                size_bytes=None,
                checksum_sha256=None,
                triggered_by=triggered_by,
                status="FAILED",
                error_message=alert_msg
            )
            raise RuntimeError(alert_msg)

        # Step 2: Create temp file and execute pg_dump
        temp_dir = tempfile.gettempdir()
        temp_file = tempfile.NamedTemporaryFile(suffix=".dump", dir=temp_dir, delete=False)
        temp_filepath = temp_file.name
        temp_file.close()

        await execute_pg_dump(temp_filepath)

        # Step 3: Compute Checksum & Size
        sha256_hash, file_size = calculate_sha256_and_size(temp_filepath)
        if file_size == 0:
            raise RuntimeError("Generated database dump file is 0 bytes.")

        # Step 4: Upload to S3
        upload_res = await upload_backup_file_to_s3(temp_filepath, s3_key, sha256_hash)

        # Step 5: Post-Upload Verification
        await verify_s3_upload(s3_key, file_size, sha256_hash)

        # Step 6: Prune Aged Snapshots
        pruned = await prune_s3_backups(retention_days=int(retention_days), retention_weeks=int(retention_weeks))

        # Step 7: Record Successful Storage Log
        await record_storage_log(
            operation="BACKUP_SNAPSHOT",
            target_path=s3_key,
            size_bytes=file_size,
            checksum_sha256=sha256_hash,
            triggered_by=triggered_by,
            status="SUCCESS"
        )

        return {
            "status": "SUCCESS",
            "s3_key": s3_key,
            "size_bytes": file_size,
            "checksum_sha256": sha256_hash,
            "object_lock_applied": upload_res.get("object_lock_applied", False),
            "pruned_snapshots": pruned,
            "created_at": datetime.now(timezone.utc).isoformat()
        }

    except Exception as e:
        err_detail = traceback.format_exc()
        err_msg = f"Database backup failed: {str(e)}"
        print(f"[BACKUP_ERROR] {err_msg}\n{err_detail}")

        await record_system_alert(
            alert_type="backup_failure",
            severity="CRITICAL",
            message=err_msg,
            details={"error": str(e), "traceback": err_detail, "triggered_by": triggered_by}
        )

        await record_storage_log(
            operation="BACKUP_SNAPSHOT",
            target_path=s3_key,
            size_bytes=None,
            checksum_sha256=None,
            triggered_by=triggered_by,
            status="FAILED",
            error_message=str(e)
        )
        raise

    finally:
        # Step 8: Guaranteed Local Temp File Cleanup
        if temp_filepath and os.path.exists(temp_filepath):
            try:
                os.unlink(temp_filepath)
            except Exception as e:
                print(f"[BACKUP] Warning: Failed to unlink temp dump file {temp_filepath}: {e}")
