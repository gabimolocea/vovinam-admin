#!/usr/bin/env python
"""
Test admin approval workflow to ensure no duplicate team errors.
"""

import os
import sys
import django

# Add the backend directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'crud.settings')
django.setup()

from api.models import CategoryAthleteScore, Athlete, Category, User, Team

def test_admin_approval():
    print("🔧 Testing Admin Approval Workflow")
    print("=" * 50)
    
    try:
        athletes = list(Athlete.objects.all()[:2])
        category = Category.objects.first()
        admin_user = User.objects.filter(is_staff=True).first()
        
        if len(athletes) < 2:
            print("❌ Need at least 2 athletes")
            return
        if not admin_user:
            print("❌ Need at least 1 admin user")
            return
            
        print(f"✅ Admin user: {admin_user.username}")
        print(f"✅ Test athletes: {[f'{a.first_name} {a.last_name}' for a in athletes]}")
        
        # Test 1: Create a pending team result
        print("\n📝 Test 1: Creating pending team result...")
        team_result = CategoryAthleteScore.objects.create(
            athlete=athletes[0],
            category=category,
            result_type='teams',
            team_name='Admin Test Team',
            placement_claimed='1st',
            notes='Testing admin approval',
            submitted_by_athlete=True,
            status='pending'
        )
        team_result.team_members.set(athletes)
        print(f"✅ Created pending team result with ID: {team_result.id}")
        
        # Test 2: Try admin approval (should not cause duplicate team error)
        print("\n✅ Test 2: Testing admin approval...")
        initial_team_count = Team.objects.count()
        
        try:
            team_result.approve(admin_user, "Admin test approval")
            print("✅ Admin approval successful!")
            
            # Check if team was created
            final_team_count = Team.objects.count()
            print(f"✅ Team count: {initial_team_count} -> {final_team_count}")
            
            # Check category update
            category.refresh_from_db()
            if hasattr(category, 'teams_1st') and category.teams_1st:
                print(f"✅ Category updated: {category.teams_1st}")
            else:
                print("⚠️  Category not updated")
                
        except Exception as e:
            print(f"❌ Admin approval failed: {e}")
            import traceback
            traceback.print_exc()
            
        # Test 3: Try direct admin save (simulating admin interface save)
        print("\n🔄 Test 3: Testing direct admin save...")
        team_result2 = CategoryAthleteScore.objects.create(
            athlete=athletes[1],
            category=category,
            result_type='teams',
            team_name='Direct Save Test',
            placement_claimed='2nd',
            submitted_by_athlete=True,
            status='pending'
        )
        team_result2.team_members.set(athletes)
        
        try:
            # Simulate admin changing status to approved and saving
            team_result2.status = 'approved'
            team_result2.reviewed_by = admin_user
            team_result2.save()
            print("✅ Direct admin save successful!")
            
        except Exception as e:
            print(f"❌ Direct admin save failed: {e}")
            import traceback
            traceback.print_exc()
            
        print("\n🎯 Admin approval tests completed!")
        
    except Exception as e:
        print(f"❌ Error during testing: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    test_admin_approval()