"""
Production settings for DigitalOcean deployment
Use this by setting: DJANGO_SETTINGS_MODULE=crud.settings_production
"""

from .settings import *
import dj_database_url

# Security
DEBUG = os.getenv('DEBUG', 'False') == 'True'
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', SECRET_KEY)
ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', '').split(',')

# Database - use DATABASE_URL from DigitalOcean
DATABASES['default'] = dj_database_url.config(
    default=os.getenv('DATABASE_URL'),
    conn_max_age=600,
    conn_health_checks=True,
)

# Static files - use WhiteNoise for serving
MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# Media files - served directly by Django in production
# DigitalOcean App Platform requires volumes for persistent media storage
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

# CORS - allow frontend domain
cors_origins = os.getenv('CORS_ALLOWED_ORIGINS', '').split(',')
if cors_origins:
    CORS_ALLOWED_ORIGINS = cors_origins

# CSRF - trust DigitalOcean App Platform domains
CSRF_TRUSTED_ORIGINS = [
    'https://*.ondigitalocean.app',
]
if os.getenv('ALLOWED_HOSTS'):
    for host in os.getenv('ALLOWED_HOSTS', '').split(','):
        if host.strip():
            CSRF_TRUSTED_ORIGINS.append(f'https://{host.strip()}')

# Security settings for production
# Note: SECURE_SSL_REDIRECT is disabled because DigitalOcean App Platform
# handles SSL termination at the load balancer level. Enabling this causes
# infinite redirect loops.
SECURE_SSL_REDIRECT = False  # App Platform handles SSL termination
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_SAMESITE = 'Lax'  # Allow same-site cookies
CSRF_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_HTTPONLY = False  # Allow JavaScript to read CSRF token
CSRF_USE_SESSIONS = False  # Store CSRF token in cookie, not session
CSRF_COOKIE_NAME = 'csrftoken'  # Django's default cookie name
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'

# Trust proxy headers from App Platform load balancer
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Remove debug toolbar in production
if 'debug_toolbar' in INSTALLED_APPS:
    INSTALLED_APPS.remove('debug_toolbar')
if 'debug_toolbar.middleware.DebugToolbarMiddleware' in MIDDLEWARE:
    MIDDLEWARE.remove('debug_toolbar.middleware.DebugToolbarMiddleware')

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

# Frontend integration
# index.html is served from templates directory (already configured in base settings)
# Frontend assets (CSS, JS) are served as static files by WhiteNoise
