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

# Media files configuration
# Use DigitalOcean Spaces (S3-compatible) for persistent media storage in production
USE_SPACES = os.getenv('USE_SPACES', 'False') == 'True'

if USE_SPACES:
    # DigitalOcean Spaces settings
    AWS_ACCESS_KEY_ID = os.getenv('SPACES_ACCESS_KEY_ID')
    AWS_SECRET_ACCESS_KEY = os.getenv('SPACES_SECRET_ACCESS_KEY')
    AWS_STORAGE_BUCKET_NAME = os.getenv('SPACES_BUCKET_NAME')
    AWS_S3_ENDPOINT_URL = os.getenv('SPACES_ENDPOINT_URL')  # e.g., https://fra1.digitaloceanspaces.com
    AWS_S3_REGION_NAME = os.getenv('SPACES_REGION', 'fra1')
    AWS_S3_CUSTOM_DOMAIN = f'{AWS_STORAGE_BUCKET_NAME}.{AWS_S3_REGION_NAME}.digitaloceanspaces.com'
    AWS_S3_OBJECT_PARAMETERS = {
        'CacheControl': 'max-age=86400',
        'ACL': 'public-read',  # Make files publicly readable
    }
    AWS_DEFAULT_ACL = 'public-read'
    AWS_LOCATION = 'media'
    AWS_S3_FILE_OVERWRITE = False
    AWS_QUERYSTRING_AUTH = False  # Don't add auth query parameters to URLs
    AWS_S3_VERIFY = True  # Verify SSL certificates
    
    # Configure separate storage backends for static and media files
    STORAGES = {
        "default": {
            "BACKEND": "storages.backends.s3boto3.S3Boto3Storage",
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
        },
    }
    MEDIA_URL = f'https://{AWS_S3_CUSTOM_DOMAIN}/{AWS_LOCATION}/'
    
    # Debug: Log storage backend info
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f'Using Spaces storage: {AWS_S3_CUSTOM_DOMAIN}')
    logger.info(f'Media URL: {MEDIA_URL}')
else:
    # Local media files (development or without Spaces)
    STORAGES = {
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
        },
    }
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
