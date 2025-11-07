import os
import sys

# Ensure workspace root is on the path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'crud.settings')
import django
django.setup()

from api.models import Visa

# Try importing legacy models if they exist
try:
    from api.models import MedicalVisa
except Exception:
    MedicalVisa = None
try:
    from api.models import AnnualVisa
except Exception:
    AnnualVisa = None

print('--- Counts ---')
print('Visa total:', Visa.objects.count())
if MedicalVisa is not None:
    print('MedicalVisa total:', MedicalVisa.objects.count())
else:
    print('MedicalVisa model: NOT FOUND')
if AnnualVisa is not None:
    print('AnnualVisa total:', AnnualVisa.objects.count())
else:
    print('AnnualVisa model: NOT FOUND')

print('\n--- Sample Visas (first 10) ---')
for v in Visa.objects.all()[:10]:
    print(f'ID={v.id}, athlete_id={v.athlete_id}, type={v.visa_type}, issued_date={v.issued_date}, visa_status={getattr(v, "visa_status", None)}, health_status={getattr(v, "health_status", None)}, document={bool(getattr(v, "document", None))}, image={bool(getattr(v, "image", None))}')

# Cross-check counts by type
print('\n--- Counts by type ---')
from django.db.models import Count
counts = Visa.objects.values('visa_type').annotate(count=Count('id'))
for row in counts:
    print(row['visa_type'], row['count'])

print('\nDone.')
