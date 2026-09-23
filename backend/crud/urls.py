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

# The venue server stores uploads on its own disk and has nothing in front
# of it to serve them - no nginx, and WhiteNoise only handles static files.
# django.conf.urls.static.static() can't do it either: it returns an empty
# list whenever DEBUG is off, so the branch below looked like it served
# media in production while actually adding no route at all, and every
# upload 404'd (diploma templates, profile photos, certificates).
# Cloud is unaffected - it keeps media in object storage, and serving it
# through Django there would be both slower and needless exposure.
if not settings.DEBUG and getattr(settings, 'IS_LOCAL_EVENT_SERVER', False):
    from django.views.static import serve as serve_media

    urlpatterns += [
        re_path(r'^media/(?P<path>.*)$', serve_media, {'document_root': settings.MEDIA_ROOT}),
    ]
elif not settings.DEBUG:
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
            # Match the prefix with OR without its trailing slash (e.g. bare
            # "admin", no slash) so a request like /admin doesn't fall
            # through to the SPA (which has no route for it -> blank page)
            # instead of resolving to Django's own admin/api/etc. and
            # getting its normal APPEND_SLASH redirect.
            re_path(r'^(?!(?:api|admin|media|static|health|ckeditor5)(?:/|$)).*$',
                    TemplateView.as_view(template_name='index.html'),
                    name='frontend'),
        ]
    else:
        urlpatterns += [
            path('', RedirectView.as_view(url='/admin/', permanent=False), name='root-admin-redirect'),
        ]