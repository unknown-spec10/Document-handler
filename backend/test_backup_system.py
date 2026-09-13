import asyncio
import os
import tempfile
from datetime import datetime, timezone
import pytest
from sqlalchemy import select
from backend import models, config
from backend.db import AsyncSessionLocal
from backend.backup import (
    check_disk_space,
    calculate_sha256_and_size,
    execute_pg_dump,
    record_system_alert,
    record_storage_log,
    get_runtime_setting
)

async def test_disk_space_check():
    """Verify that check_disk_space returns valid metrics and handles thresholds."""
    stats = check_disk_space(".")
    assert "total_gb" in stats
    assert "free_gb" in stats
    assert "used_gb" in stats
    assert "percent_used" in stats
    assert 0 <= stats["percent_used"] <= 100
    print(f"[TEST PASS] Disk check: {stats['percent_used']}% used, {stats['free_gb']} GB free.")

async def test_system_alerts_persistence():
    """Verify persistent alert creation and acknowledgment in DB."""
    test_msg = f"Automated test alert at {datetime.now(timezone.utc).isoformat()}"
    await record_system_alert(
        alert_type="test_alert",
        severity="WARNING",
        message=test_msg,
        details={"test_key": "test_val"}
    )

    async with AsyncSessionLocal() as db:
        stmt = select(models.SystemAlert).filter(
            models.SystemAlert.alert_type == "test_alert",
            models.SystemAlert.message == test_msg
        )
        res = await db.execute(stmt)
        alert = res.scalar_one_or_none()
        assert alert is not None
        assert alert.is_acknowledged is False
        assert alert.severity == "WARNING"

        # Test acknowledgment
        alert.is_acknowledged = True
        alert.acknowledged_at = datetime.utcnow()
        alert.acknowledged_by = "test_runner"
        await db.commit()

        # Re-query
        stmt2 = select(models.SystemAlert).filter(models.SystemAlert.id == alert.id)
        res2 = await db.execute(stmt2)
        alert_updated = res2.scalar_one()
        assert alert_updated.is_acknowledged is True
        assert alert_updated.acknowledged_by == "test_runner"
        print("[TEST PASS] SystemAlert persistence and acknowledgment verified.")

async def test_storage_log_persistence():
    """Verify structured write logging to storage_logs table."""
    test_path = f"backups/postgres/test_snapshot_{int(datetime.now().timestamp())}.dump"
    await record_storage_log(
        operation="BACKUP_SNAPSHOT",
        target_path=test_path,
        size_bytes=1048576,
        checksum_sha256="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        triggered_by="test:suite",
        status="SUCCESS"
    )

    async with AsyncSessionLocal() as db:
        stmt = select(models.StorageLog).filter(models.StorageLog.target_path == test_path)
        res = await db.execute(stmt)
        log_entry = res.scalar_one_or_none()
        assert log_entry is not None
        assert log_entry.operation == "BACKUP_SNAPSHOT"
        assert log_entry.size_bytes == 1048576
        assert log_entry.status == "SUCCESS"
        print("[TEST PASS] StorageLog persistence verified.")

async def test_pg_dump_streaming_and_hash():
    """Verify streaming pg_dump from container and SHA256 checksum computation."""
    temp_file = tempfile.NamedTemporaryFile(suffix=".dump", delete=False)
    temp_filepath = temp_file.name
    temp_file.close()

    try:
        await execute_pg_dump(temp_filepath)
        assert os.path.exists(temp_filepath)

        sha256_hash, file_size = calculate_sha256_and_size(temp_filepath)
        assert file_size > 0
        assert len(sha256_hash) == 64
        print(f"[TEST PASS] pg_dump streamed successfully: {file_size} bytes, SHA256={sha256_hash[:16]}...")
    finally:
        if os.path.exists(temp_filepath):
            os.unlink(temp_filepath)
        assert not os.path.exists(temp_filepath)
        print("[TEST PASS] Guaranteed temp file unlinking verified.")

async def test_runtime_settings():
    """Verify DB-backed runtime settings with fallback."""
    val = await get_runtime_setting("non_existent_key", "default_val")
    assert val == "default_val"

    prefix = await get_runtime_setting("backup_s3_prefix", config.BACKUP_S3_PREFIX)
    assert prefix == "backups/postgres/"
    print("[TEST PASS] Runtime settings lookup and fallback verified.")

async def main():
    print("==================================================")
    print(" Running Backup & Recovery System Automated Tests")
    print("==================================================")
    await test_disk_space_check()
    await test_system_alerts_persistence()
    await test_storage_log_persistence()
    await test_pg_dump_streaming_and_hash()
    await test_runtime_settings()
    print("==================================================")
    print(" ALL BACKUP SYSTEM TESTS PASSED SUCCESSFULLY! ")
    print("==================================================")

if __name__ == "__main__":
    asyncio.run(main())
