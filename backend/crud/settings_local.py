"""
Local venue/LAN settings for competition-day operation.

Use this by setting: DJANGO_SETTINGS_MODULE=crud.settings_local

This is the profile used by the machine physically in the venue that runs
the competition on the local network without depending on internet access.
It talks to a local PostgreSQL database (via docker-compose.local.yml) and
enables the on-demand + scheduled backup/restore panel in competition-admin.

See docs/GHID_COMPETITIE_LOCALA.md for the full operator runbook.
"""

import os

from .settings import *  # noqa: F401,F403


def _bool_env(name, default=False):
    return os.environ.get(name, str(default)) == 'True'


DEBUG = _bool_env('DJANGO_DEBUG', False)
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', SECRET_KEY)

# This server is the source of truth during the event.
IS_LOCAL_EVENT_SERVER = True

# LAN_HOST is already read from the environment in settings.py; docker-compose
# passes it in explicitly so the operator only has to set it in one place.
ALLOWED_HOSTS = list({*ALLOWED_HOSTS, LAN_HOST, '*'})

# --- Database: PostgreSQL, running as the `db` service in docker-compose.local.yml ---
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'frvv_local'),
        'USER': os.environ.get('DB_USER', 'frvv'),
        'PASSWORD': os.environ.get('DB_PASSWORD', 'frvv_local_password'),
        'HOST': os.environ.get('DB_HOST', 'db'),
        'PORT': os.environ.get('DB_PORT', '5432'),
        'CONN_MAX_AGE': 60,
    }
}

# --- Static files served by WhiteNoise (no separate nginx needed for /api and /admin) ---
MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')
STORAGES = {
    'default': {
        'BACKEND': 'django.core.files.storage.FileSystemStorage',
    },
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}

# --- Local event backup/restore ("time travel") ---
# Directory holding pg_dump snapshots + JSON manifests. Mounted as a volume
# in docker-compose.local.yml so backups survive container restarts.
LOCAL_BACKUP_DIR = os.environ.get('LOCAL_BACKUP_DIR', str(BASE_DIR / 'local_backups'))
# How often the `backup_loop` management command (run by the `backup-scheduler`
# service) takes an automatic snapshot.
LOCAL_BACKUP_INTERVAL_MINUTES = int(os.environ.get('LOCAL_BACKUP_INTERVAL_MINUTES', '15'))
# How many snapshots to keep before pruning the oldest ones (disk safety net).
LOCAL_BACKUP_RETENTION_COUNT = int(os.environ.get('LOCAL_BACKUP_RETENTION_COUNT', '200'))

# --- Optional: pull a fresh event pack directly from the cloud instance ---
# When set, the "Resincronizează din cloud" button in SyncCenterPage can fetch
# an up-to-date event pack (e.g. after adding a brand-new athlete/category in
# cloud mid-event) without the operator manually downloading/uploading a file.
# Leave these empty to disable the feature (the button then explains that a
# manual file export/import is needed instead).
CLOUD_SYNC_BASE_URL = os.environ.get('CLOUD_SYNC_BASE_URL', '')
CLOUD_SYNC_USERNAME = os.environ.get('CLOUD_SYNC_USERNAME', '')
CLOUD_SYNC_PASSWORD = os.environ.get('CLOUD_SYNC_PASSWORD', '')

# Debug toolbar is noisy and unnecessary on the venue server.
if 'debug_toolbar' in INSTALLED_APPS:
    INSTALLED_APPS.remove('debug_toolbar')
if 'debug_toolbar.middleware.DebugToolbarMiddleware' in MIDDLEWARE:
    MIDDLEWARE.remove('debug_toolbar.middleware.DebugToolbarMiddleware')

SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_HTTPONLY = False
