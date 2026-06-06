from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
import os
from django.views.generic import TemplateView
from django.views.generic.base import RedirectView
from django.templatetags.static import static as static_url
from api.views import health
from rest_framework_simplejwt.views import TokenRefreshView


FRONTEND_INDEX_TEMPLATE = os.path.join(settings.BASE_DIR, 'templates', 'index.html')
HAS_FRONTEND_INDEX = os.path.exists(FRONTEND_INDEX_TEMPLATE)

urlpatterns = [
    path('favicon.ico', RedirectView.as_view(url=static_url('favicon.svg'), permanent=False)),
    path('admin/', admin.site.urls),
    path('i18n/', include('django.conf.urls.i18n')),
    path('api/', include('api.urls')),  # API endpoints will be at /api/
    path('health/', health),
    path('api/landing/', include('landing.urls')),  # Landing app under API structure
    path("ckeditor5/", include('django_ckeditor_5.urls')),
    
    # JWT token refresh endpoint
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]

# Debug toolbar URLs (dev only)
if settings.DEBUG:
    import debug_toolbar
    urlpatterns = [
        path('__debug__/', include(debug_toolbar.urls)),
    ] + urlpatterns

# Serve media files in production (WhiteNoise handles static files)
if not settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
else:
    # Development: serve both static and media
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)

if not settings.DEBUG:
    if HAS_FRONTEND_INDEX:
        # Catch-all route for React (must be last)
        # Serve index.html for all non-API routes (React Router)
        urlpatterns += [
            re_path(r'^(?!api/|admin/|media/|static/|health/|ckeditor5/).*$', 
                    TemplateView.as_view(template_name='index.html'), 
                    name='frontend'),
        ]
    else:
        urlpatterns += [
            path('', RedirectView.as_view(url='/admin/', permanent=False), name='root-admin-redirect'),
        ]