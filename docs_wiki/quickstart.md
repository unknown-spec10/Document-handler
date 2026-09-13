# Quickstart Guide: Document Management System (DMS)

Welcome to the Document Management System (DMS), a high-security KYC and policy document management platform built with **FastAPI**, **React SPA (Vite)**, **Local PostgreSQL (Docker)**, **Redis (Docker)**, and **AWS S3**.

---

## ⚡ Prerequisites

1. **Operating System:** Windows 10/11 (or Linux/macOS with Docker Desktop).
2. **Docker Desktop:** Installed and running (handles PostgreSQL, Redis, Backend, and Updater containers).
3. **AWS S3 Credentials:** Configured in `.env` for document storage and automated backups.
4. **Zero Host Node.js/Python Requirement:** The application runs entirely within pre-built Docker containers (`deepdocker2023/dms-backend:latest`).

---

## 🚀 One-Click Desktop Deployment (Recommended for End Users)

### First-Time Setup on a New Machine:
1. Create a project directory (e.g., `C:\dms`) containing:
   - `docker-compose.yml`
   - `.env` (configured with AWS credentials and admin password)
   - `launch_app.bat`
   - `create_shortcut.bat`
2. Run **`create_shortcut.bat`** once. This places a clean **"Policy Manager"** shortcut on your Windows Desktop.

### Daily Operation:
* Simply double-click the **Policy Manager** shortcut on your Desktop (or run `launch_app.bat`).

### What `launch_app.bat` Does Automatically:
1. **Docker Check**: Detects if Docker Desktop daemon is running; automatically starts Docker Desktop in the background if stopped.
2. **Container Spin-Up**: Launches all containers (`dms-postgres`, `dms-redis`, `dms-backend`, and `dms-updater`) via `docker compose up -d`.
3. **Database Migration**: Automatically executes `alembic upgrade head` inside the container on boot.
4. **Browser Auto-Launch**: Opens your default browser directly to `http://localhost:8000`.

---

## 🔄 One-Click In-App Updates

Non-technical users can update the application directly from the UI:
1. Click the **"Update App"** button in the top navigation bar.
2. Confirm the update modal.
3. The UI will display an animated progress overlay while the companion `dms-updater` service pulls the latest image from Docker Hub and restarts the backend in **~10 seconds**.
4. The page reloads automatically once the updated application is healthy. Database data is 100% preserved.

---

## 🛑 Clean Shutdown

To stop the system gracefully without leaving orphan containers or risking database corruption:
* Run in Command Prompt or PowerShell:
  ```cmd
  docker compose stop
  ```
This safely flushes PostgreSQL WAL buffers and pauses containers while preserving all data in the persistent Docker volume.

---

## 🔑 Administrative Access

* **Portal URL:** `http://localhost:8000/` (Admin login is the default landing screen)
* **Default Username:** `admin` (configured via `ADMIN_USERNAME` in `.env`)
* **Default Password:** Configured via `ADMIN_PASSWORD` in `.env`
* **API Documentation:** `http://127.0.0.1:8000/docs` (Swagger UI)
* **Local Loopback Security:** All container ports (`8000`, `5433`, `6379`) are strictly bound to `127.0.0.1` to prevent unauthorized Wi-Fi or LAN access.

---

## 📁 Repository Structure at a Glance

* [`backend/`](file:///d:/Projects/Document%20handler/backend): FastAPI application routes, SQLAlchemy models, S3 singleton, and APScheduler backup engine.
* [`frontend/`](file:///d:/Projects/Document%20handler/frontend): React SPA with Tailwind CSS, Lucide icons, and Framer Motion (compiled into `backend/frontend/dist` in container).
* [`docker-compose.yml`](file:///d:/Projects/Document%20handler/docker-compose.yml): Multi-container services for PostgreSQL, Redis, Backend, and Updater.
* [`launch_app.bat`](file:///d:/Projects/Document%20handler/launch_app.bat): Desktop launcher script with Docker auto-start.
* [`create_shortcut.bat`](file:///d:/Projects/Document%20handler/create_shortcut.bat): Windows Desktop shortcut installer.
* [`RECOVERY.md`](file:///d:/Projects/Document%20handler/RECOVERY.md): Step-by-step 2:00 AM disaster recovery runbook.
* [`docs_wiki/`](file:///d:/Projects/Document%20handler/docs_wiki): Comprehensive technical documentation wiki.
