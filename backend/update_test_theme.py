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

# Update the default theme with very obvious colors for testing
theme = FrontendTheme.objects.get(name='default')
theme.primary_color = '#ff0000'  # Bright red
theme.secondary_color = '#00ff00'  # Bright green
theme.background_default = '#ffff00'  # Bright yellow
theme.background_paper = '#ff00ff'  # Bright magenta
theme.save()

print("✅ Theme updated with test colors!")
print(f"Primary: {theme.primary_color}")
print(f"Secondary: {theme.secondary_color}")
print(f"Background: {theme.background_default}")
print(f"Paper: {theme.background_paper}")