# Document Management System (DMS) — KYC Portal

A secure, full-stack, highly concurrent Document Management System (KYC Portal). It enables customers to register their vehicle profile, submit KYC documents (PDFs and images) directly to AWS S3 with server-side encryption, and provides administrators with a secure console to search, review, audit, and manage records with optimized performance.

---

## Features

- **Unified Signup & Upload**: Customers can register their profile with their Vehicle Registration Number (mandatory), Full Name (mandatory), and optional phone/email, uploading all initial documents in a single, atomic form.
- **Asynchronous Execution**: Backend completely powered by `asyncpg` (database) and `aioboto3` (S3/SNS) for non-blocking I/O.
- **Secure Storage**: Documents are uploaded directly to AWS S3 with **SSE-S3** (AES256) encryption.
- **Deduplication Check**: Duplicate document uploads (matching SHA-256 content hashes) are blocked to save S3 storage and keep the database clean.
- **Admin Dashboard**: Secure management console to search users by vehicle registration, view profiles, and preview documents inline via regional S3 presigned URLs.
- **Performance Indexes**: Built-in composite indexes (e.g. on `is_latest`, `is_deleted`, and `policy_end_date` on `documents`; and `target_reg` and `timestamp` on `audit_logs`) ensure instantaneous page load and query execution.
- **Compliance-Driven Soft Deletes**: Soft deletes are logged with compliance justification reasons in the database audit log. Soft-deleting the latest version automatically promotes the previous active version to latest.
- **Retention Cleanup Job**: A daily retention job purges files past their 5-year retention period (calculated as `policy_end_date + 5 years`). Supports dry-run safety scans and requires explicit header confirmation (`X-Confirm`) to execute.
- **Lazy Loading**: Code splitting on pages (`React.lazy` + `Suspense`) to minimize initial frontend load time.
- **Nginx Proxying**: Prevents browser SameSite cookie blocking and CORS issues by reverse-proxying API requests through Nginx.

---

## Tech Stack

- **Backend**: FastAPI, SQLAlchemy (Async), Alembic, Uvicorn, aioboto3, asyncpg.
- **Frontend**: Vite, React, Tailwind CSS, Axios, Lucide Icons, Framer Motion.
- **Database**: PostgreSQL (AWS RDS / Local).
- **Cloud Infrastructure**: AWS S3.

---

## Directory Structure

```
dms/
├── backend/                  # FastAPI Application
│   ├── alembic/              # Database migration history
│   ├── routes/               # API Router endpoints (auth, users, admin)
│   ├── config.py             # Settings loader
│   ├── db.py                 # Async Database connection
│   ├── models.py             # SQLAlchemy models
│   ├── s3.py                 # Async S3 utilities
│   └── main.py               # Main application entrypoint
├── frontend/                 # Vite React Application
│   ├── src/
│   │   ├── api/              # Axios client config
│   │   ├── components/       # Reusable components (DocumentViewer, etc.)
│   │   ├── pages/            # Page layouts (UploadPage, AdminDashboard, AdminUserDetail)
│   │   └── App.jsx           # Routing & lazy-loading
│   └── nginx.conf            # Nginx reverse proxy configuration
├── docker-compose.yml        # Multi-container orchestration
└── .env.example              # Environment variables template
```

---

## Setup & Configuration

### 1. Configure the Environment
Copy `.env.example` to a new file named `.env` in the root directory:
```bash
cp .env.example .env
```
Fill out the variables inside `.env` with your actual credentials:
- **AWS credentials** (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`).
- **S3 Bucket Name** (`S3_BUCKET_NAME`).
- **Database Connection** (`RDS_HOSTNAME`, `RDS_PORT`, `RDS_DB_NAME`, `RDS_USERNAME`, `RDS_PASSWORD`).
- **Admin Login**: Define your admin username (`ADMIN_USERNAME`) and password (`ADMIN_PASSWORD`).

---

## Deployment Option A: Running with Docker (Recommended)

Docker Compose sets up Nginx to serve the site on port `5174` and reverse-proxies `/api/*` requests to the backend container.

### Scenario 1: Building and Running Locally (From Source Code)
If you have the source files on your system, you can build and start the containers directly:
```bash
# Build the local Dockerfiles and start the containers
docker-compose up --build
```

### Scenario 2: Deploying via Pre-Built Images from Docker Hub (Without Source Code)
If you want to run the application on any server without copying the source code, you only need a `.env` file and a `docker-compose.yml` file.

1. **Create a `docker-compose.yml` file** on the target machine with the following content:
   ```yaml
   version: '3.8'

   services:
     backend:
       image: unknowndockerishere/dms-backend:latest
       container_name: dms-backend
       ports:
         - "8000:8000"
       env_file:
         - .env
       restart: unless-stopped

     frontend:
       image: unknowndockerishere/dms-frontend:latest
       container_name: dms-frontend
       ports:
         - "5174:80"
       depends_on:
         - backend
       restart: unless-stopped
   ```
2. **Create a `.env` file** in the same directory and populate it with your AWS and database credentials (as described in the Configuration section).
3. **Pull and start the containers**:
   ```bash
   # Pull the latest pre-built images from Docker Hub
   docker-compose pull

   # Start the application in the background (detached mode)
   docker-compose up -d
   ```

### Once Running:
- **Frontend App**: Access at `http://localhost:5174/` (Submit KYC documents and register new vehicles)
- **Admin Dashboard**: Access at `http://localhost:5174/admin` (Manage profiles, view audits, perform deletions)
- **Backend API Docs**: Access at `http://localhost:8000/docs`

---

## Deployment Option B: Running Locally (Manual)

### Prerequisites
- Python 3.12+ installed.
- Node.js 18+ installed.
- Local PostgreSQL instance running.

### 1. Backend Setup
1. Open a terminal and navigate to the project root.
2. Initialize and activate the virtual environment:
   ```bash
   python -m venv myenv
   # On Windows:
   .\myenv\Scripts\activate
   # On macOS/Linux:
   source myenv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```
4. Run the database migrations:
   ```bash
   alembic upgrade head
   ```
5. Start the FastAPI development server:
   ```bash
   uvicorn backend.main:app --host 127.0.0.1 --port 8000
   ```

### 2. Frontend Setup
1. Open a new terminal and navigate to the `frontend/` directory:
   ```bash
   cd frontend
   ```
2. Install npm packages:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   The site will load on `http://127.0.0.1:5174/`.

---

## Credentials

- **Customer Registration**: Anyone can access `http://localhost:5174/` to register their vehicle and upload documents.
- **Administrator**: Navigate to `http://localhost:5174/admin` and enter:
  - **Username**: `admin` (or custom setting)
  - **Password**: The password you defined as `ADMIN_PASSWORD` in `.env`.
