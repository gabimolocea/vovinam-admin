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

from api.models import Athlete, CategoryAthleteScore, Category, Team, CategoryTeam

def test_team_functionality():
    print("=== TESTING TEAM FUNCTIONALITY ===\n")
    
    try:
        # Get an existing team result
        team_result = CategoryAthleteScore.objects.filter(result_type='teams').first()
        if not team_result:
            print("No team results found")
            return
            
        print(f"Found team result: {team_result}")
        print(f"Category: {team_result.category.name}")
        print(f"Competition: {team_result.category.competition.name}")
        print(f"Current team name: {team_result.team_name}")
        print(f"Team members: {list(team_result.team_members.values_list('first_name', flat=True))}")
        print(f"Status: {team_result.status}")
        
        # Test auto-generation of team name
        print(f"\n1. Testing team name auto-generation:")
        if team_result.team_members.exists():
            team_result.auto_generate_team_name()
            print(f"   New team name: {team_result.team_name}")
        
        # Test team creation and enrollment
        print(f"\n2. Testing team enrollment in category:")
        if team_result.status == 'approved':
            team = team_result._create_or_update_team()
            print(f"   Team created/updated: {team.name}")
            
            # Check if team is enrolled in category
            category_teams = CategoryTeam.objects.filter(
                category=team_result.category,
                team__name=team.name
            )
            print(f"   Teams enrolled in category {team_result.category.name}: {category_teams.count()}")
            for ct in category_teams:
                print(f"     - {ct.team.name}")
        
        # Check category page info
        print(f"\n3. Category teams enrollment status:")
        all_category_teams = CategoryTeam.objects.filter(category=team_result.category)
        print(f"   Total teams enrolled in {team_result.category.name}: {all_category_teams.count()}")
        for ct in all_category_teams:
            print(f"     - {ct.team.name} (ID: {ct.team.id})")
            
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_team_functionality()