#!/usr/bin/env python3
"""
Create superuser for testing
"""
import os
import sys
import django

# Set up Django
backend_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backend')
sys.path.append(backend_path)
os.chdir(backend_path)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'crud.settings')
django.setup()

from django.contrib.auth import get_user_model

User = get_user_model()

# Check existing superusers
existing_superusers = User.objects.filter(is_superuser=True)
print("Existing superusers:", list(existing_superusers.values_list('username', flat=True)))

# Create testadmin if it doesn't exist
if not User.objects.filter(username='testadmin').exists():
    user = User.objects.create_superuser('testadmin', 'testadmin@test.com', 'admin123')
    print(f"Created superuser: {user.username}")
else:
    print("testadmin already exists")

# Also check if there's already a superuser we can use
if existing_superusers.exists():
    admin_user = existing_superusers.first()
    print(f"Can use existing superuser: {admin_user.username}")