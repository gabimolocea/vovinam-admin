# External API client authentication removed.

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