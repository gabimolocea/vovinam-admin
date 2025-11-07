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
    # No-op: custom ADMIN_APP_ORDER removed. Return the incoming app_list so
    # Django's default ordering is used by the admin templates.
    return app_list
