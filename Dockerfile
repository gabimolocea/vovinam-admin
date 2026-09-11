# Multi-stage build: public-site (React) frontend + Django backend, bundled
# into one image so Django serves both. Source directory in DigitalOcean App
# Platform must be the repo root (/), not /backend, since the frontend stage
# needs the whole npm workspaces monorepo (apps/public-site + apps/shared).

# Stage 1: Build the public-site frontend (npm workspaces monorepo)
FROM node:20-slim AS frontend-builder

WORKDIR /build
COPY package.json package-lock.json ./
COPY apps/public-site/package.json apps/public-site/package.json
COPY apps/shared/package.json apps/shared/package.json
RUN npm ci

COPY apps/public-site apps/public-site
COPY apps/shared apps/shared

# Baked into the built JS bundle (Vite only reads import.meta.env.VITE_* at
# build time) - the sitemap/prerender scripts also read these directly from
# the environment (see apps/public-site/scripts/lib/fetch-content.mjs).
ARG VITE_API_BASE_URL
ARG VITE_SITE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_SITE_URL=${VITE_SITE_URL}

RUN npm run build --workspace @vovinam/public-site

# Stage 2: Django backend - Django 6.1 requires Python >=3.12
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# The whole built dist/ (not just assets/) is copied to frontend_build/ and
# served at the site root by WhiteNoise (see WHITENOISE_ROOT in
# settings_production.py) - its asset references and prerendered per-route
# folders are root-relative (/assets/..., /frvv-logo.png, /arbitri/), not
# under Django's own /static/ prefix. index.html is ALSO copied into
# templates/ separately, for crud.urls's catch-all SPA-fallback view.
RUN mkdir -p templates frontend_build
COPY --from=frontend-builder /build/apps/public-site/dist /app/frontend_build
COPY --from=frontend-builder /build/apps/public-site/dist/index.html /app/templates/index.html

RUN mkdir -p media/profile_images media/seminar_certificates media/seminar_documents media/news media/grades

# collectstatic/migrate need real runtime env vars (DATABASE_URL, secret key)
# that aren't available at build time - entrypoint.sh (already copied in via
# `COPY backend/ .` above) runs them at container startup instead, right
# before starting gunicorn.
RUN chmod +x /app/entrypoint.sh

RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
