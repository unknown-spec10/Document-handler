# Quickstart Guide: Document Management System (DMS)

Welcome to the Document Management System (DMS), a high-security KYC and policy document management platform built with **FastAPI**, **React (Vite)**, **Local PostgreSQL (Docker)**, **Redis (Docker)**, and **AWS S3**.

---

## ⚡ Prerequisites

1. **Operating System:** Windows 10/11 (or Linux/macOS with Docker Desktop).
2. **Docker Desktop:** Installed and running (handles PostgreSQL and Redis background containers).
3. **Python:** Version 3.12+ with virtual environment configured at `./myenv`.
4. **Node.js:** Version 18+ (Node 20+ recommended).
5. **AWS S3 Credentials:** Configured in `.env` for document storage and automated backups.

---

## 🚀 One-Click Startup (Recommended)

From the project root on Windows, simply run:

```cmd
start.bat
```

### What `start.bat` Does Automatically:
1. **Docker Check**: Detects if Docker Desktop daemon is running; automatically starts Docker Desktop in the background if stopped.
2. **Container Spin-Up**: Launches PostgreSQL (`dms-postgres` mapped to port `5433:5432`) and Redis (`dms-redis` on port `6379:6379`) in detached/background mode with healthchecks.
3. **Database Migration**: Executes `alembic upgrade head` to ensure database schema is up-to-date.
4. **Single Unified Terminal**: Uses `concurrently` to run both the FastAPI backend (`http://127.0.0.1:8000`) and the Vite React frontend (`http://localhost:5173`) in one color-coded console window.
5. **Browser Auto-Launch**: Automatically opens the Admin Dashboard in your default web browser.

---

## 🛑 Clean Shutdown

To stop the system gracefully without leaving orphan processes or risking database corruption:

* Press **`Ctrl + C`** in the unified terminal window, or run:
  ```cmd
  stop.bat
  ```

This safely terminates backend/frontend dev servers, flushes PostgreSQL WAL buffers, and stops Docker containers while preserving all data in the `documenthandler_pgdata` Docker volume.

---

## 🔑 Administrative Access

* **Portal URL:** `http://localhost:5173/` (Admin login is the default landing screen)
* **Default Username:** `admin` (or value of `ADMIN_USERNAME` in `.env`)
* **Default Password:** Configured via `ADMIN_PASSWORD` in `.env`
* **API Documentation:** `http://127.0.0.1:8000/docs` (Swagger UI)

---

## 📁 Repository Structure at a Glance

* [`backend/`](file:///d:/Projects/Document%20handler/backend): FastAPI application routes, SQLAlchemy models, S3 singleton, and APScheduler backup engine.
* [`frontend/`](file:///d:/Projects/Document%20handler/frontend): React SPA with Tailwind CSS, Lucide icons, and Framer Motion.
* [`docker-compose.yml`](file:///d:/Projects/Document%20handler/docker-compose.yml): Multi-container services for PostgreSQL and Redis.
* [`RECOVERY.md`](file:///d:/Projects/Document%20handler/RECOVERY.md): Step-by-step 2:00 AM disaster recovery runbook.
* [`docs_wiki/`](file:///d:/Projects/Document%20handler/docs_wiki): Comprehensive technical documentation wiki.
