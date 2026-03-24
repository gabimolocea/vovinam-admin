from corsheaders.signals import check_request_enabled
from django.dispatch import receiver

from .models import ExternalAPIClient


@receiver(check_request_enabled)
def cors_allow_registered_external_clients(sender, request, **kwargs):
    if not request.path.startswith('/api/'):
        return False

    origin = request.headers.get('Origin')
    if not origin:
        return False

    clients = ExternalAPIClient.objects.filter(is_active=True).only('allowed_origins')
    return any(client.is_origin_allowed(origin) for client in clients)