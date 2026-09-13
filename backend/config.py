import os
from dotenv import load_dotenv

# Load .env file from the root directory
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"), override=True)

# --- AWS ---
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION", "ap-south-1")
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME")

# --- Database ---
DATABASE_URL = os.getenv("DATABASE_URL")

# --- Session ---
SESSION_COOKIE_NAME = "admin_session"
SESSION_COOKIE_VALUE = "authenticated"
SESSION_EXPIRY_SECONDS = 86400 * 30  # 30 days

# --- S3 ---
PRESIGNED_URL_EXPIRY_SECONDS = 3600  # Presigned URL valid for 1 hour
PRESIGNED_URL_REFRESH_BUFFER = 300   # Refresh if less than 5 min remaining

# --- File Validation ---
MAX_FILE_SIZE_MB = 50
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
ALLOWED_MIME_TYPES = [
    "application/pdf",
    "image/jpeg",
    "image/png",
]

# --- Admin ---
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")

# --- S3 Folder Structure ---
S3_UPLOAD_PREFIX = "uploads"          # uploads/{phone_number}/{doc_type}/{filename}

# --- Cookie Security ---
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "False").lower() in ("true", "1", "yes")
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax")

# --- Redis Cache ---
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CACHE_TTL_SECONDS = 3600  # 1 hour TTL for admin stats / expiring policies

# --- Backup & Recovery ---
BACKUP_AWS_ACCESS_KEY_ID = os.getenv("BACKUP_AWS_ACCESS_KEY_ID") or AWS_ACCESS_KEY_ID
BACKUP_AWS_SECRET_ACCESS_KEY = os.getenv("BACKUP_AWS_SECRET_ACCESS_KEY") or AWS_SECRET_ACCESS_KEY
BACKUP_AWS_REGION = os.getenv("BACKUP_AWS_REGION") or AWS_REGION
BACKUP_S3_BUCKET_NAME = os.getenv("BACKUP_S3_BUCKET_NAME") or S3_BUCKET_NAME
BACKUP_S3_PREFIX = os.getenv("BACKUP_S3_PREFIX", "backups/postgres/")
BACKUP_KMS_KEY_ID = os.getenv("BACKUP_KMS_KEY_ID")  # Optional KMS ARN / Key ID
BACKUP_SCHEDULE_HOUR = int(os.getenv("BACKUP_SCHEDULE_HOUR", "2"))
BACKUP_SCHEDULE_MINUTE = int(os.getenv("BACKUP_SCHEDULE_MINUTE", "0"))
DISK_SPACE_THRESHOLD_PERCENT = float(os.getenv("DISK_SPACE_THRESHOLD_PERCENT", "85.0"))
BACKUP_RETENTION_DAYS = int(os.getenv("BACKUP_RETENTION_DAYS", "7"))
BACKUP_RETENTION_WEEKS = int(os.getenv("BACKUP_RETENTION_WEEKS", "4"))

