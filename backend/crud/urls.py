from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
import os
from functools import lru_cache
from django.http import HttpResponse, HttpResponsePermanentRedirect
from django.views.generic import TemplateView
from django.views.generic.base import RedirectView
from django.templatetags.static import static as static_url
from api.views import health
from rest_framework_simplejwt.views import TokenRefreshView


FRONTEND_INDEX_TEMPLATE = os.path.join(settings.BASE_DIR, 'templates', 'index.html')
HAS_FRONTEND_INDEX = os.path.exists(FRONTEND_INDEX_TEMPLATE)

spa_shell = TemplateView.as_view(template_name='index.html')


@lru_cache(maxsize=2048)
def prerendered_page(path):
    """The build-time page for this route (frontend_build/<path>/index.html), or None.

    Read once per process: the files only change with a new deploy, which
    starts new processes anyway.
    """
    root = getattr(settings, 'WHITENOISE_ROOT', None)
    if not root:
        return None
    root = os.path.realpath(root)
    candidate = os.path.realpath(os.path.join(root, path.strip('/'), 'index.html'))
    if not candidate.startswith(root + os.sep) or not os.path.isfile(candidate):
        return None
    with open(candidate, 'rb') as page:
        return page.read()


def frontend(request):
    """Public site pages, at exactly the address their canonical tag names.

    That address never ends in a slash (/noutati, not /noutati/), so the
    slash form gets a 301 to it - otherwise Google sees two URLs with the
    same page. Routes prerendered at build time get their own page, with
    their own title and canonical; everything else (account pages, athlete
    pages, news posted since the last deploy) gets the SPA shell, which
    carries no canonical of its own and lets the app set the right one.
    """
    if request.path != '/' and request.path.endswith('/'):
        query = request.META.get('QUERY_STRING')
        return HttpResponsePermanentRedirect(request.path.rstrip('/') + (f'?{query}' if query else ''))
    page = prerendered_page(request.path)
    if page is not None:
        return HttpResponse(page, content_type='text/html; charset=utf-8')
    return spa_shell(request)

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
                    frontend,
                    name='frontend'),
        ]
    else:
        urlpatterns += [
            path('', RedirectView.as_view(url='/admin/', permanent=False), name='root-admin-redirect'),
        ]