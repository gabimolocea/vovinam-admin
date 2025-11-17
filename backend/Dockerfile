# Multi-stage build: Frontend + Backend
# Note: This requires source directory to be root (/) not /backend
# Update in DigitalOcean: Settings → Source Directory: /

# Stage 1: Build React frontend
FROM node:18-slim AS frontend-builder

WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

# Stage 2: Build Django backend
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Set work directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# Copy Django project
COPY backend/ .

# Copy built frontend from stage 1
# This includes fonts from public/ folder that Vite copies to dist/
COPY --from=frontend-builder /build/dist /app/frontend_build

# Create static and media directories
RUN mkdir -p static media/profile_images media/seminar_certificates media/seminar_documents media/news

# NOTE: collectstatic is run by entrypoint.sh at container startup
# This ensures the staticfiles directory is properly populated after all files are in place

# Copy entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8000

# Use entrypoint script
ENTRYPOINT ["/app/entrypoint.sh"]
