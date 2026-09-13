# ==========================================
# Stage 1: Build Frontend Assets (Node.js)
# ==========================================
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend

# Leverage Docker cache for npm dependencies
COPY frontend/package*.json ./
RUN npm install

# Build static React SPA
COPY frontend/ ./
RUN npm run build

# ==========================================
# Stage 2: Unified Python Runtime
# ==========================================
FROM python:3.12-slim
WORKDIR /app

# Performance and Python environment settings
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    PYTHONPATH=/app

# Install only the required runtime tools (postgresql-client for pg_dump backups)
# Clean up apt caches immediately to minimize layer size
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Install pruned Python dependencies with layer caching
COPY backend/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt \
    && rm -rf /root/.cache/pip

# Copy Alembic database migration config & backend application code
COPY alembic.ini /app/alembic.ini
COPY backend /app/backend

# Copy compiled frontend assets from Stage 1 (no node_modules or node runtime included)
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Expose unified application port (API + Frontend UI)
EXPOSE 8000

# Auto-migrate database on container boot and launch Uvicorn with exec for graceful signal forwarding
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn backend.main:app --host 0.0.0.0 --port 8000"]
