"""Add sample grades to backend"""
import os
import sys
import django

sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'crud.settings')
django.setup()

from api.models import Grade

grades_data = [
    ('Centura Alba', 1, 'inferior'),
    ('Centura Albastra', 2, 'inferior'),
    ('Centura Albastra 1 Dang', 3, 'inferior'),
    ('Centura Galbena', 4, 'inferior'),
    ('Centura Galbena 1 Dang', 5, 'inferior'),
    ('Centura Galbena 2 Dang', 6, 'inferior'),
    ('Centura Galbena 3 Dang', 7, 'inferior'),
    ('Centura Rosie', 8, 'superior'),
    ('Centura Rosie 1 Dang', 9, 'superior'),
    ('Centura Rosie 2 Dang', 10, 'superior'),
    ('Centura Rosie 3 Dang', 11, 'superior'),
]

for name, rank_order, grade_type in grades_data:
    grade, created = Grade.objects.get_or_create(
        name=name,
        defaults={'rank_order': rank_order, 'grade_type': grade_type}
    )
    if created:
        print(f"Created: {name}")
    else:
        print(f"Already exists: {name}")

print(f"\nTotal grades: {Grade.objects.count()}")
