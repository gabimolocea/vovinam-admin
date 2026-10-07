from django.utils import translation


class ForceRomanianLanguageMiddleware:
    """Force Romanian as the active language for the whole Django interface."""

    language_code = 'ro'

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        translation.activate(self.language_code)
        request.LANGUAGE_CODE = self.language_code

        response = self.get_response(request)
        response.headers['Content-Language'] = self.language_code
        translation.deactivate()
        return response

class PrimaryHostRedirectMiddleware:
    """301 every alias domain of the public site to the one primary domain.

    www.vovinam.ro, vovinam-vietvodao.ro and www.vovinam-vietvodao.ro all
    point at the same app and used to answer 200 with the exact same pages.
    The canonical tag named vovinam.ro, but Google still found four copies
    of every page and reported them as "Duplicate without user-selected
    canonical". A permanent redirect leaves it a single address to index.
    """

    def __init__(self, get_response):
        from django.conf import settings

        self.get_response = get_response
        self.primary_host = getattr(settings, 'PRIMARY_SITE_HOST', '')
        self.alias_hosts = {host.lower() for host in getattr(settings, 'PRIMARY_SITE_ALIAS_HOSTS', [])}

    def __call__(self, request):
        host = request.get_host().split(':', 1)[0].lower()
        if self.primary_host and host in self.alias_hosts:
            from django.http import HttpResponsePermanentRedirect

            return HttpResponsePermanentRedirect(f'https://{self.primary_host}{request.get_full_path()}')
        return self.get_response(request)
