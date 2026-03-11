from threading import local


_state = local()


def set_current_request(request):
    _state.request = request


def clear_current_request():
    if hasattr(_state, 'request'):
        delattr(_state, 'request')


def get_current_request():
    return getattr(_state, 'request', None)


def get_current_user():
    request = get_current_request()
    if not request:
        return None
    user = getattr(request, 'user', None)
    if user and not getattr(user, 'is_anonymous', True):
        return user
    return None


def is_admin_request():
    request = get_current_request()
    return bool(request and str(getattr(request, 'path', '')).startswith('/admin/'))