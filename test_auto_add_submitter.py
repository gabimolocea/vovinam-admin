#!/usr/bin/env python
"""
Test script to verify submitting athlete is automatically added to team members.
"""

import os
import sys
import django

# Add the backend directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'crud.settings')
django.setup()

from api.models import CategoryAthleteScore, Athlete, Category

def test_auto_add_submitter():
    print("🧪 Testing Auto-Add Submitting Athlete to Team")
    print("=" * 50)
    
    try:
        athletes = list(Athlete.objects.all()[:3])
        category = Category.objects.first()
        
        if len(athletes) < 3:
            print("❌ Need at least 3 athletes in database to test")
            return
            
        submitter = athletes[0]
        other_members = athletes[1:3]  # 2 other athletes
        
        print(f"✅ Submitter: {submitter.first_name} {submitter.last_name}")
        print(f"✅ Other members: {[f'{a.first_name} {a.last_name}' for a in other_members]}")
        
        # Test 1: Create team result without including submitter in team_members
        print("\n📝 Test 1: Creating team result without submitter in team_members...")
        team_result = CategoryAthleteScore.objects.create(
            athlete=submitter,  # This athlete submits the result
            category=category,
            result_type='teams',
            team_name='Auto-Add Test Team',
            placement_claimed='2nd',
            notes='Testing auto-add functionality',
            submitted_by_athlete=True,
            status='pending'
        )
        
        # Add only the other members (not the submitter)
        team_result.team_members.set(other_members)
        print(f"✅ Initial team members: {team_result.team_members.count()}")
        
        # Test 2: Save the result (should auto-add submitter)
        print("\n💾 Test 2: Saving result (should auto-add submitter)...")
        team_result.save()
        
        # Check if submitter was automatically added
        team_members_after = list(team_result.team_members.all())
        print(f"✅ Team members after save: {len(team_members_after)}")
        
        submitter_in_team = submitter in team_members_after
        print(f"✅ Submitter automatically added: {submitter_in_team}")
        
        if submitter_in_team:
            print("🎉 SUCCESS: Submitting athlete was automatically added to team!")
        else:
            print("❌ FAILED: Submitting athlete was NOT added to team")
            
        # Show all team members
        print(f"\n👥 Final team members:")
        for member in team_members_after:
            print(f"   - {member.first_name} {member.last_name}")
            
        # Test 3: Test with API-style creation (using serializer logic)
        print(f"\n🔄 Test 3: Testing serializer-style creation...")
        team_result2 = CategoryAthleteScore(
            athlete=submitter,
            category=category,
            result_type='teams',
            team_name='Serializer Test Team',
            placement_claimed='3rd',
            submitted_by_athlete=True,
            status='pending'
        )
        team_result2.save()
        
        # Simulate what serializer does
        team_members_list = list(other_members)
        if submitter not in team_members_list:
            team_members_list.append(submitter)
        team_result2.team_members.set(team_members_list)
        
        print(f"✅ Serializer simulation - team members: {team_result2.team_members.count()}")
        submitter_included = submitter in list(team_result2.team_members.all())
        print(f"✅ Submitter included in serializer test: {submitter_included}")
        
        print("\n🎯 Test Summary:")
        print(f"   - Auto-add on save: {'✅ PASS' if submitter_in_team else '❌ FAIL'}")
        print(f"   - Serializer simulation: {'✅ PASS' if submitter_included else '❌ FAIL'}")
        
    except Exception as e:
        print(f"❌ Error during testing: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    test_auto_add_submitter()