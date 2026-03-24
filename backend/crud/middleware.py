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