#!/usr/bin/env python
"""
Test the seminar submission API fix
"""
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'crud.settings')
django.setup()

from api.models import *
from django.contrib.auth import get_user_model
from rest_framework.test import APIRequestFactory, force_authenticate
from api.views import TrainingSeminarParticipationViewSet
import json

def test_seminar_submission():
    User = get_user_model()
    
    try:
        # Get test user and athlete
        user = User.objects.get(username='referee@test.com')
        athlete = user.athlete
        print(f'✅ Using user: {user.username}, athlete: {athlete}')
        
        # Get a seminar
        seminar = TrainingSeminar.objects.first()
        if not seminar:
            print('❌ No seminars available for testing')
            return
        print(f'✅ Using seminar: {seminar.name}')
        
        # Create API request
        factory = APIRequestFactory()
        data = {
            'seminar': seminar.id,
            'notes': 'Test submission via fixed API'
        }
        
        request = factory.post('/api/seminar-submissions/', data, format='json')
        force_authenticate(request, user=user)
        
        # Test the ViewSet
        viewset = TrainingSeminarParticipationViewSet()
        viewset.action = 'create'
        viewset.request = request
        viewset.format_kwarg = None
        
        # Call create method
        response = viewset.create(request)
        print(f'✅ Response status: {response.status_code}')
        print(f'✅ Response data: {response.data}')
        
        # Check if participation was created
        participation = TrainingSeminarParticipation.objects.filter(athlete=athlete, seminar=seminar).last()
        if participation:
            print(f'✅ Created participation: {participation.id}')
            print(f'   Status: {participation.status}')
            print(f'   Athlete: {participation.athlete}')
            print(f'   Seminar: {participation.seminar}')
            print(f'   Submitted by athlete: {participation.submitted_by_athlete}')
            print(f'   Notes: {participation.notes}')
        else:
            print('❌ No participation created')
            
    except Exception as e:
        print(f'❌ Error: {e}')
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    test_seminar_submission()