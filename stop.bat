@echo off
title Document Management System - Graceful Stop
cd /d "%~dp0"

echo ========================================================
echo   Document Management System (DMS) - Stop Utility
echo ========================================================
echo.
echo [*] Gracefully stopping PostgreSQL and Redis containers...

docker compose version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "DOCKER_COMPOSE_CMD=docker compose"
) else (
    set "DOCKER_COMPOSE_CMD=docker-compose"
)

%DOCKER_COMPOSE_CMD% stop
echo.
echo [OK] All containers safely stopped.
echo [OK] PostgreSQL database state, files, and Redis data are fully preserved.
echo.
echo Press any key to close this window.
pause >nul
