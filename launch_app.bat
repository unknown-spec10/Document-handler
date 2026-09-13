@echo off
setlocal enabledelayedexpansion
title Launching Policy Manager...

cd /d "%~dp0"

:: 1. Check if Docker is running, launch if needed
docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Starting Docker Desktop in background...
    set "DOCKER_PATH="
    if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
        set "DOCKER_PATH=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
    ) else if exist "%LocalAppData%\Programs\Docker\Docker\Docker Desktop.exe" (
        set "DOCKER_PATH=%LocalAppData%\Programs\Docker\Docker\Docker Desktop.exe"
    )

    if defined DOCKER_PATH (
        start "" "%DOCKER_PATH%"
    )

    :: Wait for Docker daemon to become responsive
    set /a RETRIES=0
    :WAIT_DOCKER
    ping 127.0.0.1 -n 3 >nul
    docker info >nul 2>&1
    if %ERRORLEVEL% equ 0 goto :DOCKER_READY
    set /a RETRIES+=1
    if %RETRIES% geq 30 goto :DOCKER_READY
    goto :WAIT_DOCKER
)

:DOCKER_READY
:: 2. Ensure application containers are running
docker compose up -d >nul 2>&1

:: 3. Launch browser directly to Policy Manager
start "" http://localhost:8000

exit
