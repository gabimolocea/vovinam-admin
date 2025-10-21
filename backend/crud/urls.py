from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from api.views import health

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('api.urls')),  # This will match /api/  
    path('health/', health),
    path('landing/', include('landing.urls')),  # Landing app separately
    path("ckeditor5/", include('django_ckeditor_5.urls')),
]

# Serve media files during development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)