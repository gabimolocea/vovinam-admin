#!/usr/bin/env python
import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'crud.settings')
sys.path.insert(0, '.')
django.setup()

from api.models import User, CategoryAthleteScore, Notification
from api.notification_utils import create_result_status_notification

def test_rejection_notification():
    print("🧪 Testing Rejection Notification System")
    print("=" * 50)
    
    # Find test data
    admin_user = User.objects.filter(role='admin').first()
    result = CategoryAthleteScore.objects.first()
    
    if not admin_user:
        print("❌ No admin user found")
        return
    
    if not result:
        print("❌ No CategoryAthleteScore found")
        return
    
    print(f"👨‍💼 Admin: {admin_user.get_full_name()}")
    print(f"🏆 Result: {result.athlete.first_name} {result.athlete.last_name} - {result.category.name}")
    print(f"📊 Current status: {result.status}")
    
    # Count notifications before
    before_count = Notification.objects.filter(
        recipient=result.athlete.user,
        notification_type='result_rejected'
    ).count()
    
    print(f"📧 Rejection notifications before: {before_count}")
    
    # Create rejection notification
    print("\n🔄 Creating rejection notification...")
    try:
        create_result_status_notification(
            result=result,
            new_status='rejected',
            admin_user=admin_user,
            admin_notes='Your result submission needs additional documentation to verify the placement claimed.'
        )
        print("✅ Rejection notification created successfully!")
    except Exception as e:
        print(f"❌ Error creating notification: {e}")
        return
    
    # Count notifications after
    after_count = Notification.objects.filter(
        recipient=result.athlete.user,
        notification_type='result_rejected'
    ).count()
    
    print(f"📧 Rejection notifications after: {after_count}")
    
    # Show the notification details
    if after_count > before_count:
        notification = Notification.objects.filter(
            recipient=result.athlete.user,
            notification_type='result_rejected'
        ).last()
        
        print("\n📋 Notification Details:")
        print(f"   Title: {notification.title}")
        print(f"   Message: {notification.message}")
        print(f"   Type: {notification.notification_type}")
        print(f"   Read: {notification.is_read}")
        print(f"   Created: {notification.created_at}")
    
    # Show total notifications for athlete
    total_notifications = Notification.objects.filter(recipient=result.athlete.user).count()
    unread_notifications = Notification.objects.filter(recipient=result.athlete.user, is_read=False).count()
    
    print(f"\n📊 Total notifications for athlete: {total_notifications}")
    print(f"📊 Unread notifications: {unread_notifications}")
    
    print("\n✅ Test completed successfully!")

if __name__ == "__main__":
    test_rejection_notification()