#!/usr/bin/env python
import os
import sys
import django

# Add the project directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'crud.settings')
django.setup()

from api.models import FrontendTheme

# Create default theme
default_theme, created = FrontendTheme.objects.get_or_create(
    name='default',
    defaults={
        'is_active': True,
        'primary_color': '#0d47a1',
        'primary_light': '#5e7ce2',
        'primary_dark': '#002171',
        'secondary_color': '#f50057',
        'background_default': '#f5f5f5',
        'background_paper': '#ffffff',
        'text_primary': '#212121',
        'text_secondary': '#757575',
        'font_family': 'BeVietnam, Roboto, Helvetica, Arial, sans-serif',
        'font_size_base': 14,
        'font_weight_normal': 400,
        'font_weight_medium': 500,
        'font_weight_bold': 700,
        'border_radius': 8,
        'spacing_unit': 8,
        'button_border_radius': 8,
        'card_elevation': 2,
        'table_row_hover': '#f5f5f5',
        'custom_tokens': {}
    }
)

if created:
    print("✅ Default theme created successfully!")
else:
    print("ℹ️ Default theme already exists")
    
print(f"Theme: {default_theme.name}")
print(f"Active: {default_theme.is_active}")
print(f"Primary Color: {default_theme.primary_color}")