@echo off
setlocal enabledelayedexpansion

title Document Management System - Single Console Launcher
cd /d "%~dp0"

echo ========================================================
echo   Document Management System (DMS) - Admin Console
echo ========================================================
echo.

:: ---------------------------------------------------------
:: 1. Check & Launch Docker Desktop (Hidden Background)
:: ---------------------------------------------------------
echo [1/4] Checking Docker status...
docker info >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] Docker daemon is active.
    goto :DOCKER_READY
)

echo [*] Docker is not running. Launching Docker Desktop in background...
set "DOCKER_PATH="
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
    set "DOCKER_PATH=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
) else if exist "%LocalAppData%\Programs\Docker\Docker\Docker Desktop.exe" (
    set "DOCKER_PATH=%LocalAppData%\Programs\Docker\Docker\Docker Desktop.exe"
)

if not defined DOCKER_PATH (
    echo [ERROR] Could not locate "Docker Desktop.exe".
    echo Please launch Docker Desktop manually and re-run this script.
    pause
    exit /b 1
)

start "" "%DOCKER_PATH%"
echo [*] Waiting for Docker Desktop engine to initialize...

set /a RETRIES=0
set /a MAX_RETRIES=45

:WAIT_DOCKER
ping 127.0.0.1 -n 3 >nul
docker info >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] Docker Desktop is ready!
    goto :DOCKER_READY
)

set /a RETRIES+=1
if %RETRIES% geq %MAX_RETRIES% (
    echo [ERROR] Timed out waiting for Docker Desktop to start.
    echo Please verify Docker Desktop is running and try again.
    pause
    exit /b 1
)
echo [*] Waiting for Docker daemon... (%RETRIES%/%MAX_RETRIES%)
goto :WAIT_DOCKER

:DOCKER_READY
echo.

:: ---------------------------------------------------------
:: 2. Start PostgreSQL and Redis Containers (Background)
:: ---------------------------------------------------------
echo [2/4] Starting PostgreSQL and Redis containers in background...
docker compose version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "DOCKER_COMPOSE_CMD=docker compose"
) else (
    set "DOCKER_COMPOSE_CMD=docker-compose"
)

%DOCKER_COMPOSE_CMD% up -d --remove-orphans db redis >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to start containers. Retrying with visible output...
    %DOCKER_COMPOSE_CMD% up -d --remove-orphans db redis
    if %ERRORLEVEL% neq 0 (
        pause
        exit /b 1
    )
)
echo [OK] Containers running in background.

:: Wait for PostgreSQL database readiness
set /a DB_RETRIES=0
set /a MAX_DB_RETRIES=20

:WAIT_POSTGRES
ping 127.0.0.1 -n 3 >nul
%DOCKER_COMPOSE_CMD% exec -T db pg_isready -U postgres -d postgres >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] PostgreSQL is accepting connections!
    goto :POSTGRES_READY
)

set /a DB_RETRIES+=1
if %DB_RETRIES% geq %MAX_DB_RETRIES% (
    echo [WARNING] PostgreSQL is taking longer than expected. Proceeding with migration...
    goto :POSTGRES_READY
)
goto :WAIT_POSTGRES

:POSTGRES_READY
echo.

:: ---------------------------------------------------------
:: 3. Database Schema Migration (Alembic)
:: ---------------------------------------------------------
echo [3/4] Checking database schema with Alembic...
if exist ".\myenv\Scripts\python.exe" (
    set "PYTHON_EXE=.\myenv\Scripts\python.exe"
) else (
    set "PYTHON_EXE=python"
)

"%PYTHON_EXE%" -m alembic upgrade head
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Alembic migration failed! Please check configuration.
    pause
    exit /b 1
)
echo [OK] Schema is up to date.
echo.

:: ---------------------------------------------------------
:: 4. Launch Single Unified Terminal (FastAPI + React)
:: ---------------------------------------------------------
echo [4/4] Starting application services in this terminal...
echo.

:: Trigger background browser opener (opens after 3 seconds)
start "" /min cmd /c "ping 127.0.0.1 -n 4 >nul && start http://localhost:5173"

echo ========================================================
echo   Document Management System (Admin Console) is active!
echo.
echo   UI (Admin Portal):  http://localhost:5173
echo   API (FastAPI):      http://127.0.0.1:8000
echo   Swagger Docs:       http://127.0.0.1:8000/docs
echo   PostgreSQL (Docker): localhost:5433
echo   Redis (Docker):      localhost:6379
echo.
echo   Backend logs:  [GREEN]
echo   Frontend logs: [CYAN]
echo.
echo   [Press Ctrl+C at any time to gracefully stop all services]
echo ========================================================
echo.

:: Determine Concurrently runner
if exist ".\frontend\node_modules\.bin\concurrently.cmd" (
    set "CONCURRENTLY_CMD=.\frontend\node_modules\.bin\concurrently.cmd"
) else (
    set "CONCURRENTLY_CMD=npx concurrently"
)

:: Execute both Backend and Frontend concurrently in THIS visible window
call %CONCURRENTLY_CMD% -k --kill-signal SIGINT -n "BACKEND,FRONTEND" -c "green.bold,cyan.bold" -p "[{name}] " "%PYTHON_EXE% -m uvicorn backend.main:app --reload --reload-dir backend --host 127.0.0.1 --port 8000" "npm --prefix frontend run dev"

:: ---------------------------------------------------------
:: 5. Graceful / Lazy Stop Strategy
:: ---------------------------------------------------------
echo.
echo ========================================================
echo   Graceful Shutdown Initiated
echo ========================================================
echo [*] Flushing database buffers and stopping background containers...
%DOCKER_COMPOSE_CMD% stop
echo [OK] PostgreSQL and Redis safely stopped.
echo [OK] All data, tables, and audit logs are preserved in Docker volumes.
echo.
echo System stopped cleanly. Press any key to close this window.
pause >nul
