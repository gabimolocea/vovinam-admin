"""
Centralized admin theme configuration.

Usage:
- Change `DEFAULT_JAZZMIN_PRESET` below, or
- Set env var `JAZZMIN_PRESET` to one of: `frvv`, `classic`, `light`, `dark`.
- Optional UI env vars:
    - `JAZZMIN_SHOW_UI_BUILDER=true|false`
    - `JAZZMIN_SHOW_THEME_CHOOSER=true|false`
    - `JAZZMIN_THEME=<bootswatch-theme>`
    - `JAZZMIN_NAVBAR=<navbar classes>`
    - `JAZZMIN_SIDEBAR=<sidebar classes>`
    - `JAZZMIN_ACCENT=<accent class>`

You can further customize icons, colors, navbar, sidebar, and button styles
from this file without touching the rest of the Django settings.
"""

from copy import deepcopy
import os


DEFAULT_JAZZMIN_PRESET = "frvv"


BASE_JAZZMIN_SETTINGS = {
    "site_title": "Administrare FRVV",
    "site_header": "Administrare FRVV",
    "site_brand": "Administrare FRVV",
    "welcome_sign": "Administrare FRVV",
    "copyright": "FRVV",
    "navigation_expanded": True,
    "show_sidebar": True,
        "show_ui_builder": False,
    "show_theme_chooser": True,
    "use_google_fonts_cdn": True,
        "changeform_format": "single",
        "changeform_format_overrides": {},
    "related_modal_active": False,
    "custom_css": "admin/css/jazzmin-overrides.css",
    "hide_apps": [],
    "icons": {
        "api.Athlete": "fas fa-user-ninja",
        "api.Club": "fas fa-shield-alt",
        "api.Visa": "fas fa-id-card",
        "api.GradeHistory": "fas fa-medal",
        "api.Match": "fas fa-trophy",
        "api.Team": "fas fa-users",
        "landing.Event": "fas fa-calendar-alt",
        "api.Event": "fas fa-calendar-alt",
    },
    "order_with_respect_to": ["api", "landing", "news", "contact", "auth", "reversion"],
}


BASE_JAZZMIN_UI_TWEAKS = {
    "navbar_small_text": False,
    "footer_small_text": False,
    "body_small_text": False,
    "brand_small_text": False,
    "brand_colour": False,
    "accent": "accent-primary",
    "navbar": "navbar-white navbar-light",
    "no_navbar_border": False,
    "navbar_fixed": False,
    "layout_boxed": False,
    "footer_fixed": False,
    "sidebar_fixed": False,
    "sidebar": "sidebar-dark-primary",
    "sidebar_nav_small_text": False,
    "sidebar_disable_expand": False,
    "sidebar_nav_child_indent": False,
    "sidebar_nav_compact_style": False,
    "sidebar_nav_flat_style": False,
    "sidebar_nav_legacy_style": False,
    "theme": "default",
    "default_theme_mode": "light",
    "button_classes": {
        "primary": "btn-primary",
        "secondary": "btn-secondary",
        "info": "btn-info",
        "warning": "btn-warning",
        "danger": "btn-danger",
        "success": "btn-success",
    },
}


PRESET_OVERRIDES = {
    "frvv": {
        "settings": {},
        "ui_tweaks": {},
    },
    "classic": {
        "settings": {
            "site_brand": "Administrare FRVV Clasic",
        },
        "ui_tweaks": {
            "navbar": "navbar-dark navbar-primary",
            "sidebar": "sidebar-dark-primary",
            "brand_colour": "navbar-primary",
            "accent": "accent-primary",
            "sidebar_nav_compact_style": True,
        },
    },
    "light": {
        "settings": {
            "site_brand": "Administrare FRVV Luminos",
        },
        "ui_tweaks": {
            "navbar": "navbar-white navbar-light",
            "sidebar": "sidebar-light-primary",
            "brand_colour": "navbar-light",
            "accent": "accent-info",
            "theme": "flatly",
        },
    },
    "dark": {
        "settings": {
            "site_brand": "Administrare FRVV Întunecat",
        },
        "ui_tweaks": {
            "navbar": "navbar-dark navbar-gray-dark",
            "sidebar": "sidebar-dark-indigo",
            "brand_colour": "navbar-dark",
            "accent": "accent-warning",
            "dark_mode_theme": "darkly",
            "theme": "darkly",
        },
    },
}


def _deep_merge(base, updates):
    result = deepcopy(base)
    for key, value in updates.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def _env_bool(name, default):
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_str(name, default=None):
    value = os.getenv(name)
    if value is None:
        return default
    value = value.strip()
    return value or default


def get_jazzmin_config():
    preset = os.getenv("JAZZMIN_PRESET", DEFAULT_JAZZMIN_PRESET).strip().lower()
    preset_config = PRESET_OVERRIDES.get(preset, PRESET_OVERRIDES[DEFAULT_JAZZMIN_PRESET])

    settings = _deep_merge(BASE_JAZZMIN_SETTINGS, preset_config.get("settings", {}))
    ui_tweaks = _deep_merge(BASE_JAZZMIN_UI_TWEAKS, preset_config.get("ui_tweaks", {}))

    settings["show_ui_builder"] = _env_bool("JAZZMIN_SHOW_UI_BUILDER", settings["show_ui_builder"])
    settings["show_theme_chooser"] = _env_bool("JAZZMIN_SHOW_THEME_CHOOSER", settings["show_theme_chooser"])

    ui_tweaks["theme"] = _env_str("JAZZMIN_THEME", ui_tweaks.get("theme"))
    ui_tweaks["navbar"] = _env_str("JAZZMIN_NAVBAR", ui_tweaks.get("navbar"))
    ui_tweaks["sidebar"] = _env_str("JAZZMIN_SIDEBAR", ui_tweaks.get("sidebar"))
    ui_tweaks["accent"] = _env_str("JAZZMIN_ACCENT", ui_tweaks.get("accent"))

    return settings, ui_tweaks, preset