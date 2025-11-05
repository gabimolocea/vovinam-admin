import os
import django
import sys
# Ensure backend package on path so Django settings can be found
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'crud.settings')
django.setup()
from api.models import TrainingSeminarParticipation
from django.contrib.auth import get_user_model

print('TrainingSeminarParticipation for athlete id=1')
for p in TrainingSeminarParticipation.objects.filter(athlete__id=1):
    print('id:', p.id, 'seminar_id:', p.seminar_id, 'status:', p.status, 'submitted_by_athlete:', p.submitted_by_athlete, 'reviewed_by:', p.reviewed_by_id, 'submitted_date:', p.submitted_date)

print('\nAll TrainingSeminarParticipation count:', TrainingSeminarParticipation.objects.count())
