from django import template
from django.utils.module_loading import import_string

register = template.Library()


def _load_grouping_for_app(app_label):
    """Try to load ADMIN_MODEL_GROUPS from <app_label>.admin if present.

    The structure should be a dict mapping group title -> list of model names
    (model class or model_name strings).
    """
    if not app_label:
        return {}
    try:
        module = import_string(f"{app_label}.admin")
        return getattr(module, 'ADMIN_MODEL_GROUPS', {}) or {}
    except Exception:
        return {}


@register.simple_tag
def app_groups(app):
    """Return a grouped list of models for the given app.

    Usage in template: {% app_groups app as groups %}
    """
    if not app:
        return None

    app_label = app.get('app_label')
    grouping = _load_grouping_for_app(app_label)
    if not grouping:
        return None

    models = list(app.get('models', []))
    models_by_lower = {m.get('object_name', '').lower(): m for m in models}
    used = set()
    groups = []

    for group_title, names in grouping.items():
        group_models = []
        for name in names:
            key = name.lower()
            m = models_by_lower.get(key)
            if m:
                group_models.append(m)
                used.add(m.get('object_name'))
        if group_models:
            groups.append({'group_name': group_title, 'models': group_models})

    leftovers = [m for m in models if m.get('object_name') not in used]
    if leftovers:
        groups.append({'group_name': 'Other', 'models': leftovers})

    return groups


@register.simple_tag
def reorder_app_list(app_list):
    """Return app_list reordered according to settings.ADMIN_APP_ORDER.

    app_list: an iterable of app objects from the admin context.
    """
    from django.conf import settings

    try:
        preferred = list(getattr(settings, 'ADMIN_APP_ORDER', []))
    except Exception:
        preferred = []

    # Build a mapping from app_label -> app object for quick lookup
    mapping = {}
    result = []
    for app in app_list:
        try:
            key = getattr(app, 'app_label', None) or app.get('app_label')
        except Exception:
            key = None
        mapping[key] = app

    # Add apps in preferred order when present
    added = set()
    for label in preferred:
        app = mapping.get(label)
        if app:
            result.append(app)
            added.add(app)

    # Add remaining apps sorted by display name
    leftovers = [a for a in app_list if a not in added]
    try:
        leftovers_sorted = sorted(leftovers, key=lambda a: getattr(a, 'name', a.get('name')))
    except Exception:
        leftovers_sorted = leftovers

    result.extend(leftovers_sorted)
    return result
