from django.conf import settings
from corsheaders.signals import check_request_enabled
from django.dispatch import receiver

from .models import ExternalAPIClient


@receiver(check_request_enabled)
def cors_allow_registered_external_clients(sender, request, **kwargs):
    api_root_hosts = {
        item.split(':', 1)[0].strip().lower()
        for item in getattr(settings, 'API_ROOT_HOSTS', [])
        if item and item.strip()
    }
    request_host = request.get_host().split(':', 1)[0].strip().lower()

    if not request.path.startswith('/api/') and request_host not in api_root_hosts:
        return False

    origin = request.headers.get('Origin')
    if not origin:
        return False

    clients = ExternalAPIClient.objects.filter(is_active=True).only('allowed_origins')
    return any(client.is_origin_allowed(origin) for client in clients)