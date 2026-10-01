"""
Production settings for DigitalOcean deployment
Use this by setting: DJANGO_SETTINGS_MODULE=crud.settings_production
"""

from .settings import *
import dj_database_url


def _csv_env(name):
    return [item.strip() for item in os.getenv(name, '').split(',') if item.strip()]

# Security
DEBUG = os.getenv('DEBUG', 'False') == 'True'
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', SECRET_KEY)
ALLOWED_HOSTS = _csv_env('ALLOWED_HOSTS')
ADMIN_ROOT_HOSTS = _csv_env('ADMIN_ROOT_HOSTS')
API_ROOT_HOSTS = _csv_env('API_ROOT_HOSTS')

# Database - use DATABASE_URL from DigitalOcean
DATABASES['default'] = dj_database_url.config(
    default=os.getenv('DATABASE_URL'),
    conn_max_age=600,
    conn_health_checks=True,
)

# Static files - use WhiteNoise for serving
MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')

# The built public-site (Vite `dist/`, copied into the image at
# frontend_build/ by the root Dockerfile) is served as-is at the site root -
# separate from Django's own /static/ (admin, DRF, CKEditor) - since its
# asset references are root-relative (/assets/..., /frvv-logo.png) rather
# than under /static/. WHITENOISE_INDEX_FILE lets prerendered per-route
# folders (frontend_build/arbitri/index.html, etc.) resolve when a crawler
# requests the bare path; the SPA fallback for routes with no prerendered
# folder is still handled by crud.urls's catch-all view rendering
# templates/index.html (also copied there by the Dockerfile).
WHITENOISE_ROOT = os.path.join(BASE_DIR, 'frontend_build')
WHITENOISE_INDEX_FILE = True

# Cat tine browserul un fisier fara sa ne mai intrebe.
#
# WhiteNoise da un an fisierelor care au hash-ul continutului in nume, dar
# verificarea lui se opreste din prima linie la tot ce nu e sub STATIC_URL
# - iar site-ul public e servit din radacina. Asa se ajungea ca si
# `/assets/index-1fCJVdGa.js`, 600 KB cu hash in nume, sa fie reverificat
# la fiecare minut de fiecare vizitator.
#
# Regexul de mai jos prinde exact ce are hash in nume: fisierele scoase de
# Vite in /assets/ si fonturile din /fonts/. Nu prinde paginile HTML
# (inclusiv cele prerenderate pe rute), robots.txt, sitemap.xml sau
# imaginile din public/ - acelea trebuie sa poata fi inlocuite si vazute,
# si rama cu `max_age` de un minut.
#
# De stiut daca se trece vreodata la ManifestStaticFilesStorage: setarea
# asta inlocuieste cu totul verificarea bazata pe manifest a WhiteNoise,
# deci atunci regexul trebuie sa acopere si /static/.
WHITENOISE_IMMUTABLE_FILE_TEST = r'^/(assets/.+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+|fonts/.+\.[0-9a-f]{8}\.woff2)$'

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
    # Prin CDN, nu direct din Space. Diferenta e ".cdn." din mijloc, si
    # fara ea endpoint-ul CDN exista, se plateste, si nu serveste nimic:
    # fiecare adresa emisa de Django ocoleste marginea si loveste
    # originea din Frankfurt.
    _spaces_origin = f'{AWS_STORAGE_BUCKET_NAME}.{AWS_S3_REGION_NAME}.digitaloceanspaces.com'
    AWS_S3_CUSTOM_DOMAIN = os.getenv('SPACES_CDN_DOMAIN') or (
        f'{AWS_STORAGE_BUCKET_NAME}.{AWS_S3_REGION_NAME}.cdn.digitaloceanspaces.com'
    )

    # Un an. Numele fisierelor sunt practic imuabile - AWS_S3_FILE_OVERWRITE
    # e False, deci Django adauga sufix la coliziune si nimic nu se
    # schimba vreodata sub acelasi nume. Cu o ora, fiecare vizitator
    # reincarca aceleasi sigle in fiecare zi degeaba.
    AWS_S3_OBJECT_PARAMETERS = {
        'CacheControl': 'public, max-age=31536000, immutable',
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
            "BACKEND": "api.storages.OptimizedS3Storage",
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
        },
    }
    MEDIA_URL = f'https://{AWS_S3_CUSTOM_DOMAIN}/{AWS_LOCATION}/'

    # CKEditor scria pe discul containerului, dar adresa imaginii se
    # compune din MEDIA_URL - adica Spaces. Rezultatul: poza ajungea
    # undeva unde adresa ei nu arata, iar in articol ramanea o imagine
    # stricata. Si chiar daca adresa ar fi fost locala, discul de pe App
    # Platform se sterge la fiecare deploy, deci poza ar fi disparut
    # oricum la urmatoarea publicare.
    CKEDITOR_5_FILE_STORAGE = 'api.storages.OptimizedS3Storage'
    
    # Debug: Log storage backend info
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f'Using Spaces storage: {AWS_S3_CUSTOM_DOMAIN}')
    logger.info(f'Media URL: {MEDIA_URL}')
else:
    # Local media files (development or without Spaces)
    STORAGES = {
        "default": {
            "BACKEND": "api.storages.OptimizedFileSystemStorage",
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
        },
    }
    MEDIA_URL = '/media/'
    MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

# CORS - allow frontend domain
cors_origins = _csv_env('CORS_ALLOWED_ORIGINS')
if cors_origins:
    CORS_ALLOWED_ORIGINS = cors_origins

# CSRF - trust only this app's own hosts (from ALLOWED_HOSTS), never a bare
# "*.ondigitalocean.app" wildcard: that would also trust every other
# customer's app on the platform as a valid CSRF origin for this backend.
CSRF_TRUSTED_ORIGINS = [f'https://{host}' for host in ALLOWED_HOSTS if not host.startswith('.')]

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
