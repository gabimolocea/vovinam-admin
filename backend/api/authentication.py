from rest_framework import exceptions
from rest_framework.authentication import BaseAuthentication, get_authorization_header

from .models import ExternalAPIClient


class ExternalAPIClientAuthentication(BaseAuthentication):
    keyword = 'Api-Key'

    def authenticate(self, request):
        raw_api_key = self._extract_api_key(request)
        if not raw_api_key:
            return None

        client = ExternalAPIClient.get_for_raw_key(raw_api_key)
        if not client:
            raise exceptions.AuthenticationFailed('Cheie API invalidă.')

        origin = request.META.get('HTTP_ORIGIN') or request.META.get('HTTP_REFERER')
        if not client.is_origin_allowed(origin):
            raise exceptions.AuthenticationFailed('Origine neautorizată pentru această cheie API.')

        if not client.allow_write and request.method not in ('GET', 'HEAD', 'OPTIONS'):
            raise exceptions.AuthenticationFailed('Cheia API este configurată doar pentru citire.')

        user = client.service_user
        if not user or not user.is_active:
            raise exceptions.AuthenticationFailed('Utilizatorul asociat acestei chei API nu este activ.')

        request.api_client = client
        client.mark_used(ip_address=self._get_request_ip(request))
        return (user, None)

    def authenticate_header(self, request):
        return self.keyword

    def _extract_api_key(self, request):
        header_value = (request.META.get('HTTP_X_API_KEY') or '').strip()
        if header_value:
            return header_value

        authorization = get_authorization_header(request).split()
        if len(authorization) == 2 and authorization[0].decode('utf-8').lower() == self.keyword.lower():
            return authorization[1].decode('utf-8').strip()
        return None

    @staticmethod
    def _get_request_ip(request):
        forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
        if forwarded_for:
            return forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR')