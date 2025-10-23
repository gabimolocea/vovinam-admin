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

from api.models import Athlete, CategoryAthleteScore, TeamMember, Team

def debug_team_results():
    print("=== DEBUGGING TEAM RESULTS ===\n")
    
    # Get athlete with ID 1
    try:
        athlete = Athlete.objects.get(id=1)
        print(f"Athlete: {athlete.first_name} {athlete.last_name} (ID: {athlete.id})")
    except Athlete.DoesNotExist:
        print("Athlete with ID 1 not found")
        return
    
    print("\n1. CategoryAthleteScore entries for this athlete:")
    # Individual results
    individual_results = CategoryAthleteScore.objects.filter(athlete=athlete)
    print(f"   Individual results: {individual_results.count()}")
    for result in individual_results:
        category_name = result.category.name if result.category else 'N/A'
        print(f"   - {result.result_type}: {category_name} - {result.placement_claimed} ({result.status})")
        if result.result_type == 'teams':
            print(f"     Team members: {list(result.team_members.values_list('first_name', flat=True))}")
    
    # Team results (where athlete is a team member)
    print(f"\n2. Team results where athlete is a team member:")
    team_results = CategoryAthleteScore.objects.filter(
        team_members=athlete, 
        result_type='teams'
    ).distinct()
    print(f"   Team results count: {team_results.count()}")
    for result in team_results:
        category_name = result.category.name if result.category else 'N/A'
        print(f"   - {category_name} - {result.placement_claimed} ({result.status})")
        print(f"     Submitted by: {result.athlete.first_name if result.athlete else 'N/A'}")
        print(f"     Team members: {list(result.team_members.values_list('first_name', flat=True))}")
    
    print(f"\n3. ALL results (combined query):")
    from django.db import models
    all_results = CategoryAthleteScore.objects.filter(
        models.Q(athlete=athlete) |                              
        models.Q(team_members=athlete, result_type='teams')      
    ).distinct()
    print(f"   Total results: {all_results.count()}")
    for result in all_results:
        result_type = "Individual" if result.result_type != 'teams' else "Team"
        submitter = result.athlete.first_name if result.athlete else 'N/A'
        category_name = result.category.name if result.category else 'N/A'
        print(f"   - {result_type}: {category_name} - {result.placement_claimed} ({result.status}) by {submitter}")
    
    print(f"\n4. Team objects and members:")
    teams = Team.objects.all()
    print(f"   Total teams: {teams.count()}")
    for team in teams:
        members = team.members.all()
        print(f"   - Team: {team.name} ({members.count()} members)")
        for member in members:
            print(f"     * {member.athlete.first_name} {member.athlete.last_name}")
    
    print(f"\n5. TeamMember relationships:")
    team_memberships = TeamMember.objects.filter(athlete=athlete)
    print(f"   Team memberships for {athlete.first_name}: {team_memberships.count()}")
    for membership in team_memberships:
        print(f"   - Member of team: {membership.team.name}")
    
    print(f"\n6. Check Angel (athlete ID 3) to see if she sees the team result:")
    try:
        angel = Athlete.objects.get(id=3)
        print(f"Angel: {angel.first_name} {angel.last_name} (ID: {angel.id})")
        
        # Check if Angel is in the team members of the team result
        angel_team_results = CategoryAthleteScore.objects.filter(
            team_members=angel, 
            result_type='teams'
        ).distinct()
        print(f"   Angel's team results count: {angel_team_results.count()}")
        for result in angel_team_results:
            category_name = result.category.name if result.category else 'N/A'
            print(f"   - {category_name} - {result.placement_claimed} ({result.status})")
            print(f"     Submitted by: {result.athlete.first_name if result.athlete else 'N/A'}")
            print(f"     Team members: {list(result.team_members.values_list('first_name', flat=True))}")
            
    except Athlete.DoesNotExist:
        print("Angel (athlete ID 3) not found")

if __name__ == "__main__":
    debug_team_results()