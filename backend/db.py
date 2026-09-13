from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
from backend.config import DATABASE_URL

# Verify database URL exists
if not DATABASE_URL:
    raise ValueError("DATABASE_URL is not set in environment or config.py")

# Rewrite connection string to use asyncpg driver
async_db_url = DATABASE_URL
if async_db_url.startswith("postgresql://"):
    async_db_url = async_db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

# Create async engine with pre-ping and connection pooling enabled
engine = create_async_engine(
    async_db_url,
    pool_size=10,        # max persistent connections
    max_overflow=20,     # burst connections allowed
    pool_timeout=30,
    pool_pre_ping=True
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as db:
        try:
            yield db
        except Exception:
            await db.rollback()
            raise
