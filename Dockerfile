# Multi-stage build: Frontend + Backend
# Note: This requires source directory to be root (/) not /backend
# Update in DigitalOcean: Settings → Source Directory: /

# Stage 1: Build React frontend
FROM node:20-slim AS frontend-builder

WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci --legacy-peer-deps
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
# index.html goes to templates for the catch-all route
RUN mkdir -p templates
COPY --from=frontend-builder /build/dist/index.html /app/templates/

# Assets (CSS, JS, images) go to static directory for WhiteNoise
RUN mkdir -p static/assets
COPY --from=frontend-builder /build/dist/assets /app/static/assets

# Create media directory
RUN mkdir -p media/profile_images media/seminar_certificates media/seminar_documents media/news

# Collect static files (includes frontend assets)
RUN python manage.py collectstatic --noinput

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8000

# Run gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "120", "crud.wsgi:application"]
