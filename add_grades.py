"""Add sample grades to backend"""
import os
import sys
import django

sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'crud.settings')
django.setup()

from api.models import Grade

grades_data = [
    ('Alb - White Belt', 1, 'inferior'),
    ('Albastru 1 - Blue Belt 1', 2, 'inferior'),
    ('Albastru 2 - Blue Belt 2', 3, 'inferior'),
    ('Galben 1 - Yellow Belt 1', 4, 'inferior'),
    ('Galben 2 - Yellow Belt 2', 5, 'inferior'),
    ('Roșu 1 - Red Belt 1', 6, 'superior'),
    ('Roșu 2 - Red Belt 2', 7, 'superior'),
    ('Negru 1 Dan', 8, 'superior'),
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
