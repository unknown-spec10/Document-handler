from fastapi import FastAPI, Depends, status, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from backend.routes import auth, users, admin
from backend.routes.auth import limiter
from backend.db import engine, Base
from backend.s3 import verify_s3_bucket_access

app = FastAPI(
    title="Document Management System API",
    description="Backend API for secure user KYC registration and admin management.",
    version="1.0"
)

# Register slowapi rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS configuration
# Must support localhost:5173 (Vite) and localhost:3000 (React / production default)
origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "http://localhost:5174",
    "http://127.0.0.1:5174"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def verify_local_origin(request: Request, call_next):
    # If Origin header is present on API calls, ensure it's from our local frontend
    origin = request.headers.get("origin")
    if origin and request.url.path.startswith("/api/"):
        allowed = any(origin.startswith(prefix) for prefix in ("http://localhost", "http://127.0.0.1"))
        if not allowed:
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": "Forbidden: Cross-site request rejected."}, status_code=403)
    return await call_next(request)


from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from backend.backup import run_automated_backup, close_backup_s3_client, get_runtime_setting
from backend import config, models
from backend.db import engine, Base, AsyncSessionLocal
from sqlalchemy import select
from datetime import datetime, timezone, timedelta
import asyncio

# Initialize AsyncIOScheduler
scheduler = AsyncIOScheduler(timezone="UTC")

def reschedule_backup_job(hour: int, minute: int):
    """Dynamically reschedules the daily postgres backup job."""
    if scheduler.running:
        scheduler.add_job(
            run_automated_backup,
            trigger=CronTrigger(hour=hour, minute=minute, timezone="UTC"),
            id="daily_postgres_backup",
            name="Daily PostgreSQL S3 Backup",
            replace_existing=True,
            misfire_grace_time=3600
        )
        print(f"[Scheduler] Daily backup job rescheduled to {hour:02d}:{minute:02d} UTC.")

# Register routers — all under /api so the Vite proxy needs just one rule:
# /api/* → FastAPI backend, everything else → React SPA
app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(admin.router, prefix="/api")

@app.on_event("startup")
async def startup_event():
    # 1. Verify Database Connection
    try:
        async with engine.connect() as conn:
            print("Successfully connected to the PostgreSQL database.")
    except Exception as e:
        print(f"CRITICAL: Failed to connect to database at startup: {e}")
        
    # 2. Verify S3 Bucket access
    try:
        await verify_s3_bucket_access()
        print("Successfully connected to AWS S3 bucket and verified access.")
    except Exception as e:
        print(f"CRITICAL: AWS S3 verification failed at startup: {e}")

    # 3. Start Background Scheduler
    try:
        scheduler.start()
        hour = await get_runtime_setting("backup_schedule_hour", config.BACKUP_SCHEDULE_HOUR)
        minute = await get_runtime_setting("backup_schedule_minute", config.BACKUP_SCHEDULE_MINUTE)
        reschedule_backup_job(int(hour), int(minute))
        print(f"[Scheduler] Background scheduler started successfully (Backup scheduled at {int(hour):02d}:{int(minute):02d} UTC).")
    except Exception as e:
        print(f"[Scheduler] Failed to start APScheduler: {e}")

    # 4. Check for Missed / Catch-up Daily Backup
    async def check_and_run_catchup_backup():
        await asyncio.sleep(5)  # Allow DB and network pool to settle
        try:
            async with AsyncSessionLocal() as db:
                stmt = select(models.StorageLog).where(
                    models.StorageLog.operation == "BACKUP_SNAPSHOT",
                    models.StorageLog.status == "SUCCESS"
                ).order_by(models.StorageLog.timestamp.desc()).limit(1)
                result = await db.execute(stmt)
                latest_backup = result.scalar_one_or_none()

                needs_backup = False
                reason = ""
                if not latest_backup:
                    needs_backup = True
                    reason = "No prior backup snapshot found in database"
                else:
                    last_time = latest_backup.timestamp
                    if last_time.tzinfo is None:
                        last_time = last_time.replace(tzinfo=timezone.utc)
                    age = datetime.now(timezone.utc) - last_time
                    if age > timedelta(hours=20):
                        needs_backup = True
                        reason = f"Last backup was {age.total_seconds() / 3600:.1f} hours ago (>20h threshold)"

                if needs_backup:
                    print(f"[Backup] Catch-up backup triggered ({reason}). Starting background backup...")
                    await run_automated_backup(triggered_by="system:startup_catchup")
                    print("[Backup] Catch-up backup completed successfully.")
                else:
                    print("[Backup] Recent backup exists. Catch-up backup not required on startup.")
        except Exception as e:
            print(f"[Backup] Startup catch-up backup check encountered an error: {e}")

    asyncio.create_task(check_and_run_catchup_backup())

@app.on_event("shutdown")
async def shutdown_event():
    # 1. Shutdown Scheduler
    try:
        if scheduler.running:
            scheduler.shutdown(wait=False)
            print("[Scheduler] APScheduler shut down gracefully.")
    except Exception as e:
        print(f"Error shutting down scheduler: {e}")

    # 2. Close Backup S3 Client
    await close_backup_s3_client()

    # 3. Close Main S3 Client
    from backend.s3 import _s3_client
    if _s3_client:
        try:
            await _s3_client.__aexit__(None, None, None)
            print("Successfully closed AWS S3 client session.")
        except Exception as e:
            print(f"Error closing S3 client on shutdown: {e}")

@app.get("/api/health", tags=["health"])
async def health_check():
    return {"status": "healthy", "service": "document-management-system-api", "version": "1.0.6"}

# Static Frontend SPA Serving (No Nginx required)
import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

FRONTEND_DIST = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")

if os.path.exists(FRONTEND_DIST):
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon_ico():
        ico = os.path.join(FRONTEND_DIST, "favicon.ico")
        if os.path.exists(ico):
            return FileResponse(ico, media_type="image/x-icon")
        svg = os.path.join(FRONTEND_DIST, "favicon.svg")
        if os.path.exists(svg):
            return FileResponse(svg, media_type="image/svg+xml")
        from fastapi.responses import Response
        return Response(status_code=204)

    @app.get("/favicon.svg", include_in_schema=False)
    async def favicon_svg():
        svg = os.path.join(FRONTEND_DIST, "favicon.svg")
        if os.path.exists(svg):
            return FileResponse(svg, media_type="image/svg+xml")
        from fastapi.responses import Response
        return Response(status_code=204)

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        candidate = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        index_file = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return JSONResponse({"status": "healthy", "service": "document-management-system-api"})
else:
    @app.get("/", tags=["health"])
    async def fallback_root():
        return {"status": "healthy", "service": "document-management-system-api"}

