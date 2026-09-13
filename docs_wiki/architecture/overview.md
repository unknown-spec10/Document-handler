# Architectural Overview: Document Management System (DMS)

This document describes the high-level architecture, data layers, security boundaries, container services, and cloud storage patterns of the Document Management System.

---

## 🏛️ System Architecture Diagram

```mermaid
flowchart TD
    subgraph Client ["Client Presentation Layer"]
        Browser["Admin Web Browser"]
    end

    subgraph Docker ["Docker Multi-Container Layer (Project: dms)"]
        subgraph AppContainer ["dms-backend Container (127.0.0.1:8000)"]
            SPA["Compiled React SPA (Static Mount)"]
            FastAPI["FastAPI ASGI Backend"]
            Scheduler["AsyncIOScheduler (Background)"]
            Engine["Backup Engine (Native pg_dump)"]
        end

        Postgres["PostgreSQL 15 Container (dms-postgres: 5433)"]
        Volume[("Named Docker Volume: dms_pgdata")]
        Redis["Redis Container (dms-redis: 6379)"]

        subgraph UpdaterService ["dms-updater Container (Internal :8080)"]
            Webhook["Update Webhook Listener"]
            DockerCLI["Docker CLI & Compose via docker.sock"]
        end
    end

    subgraph Cloud ["AWS Cloud Services (Isolated)"]
        S3Docs["S3 Bucket: document-managerr/uploads/*"]
        S3Backups["S3 Bucket: document-managerr/backups/postgres/* (WORM Lock)"]
    end

    Browser <-->|HTTP / Single Port 8000| AppContainer
    FastAPI <-->|SQLAlchemy AsyncPG| Postgres
    Postgres <--> Volume
    FastAPI <-->|Session / Cache| Redis
    FastAPI -->|Async Presigned URL / SSE-S3| S3Docs
    Scheduler -->|Scheduled 02:00 UTC + Startup Catch-Up| Engine
    Engine -->|pg_dump over Docker Network| Postgres
    Engine -->|Stream Upload + WORM Retention| S3Backups
    FastAPI -->|POST /v1/update (Internal Token)| Webhook
    Webhook -->|docker pull & compose up -d| DockerCLI
    DockerCLI -.->|In-Place Recreate (10s)| AppContainer
```

---

## 🧩 Core Architectural Components

### 1. Unified Presentation & API Container (`dms-backend`)
* **Single-Port Architecture:** Eliminates Nginx and separate frontend dev servers. The production React SPA is built into static assets served directly by FastAPI via `/assets` mount and an HTML5 history fallback route on port **8000**.
* **Auto-Migration on Boot:** The container entrypoint executes `alembic upgrade head` before launching Uvicorn via `exec uvicorn` for graceful signal forwarding.
* **Dynamic In-Memory Session Tokens:** Admin authentication replaces static JWTs with high-entropy 32-byte cryptographic tokens (`secrets.token_urlsafe(32)`) generated in memory on startup and invalidated on logout or container restart.
* **Origin Header Validation:** Custom middleware rejects cross-site requests to `/api/` endpoints unless originating from `127.0.0.1` or `localhost`.

### 2. Dedicated In-App Updater Service (`dms-updater`)
* **Native Docker Compose Automation:** Runs `docker:cli` with access to the host Docker daemon socket (`/var/run/docker.sock`).
* **Zero Host Ports:** Listens exclusively on the internal Docker bridge network on port `8080` protected by a bearer token.
* **Isolated Recreate:** When triggered by `POST /api/admin/system/update`, the updater executes `docker pull deepdocker2023/dms-backend:latest` and `docker compose up -d --no-deps backend`.
* **Zero Database Interruption:** PostgreSQL and Redis containers remain running and untouched during updates. Total container swap completes in **~10 seconds**.

### 3. Database & Caching Layer
* **PostgreSQL:** Runs inside Docker (`postgres:15-alpine`), mapped to host loopback port **`127.0.0.1:5433`** to avoid port collisions with native host PostgreSQL instances.
* **Named Project Isolation:** `name: dms` defined in `docker-compose.yml` ensures all volumes and networks are deterministically named (`dms_default`, `dms_pgdata`) across all host machines.
* **Redis:** Runs in Docker (`redis:alpine`) on **`127.0.0.1:6379`** for caching search queries and rate limiting.

### 4. Cloud Storage & Automated Catch-Up Backup
* **S3 Isolate:** AWS S3 is the sole external cloud dependency. Documents are encrypted with SSE-S3 (AES-256) and verified with SHA-256 checksums.
* **Automated Startup Catch-Up:** In addition to the daily 02:00 UTC schedule, an asynchronous startup worker checks `storage_logs` 5 seconds after boot. If the last backup snapshot is older than 20 hours (e.g. laptop was powered off overnight), it triggers a non-blocking background backup immediately.
* **Container-Native Backup Engine:** Dumps are created using native `pg_dump` connecting across the internal container bridge network, requiring zero PostgreSQL tools installed on the host.
* **WORM Retention Matrix:** Retains 7 daily snapshots + 4 weekly (Sunday) snapshots with S3 Object Lock retention compliance. Older snapshots are automatically purged.
