import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Date, Integer, BigInteger, Text, ForeignKey, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from backend.db import Base

class User(Base):
    __tablename__ = "users"

    vehicle_reg_no = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    phone_number = Column(String(15), nullable=True, index=True)
    email = Column(String, nullable=True)
    is_verified = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vehicle_reg_no = Column(String, ForeignKey("users.vehicle_reg_no", ondelete="CASCADE"), nullable=False)
    doc_type = Column(String, nullable=False)  # e.g., "health_policy", "vehicle_policy", custom name
    version_number = Column(Integer, default=1, nullable=False)
    is_latest = Column(Boolean, default=True, nullable=False)
    file_hash = Column(String(64), nullable=False, index=True)
    s3_key = Column(String, nullable=False)
    original_filename = Column(String, nullable=False)
    mime_type = Column(String, nullable=False)
    policy_start_date = Column(Date, nullable=True)
    policy_end_date = Column(Date, nullable=False)
    uploaded_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)
    notes = Column(JSONB, nullable=True)
    retain_until = Column(Date, nullable=False, index=True)
    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint('vehicle_reg_no', 'doc_type', 'version_number', name='uq_documents_reg_type_version'),
        Index('ix_documents_latest_deleted_expiry', 'is_latest', 'is_deleted', 'policy_end_date'),
    )

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    action = Column(String(30), nullable=False)
    performed_by = Column(String(50), nullable=False)
    target_reg = Column(String, nullable=False)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    timestamp = Column(DateTime, server_default=func.now(), nullable=False)
    ip_address = Column(String(45), nullable=True)
    notes = Column(Text, nullable=True)

    __table_args__ = (
        Index('ix_audit_logs_target_reg_timestamp', 'target_reg', 'timestamp'),
    )


class SystemAlert(Base):
    __tablename__ = "system_alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    alert_type = Column(String(50), nullable=False, index=True)  # e.g., 'backup_failure', 'disk_space_critical'
    severity = Column(String(20), default="CRITICAL", nullable=False)  # 'CRITICAL', 'WARNING', 'INFO'
    message = Column(Text, nullable=False)
    details = Column(JSONB, nullable=True)
    is_acknowledged = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)
    acknowledged_at = Column(DateTime, nullable=True)
    acknowledged_by = Column(String(100), nullable=True)

class StorageLog(Base):
    __tablename__ = "storage_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    timestamp = Column(DateTime, server_default=func.now(), nullable=False, index=True)
    operation = Column(String(30), nullable=False, index=True)  # 'UPLOAD', 'DELETE', 'PURGE_RETENTION', 'BACKUP_SNAPSHOT'
    target_path = Column(String, nullable=False)
    size_bytes = Column(BigInteger, nullable=True)
    checksum_sha256 = Column(String(64), nullable=True)
    triggered_by = Column(String(100), nullable=False)  # e.g., 'admin:admin', 'system:apscheduler'
    status = Column(String(20), nullable=False)  # 'SUCCESS', 'FAILED'
    error_message = Column(Text, nullable=True)

class SystemSetting(Base):
    __tablename__ = "system_settings"

    key = Column(String(50), primary_key=True)
    value = Column(JSONB, nullable=False)
    description = Column(String(255), nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)



