from datetime import datetime, date
from typing import List, Optional, Any, Dict
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, field_validator
import re

# --- Custom Validator Helpers ---
def validate_phone(v: str) -> str:
    cleaned = re.sub(r"[\s\-()]", "", v)
    if not re.match(r"^(?:\+?91)?[6-9]\d{9}$", cleaned):
        raise ValueError("Invalid phone number format. Must be a valid 10-digit Indian phone number (starting with 6-9), with optional +91 or 91 country code prefix.")
    return cleaned

# --- Request Schemas ---

class AdminLoginRequest(BaseModel):
    username: str
    password: str

# --- Response Schemas ---

class StatusResponse(BaseModel):
    status: str
    message: str

class DocumentResponse(BaseModel):
    id: UUID
    doc_type: str
    version_number: int
    is_latest: bool
    file_hash: str
    original_filename: str
    filename: str
    mime_type: str
    s3_url: Optional[str] = None
    policy_start_date: Optional[date] = None
    policy_end_date: date
    uploaded_at: datetime
    # notes is now JSONB — returned as dict (or None). Backward compat: plain-text
    # legacy rows are backfilled to {"version_note": "<text>"} by the migration.
    notes: Optional[Any] = None
    retain_until: Optional[date] = None

    class Config:
        from_attributes = True

# --- New: Audit Log ---

class AuditLogResponse(BaseModel):
    id: UUID
    action: str
    performed_by: str
    target_reg: str
    document_id: Optional[UUID] = None
    timestamp: datetime
    notes: Optional[str] = None

    class Config:
        from_attributes = True

class UserResponse(BaseModel):
    vehicle_reg_no: str
    name: str
    phone_number: Optional[str] = None
    email: Optional[str] = None
    is_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True

class UserDetailResponse(BaseModel):
    user: UserResponse
    docs_by_type: Dict[str, List[DocumentResponse]]
    audit_logs: List[AuditLogResponse]
    vehicle_reg_no: Optional[str] = None

class SearchUserResponse(BaseModel):
    vehicle_reg_no: str
    name: str
    phone_number: Optional[str] = None
    email: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class AdminCreateUserRequest(BaseModel):
    vehicle_reg_no: str
    name: str
    phone_number: str
    email: Optional[str] = None
    metadata: Optional[Any] = None

    @field_validator("vehicle_reg_no")
    @classmethod
    def check_vehicle_reg(cls, v: str) -> str:
        cleaned = v.replace("-", "").replace(" ", "").strip().upper()
        if not re.match(r"^[A-Z0-9]{5,15}$", cleaned):
            raise ValueError("Vehicle Registration Number must be 5 to 15 alphanumeric characters.")
        return cleaned

    @field_validator("name")
    @classmethod
    def check_name(cls, v: str) -> str:
        cleaned = v.strip()
        if not re.match(r"^[a-zA-Z0-9\s.-]{2,100}$", cleaned):
            raise ValueError("Name must be between 2 and 100 characters and contain only letters, numbers, spaces, dots, and hyphens.")
        return cleaned

    @field_validator("phone_number")
    @classmethod
    def check_phone(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Phone Number is required.")
        return validate_phone(v)

    @field_validator("email")
    @classmethod
    def check_email(cls, v: Optional[str]) -> Optional[str]:
        if not v or not v.strip():
            return None
        cleaned = v.strip()
        if not re.match(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", cleaned):
            raise ValueError("Invalid email address format.")
        return cleaned

class VerificationResponse(BaseModel):
    status: str
    hash_matched: bool
    stored_hash: str
    computed_hash: str

class AdminSoftDeleteRequest(BaseModel):
    reason: str

class PaginatedSearchUserResponse(BaseModel):
    users: List[SearchUserResponse]
    items: List[SearchUserResponse] = Field(default_factory=list)
    total: int
    limit: int
    offset: int
    page: int = 1
    page_size: int = 20

# --- New: Admin Stats ---

class AdminStatsResponse(BaseModel):
    expiring_this_month: int
    already_expired: int
    pending_cleanup: int
    total_policies: int
    total_users: int = 0

# --- New: Admin Expiring Policies ---

class ExpiringPolicyItem(BaseModel):
    vehicle_reg_no: str
    name: str
    doc_type: str
    policy_end_date: date
    version_number: int

class PaginatedExpiringResponse(BaseModel):
    policies: List[ExpiringPolicyItem]
    total: int
    limit: int
    offset: int

# --- New: Pricing ---

class CostEstimateRequest(BaseModel):
    s3_storage_gb: float = Field(..., ge=0)
    rds_instance_type: str
    rds_storage_gb: float = Field(..., ge=0)
    ec2_instance_type: str
    ec2_hours_per_month: int = Field(..., ge=0, le=744)

class S3Estimate(BaseModel):
    storage_cost: float

class RDSEstimate(BaseModel):
    instance_cost: float
    storage_cost: float

class EC2Estimate(BaseModel):
    instance_cost: float

class EstimateBreakdown(BaseModel):
    s3: S3Estimate
    rds: RDSEstimate
    ec2: EC2Estimate

class CostEstimateResponse(BaseModel):
    breakdown: EstimateBreakdown
    total_estimated: float

class ServiceActualCost(BaseModel):
    actual_cost: float

class ActualCostsBreakdown(BaseModel):
    s3: ServiceActualCost
    rds: ServiceActualCost

class ActualCostsResponse(BaseModel):
    period: str
    services: ActualCostsBreakdown
    total_actual: float
    projected_month_end: float

class CostOptionsResponse(BaseModel):
    rds_instance_types: List[str]
    ec2_instance_types: List[str]
    default_region: str
    default_s3_storage_gb: float
    default_rds_storage_gb: float

# --- System Alerts, Storage Logs, & Settings ---

class SystemAlertItem(BaseModel):
    id: UUID
    alert_type: str
    severity: str
    message: str
    details: Optional[Dict[str, Any]] = None
    is_acknowledged: bool
    created_at: datetime
    acknowledged_at: Optional[datetime] = None
    acknowledged_by: Optional[str] = None

    class Config:
        from_attributes = True

class SystemAlertsResponse(BaseModel):
    alerts: List[SystemAlertItem]
    unacknowledged_count: int

class AcknowledgeAlertResponse(BaseModel):
    message: str
    alert_id: UUID

class StorageLogItem(BaseModel):
    id: UUID
    timestamp: datetime
    operation: str
    target_path: str
    size_bytes: Optional[int] = None
    checksum_sha256: Optional[str] = None
    triggered_by: str
    status: str
    error_message: Optional[str] = None

    class Config:
        from_attributes = True

class PaginatedStorageLogsResponse(BaseModel):
    logs: List[StorageLogItem]
    total: int
    limit: int
    offset: int

class SystemSettingsModel(BaseModel):
    backup_schedule_hour: int = Field(2, ge=0, le=23)
    backup_schedule_minute: int = Field(0, ge=0, le=59)
    disk_space_threshold_percent: float = Field(85.0, ge=10.0, le=99.0)
    backup_retention_days: int = Field(7, ge=1, le=365)
    backup_retention_weeks: int = Field(4, ge=1, le=52)
    backup_s3_prefix: str = Field("backups/postgres/")
    s3_bucket: Optional[str] = None
    aws_region: Optional[str] = None
    kms_encrypted: bool = False
    has_dedicated_backup_credentials: bool = False

class SystemSettingsUpdateRequest(BaseModel):
    backup_schedule_hour: int = Field(..., ge=0, le=23)
    backup_schedule_minute: int = Field(..., ge=0, le=59)
    disk_space_threshold_percent: float = Field(..., ge=10.0, le=99.0)
    backup_retention_days: int = Field(..., ge=1, le=365)
    backup_retention_weeks: int = Field(..., ge=1, le=52)
    backup_s3_prefix: str = Field(...)

class TriggerBackupResponse(BaseModel):
    message: str
    status: str
    details: Optional[Dict[str, Any]] = None



