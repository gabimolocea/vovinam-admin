from django.conf import settings
from django.urls import clear_url_caches, set_urlconf


def normalize_host(host):
    if not host:
        return ''
    return host.split(':', 1)[0].strip().lower()


def get_host_specific_urlconf(host):
    normalized_host = normalize_host(host)
    if not normalized_host:
        return None

    admin_hosts = {normalize_host(item) for item in getattr(settings, 'ADMIN_ROOT_HOSTS', [])}
    api_hosts = {normalize_host(item) for item in getattr(settings, 'API_ROOT_HOSTS', [])}

    if normalized_host in admin_hosts:
        return 'crud.urls_admin_root'
    if normalized_host in api_hosts:
        return 'crud.urls_api_root'
    return None


class HostBasedURLConfMiddleware:
    """Switch URL configuration based on the requested host."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.urlconf = get_host_specific_urlconf(request.get_host())
        if request.urlconf:
            clear_url_caches()
            set_urlconf(request.urlconf)

        try:
            response = self.get_response(request)
        finally:
            set_urlconf(None)

        return response