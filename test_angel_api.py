#!/usr/bin/env python3

import os
import django
import sys

# Add the backend directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

# Set the Django settings module
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'crud.settings')

# Initialize Django
django.setup()

from api.models import Athlete, CategoryAthleteScore
from django.db import models

def test_angel_api_results():
    print("=== TESTING ANGEL'S API RESULTS ===\n")
    
    try:
        # Get Angel (athlete ID 3)
        angel = Athlete.objects.get(id=3)
        print(f"Testing for: {angel.first_name} {angel.last_name} (ID: {angel.id})")
        
        # Simulate the API query
        scores = CategoryAthleteScore.objects.filter(
            models.Q(athlete=angel) |                              # All individual results (official + submitted)
            models.Q(team_members=angel, result_type='teams')      # All team results they're part of
        ).select_related('category__competition', 'reviewed_by', 'athlete').prefetch_related('team_members').distinct()
        
        print(f"\nTotal results found: {scores.count()}")
        
        for i, score in enumerate(scores, 1):
            print(f"\nResult {i}:")
            print(f"  ID: {score.id}")
            print(f"  Competition: {score.category.competition.name}")
            print(f"  Category: {score.category.name}")
            print(f"  Result Type: {score.result_type}")
            print(f"  Placement: {score.placement_claimed}")
            print(f"  Team name: {score.team_name}")
            print(f"  Status: {score.status}")
            print(f"  Main athlete: {score.athlete.first_name if score.athlete else 'N/A'}")
            if score.team_members.exists():
                print(f"  Team members: {', '.join([f'{m.first_name} {m.last_name}' for m in score.team_members.all()])}")
            print(f"  Angel's role: {'Main Athlete/Submitter' if score.athlete == angel else 'Team Member'}")
        
        if scores.count() == 0:
            print("\n❌ No results found for Angel!")
        else:
            print(f"\n✅ Found {scores.count()} total results for Angel!")
            
    except Athlete.DoesNotExist:
        print("❌ Angel (athlete ID 3) not found")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_angel_api_results()