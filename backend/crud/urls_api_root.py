from django.conf import settings
from django.conf.urls.static import static
from django.templatetags.static import static as static_url
from django.urls import include, path
from django.views.generic.base import RedirectView
from rest_framework_simplejwt.views import TokenRefreshView

from api.views import health


urlpatterns = [
    path('favicon.ico', RedirectView.as_view(url=static_url('favicon.svg'), permanent=False)),
    path('i18n/', include('django.conf.urls.i18n')),
    path('', include('api.urls')),
    path('landing/', include('landing.urls')),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('health/', health),
    path('ckeditor5/', include('django_ckeditor_5.urls')),
]

if settings.DEBUG:
    import debug_toolbar

    urlpatterns = [
        path('__debug__/', include(debug_toolbar.urls)),
    ] + urlpatterns

if not settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
else:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)