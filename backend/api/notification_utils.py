"""
Utility functions for creating and managing notifications
"""
from django.utils import timezone
from .models import Notification, User, NotificationSettings


def create_notification(recipient, notification_type, title, message, related_result=None, related_competition=None, action_data=None):
    """
    Create a notification for a user
    
    Args:
        recipient: User object or user ID
        notification_type: String from Notification.NOTIFICATION_TYPES
        title: Notification title
        message: Notification message
        related_result: Optional CategoryAthleteScore object (must be saved to DB)
        related_competition: Optional Competition object (must be saved to DB)
        action_data: Optional dict with additional data
    
    Returns:
        Notification object if created, None if user has disabled this notification type
    """
    if isinstance(recipient, int):
        try:
            recipient = User.objects.get(id=recipient)
        except User.DoesNotExist:
            return None
    
    # Check user's notification settings
    settings, _ = NotificationSettings.objects.get_or_create(user=recipient)
    
    # Map notification types to settings fields
    setting_mapping = {
        'result_submitted': 'notify_result_submitted',
        'result_approved': 'notify_result_approved',
        'result_rejected': 'notify_result_rejected',
        'result_revision_required': 'notify_result_revision_required',
        'grade_submitted': 'notify_grade_submitted',
        'grade_approved': 'notify_grade_approved',
        'grade_rejected': 'notify_grade_rejected',
        'grade_revision_required': 'notify_grade_revision_required',
        'seminar_submitted': 'notify_seminar_submitted',
        'seminar_approved': 'notify_seminar_approved',
        'seminar_rejected': 'notify_seminar_rejected',
        'seminar_revision_required': 'notify_seminar_revision_required',
        'competition_created': 'notify_competition_created',
        'competition_updated': 'notify_competition_updated',
        'system_announcement': 'notify_system_announcements',
    }
    
    # Check if user wants this type of notification
    setting_field = setting_mapping.get(notification_type)
    if setting_field and not getattr(settings, setting_field, True):
        return None
    
    # Only include related objects if they are saved to the database
    notification_data = {
        'recipient': recipient,
        'notification_type': notification_type,
        'title': title,
        'message': message,
        'action_data': action_data
    }
    
    # Only add related objects if they have been saved (have an ID)
    if related_result and hasattr(related_result, 'pk') and related_result.pk:
        notification_data['related_result'] = related_result
    
    if related_competition and hasattr(related_competition, 'pk') and related_competition.pk:
        notification_data['related_competition'] = related_competition
    
    # Create the notification
    notification = Notification.objects.create(**notification_data)
    
    return notification


def create_result_submitted_notification(result):
    """Create notification when an athlete submits a result"""
    athlete = result.athlete
    
    # Notification for the athlete (confirmation)
    create_notification(
        recipient=athlete.user,
        notification_type='result_submitted',
        title='Result Submitted Successfully',
        message=f'Your result for {result.category.name} in {result.category.competition.name} has been submitted and is pending review.',
        related_result=result,
        action_data={
            'category_name': result.category.name,
            'competition_name': result.category.competition.name,
            'placement_claimed': result.placement_claimed,
            'result_type': result.type
        }
    )
    
    # Notification for admin users
    admin_users = User.objects.filter(role='admin')
    for admin in admin_users:
        create_notification(
            recipient=admin,
            notification_type='result_submitted',
            title='New Result Submitted for Review',
            message=f'{athlete.first_name} {athlete.last_name} submitted a result for {result.category.name} in {result.category.competition.name}.',
            related_result=result,
            action_data={
                'athlete_name': f'{athlete.first_name} {athlete.last_name}',
                'category_name': result.category.name,
                'competition_name': result.category.competition.name,
                'placement_claimed': result.placement_claimed,
                'result_type': result.type
            }
        )


def create_result_status_notification(result, new_status, admin_user, admin_notes=''):
    """Create notification when result status changes (approved/rejected/revision_required)"""
    athlete = result.athlete
    
    # Map status to notification type and messages
    status_mapping = {
        'approved': {
            'type': 'result_approved',
            'title': '🎉 Result Approved!',
            'message': f'Congratulations! Your result for {result.category.name} in {result.category.competition.name} has been approved.',
        },
        'rejected': {
            'type': 'result_rejected',
            'title': 'Result Rejected',
            'message': f'Your result for {result.category.name} in {result.category.competition.name} has been rejected.',
        },
        'revision_required': {
            'type': 'result_revision_required',
            'title': 'Result Revision Required',
            'message': f'Your result for {result.category.name} in {result.category.competition.name} requires revision.',
        }
    }
    
    status_info = status_mapping.get(new_status)
    if not status_info:
        return
    
    # Add admin notes to message if provided
    message = status_info['message']
    if admin_notes:
        message += f'\n\nAdmin notes: {admin_notes}'
    
    # Create notification for the athlete
    create_notification(
        recipient=athlete.user,
        notification_type=status_info['type'],
        title=status_info['title'],
        message=message,
        related_result=result,
        action_data={
            'category_name': result.category.name,
            'competition_name': result.category.competition.name,
            'placement_claimed': result.placement_claimed,
            'result_type': result.type,
            'reviewed_by': admin_user.get_full_name() if admin_user else 'Admin',
            'admin_notes': admin_notes,
            'new_status': new_status
        }
    )


def create_competition_notification(competition, notification_type='competition_created'):
    """Create notification for competition events"""
    # Notify all athletes about new/updated competitions
    athletes = User.objects.filter(role='athlete')
    
    if notification_type == 'competition_created':
        title = 'New Competition Available'
        message = f'A new competition "{competition.name}" has been created and is available for registration.'
    else:
        title = 'Competition Updated'
        message = f'The competition "{competition.name}" has been updated. Please check for any changes.'
    
    for athlete in athletes:
        create_notification(
            recipient=athlete,
            notification_type=notification_type,
            title=title,
            message=message,
            related_competition=competition,
            action_data={
                'competition_name': competition.name,
                'competition_date': competition.date.isoformat() if competition.date else None,
                'location': getattr(competition, 'location', ''),
            }
        )


def get_unread_notification_count(user):
    """Get count of unread notifications for a user"""
    return Notification.objects.filter(recipient=user, is_read=False).count()


def mark_notifications_as_read(user, notification_ids=None):
    """Mark notifications as read for a user"""
    queryset = Notification.objects.filter(recipient=user, is_read=False)
    
    if notification_ids:
        queryset = queryset.filter(id__in=notification_ids)
    
    updated_count = queryset.update(is_read=True, read_at=timezone.now())
    return updated_count


# Grade History Notification Functions
def create_grade_submitted_notification(grade_history):
    """Create notification when an athlete submits a grade history"""
    athlete = grade_history.athlete
    
    # Notification for the athlete (confirmation)
    create_notification(
        recipient=athlete.user,
        notification_type='grade_submitted',
        title='Grade Exam Submitted Successfully',
        message=f'Your grade exam submission for {grade_history.grade.name} has been submitted and is pending review.',
        action_data={
            'grade_name': grade_history.grade.name,
            'exam_date': grade_history.exam_date.isoformat() if grade_history.exam_date else None,
            'exam_place': grade_history.exam_place,
            'level': grade_history.level
        }
    )
    
    # Notification for admin users
    admin_users = User.objects.filter(role='admin')
    for admin in admin_users:
        create_notification(
            recipient=admin,
            notification_type='grade_submitted',
            title='New Grade Exam Submitted for Review',
            message=f'{athlete.first_name} {athlete.last_name} submitted a grade exam for {grade_history.grade.name}.',
            action_data={
                'athlete_name': f'{athlete.first_name} {athlete.last_name}',
                'grade_name': grade_history.grade.name,
                'exam_date': grade_history.exam_date.isoformat() if grade_history.exam_date else None,
                'exam_place': grade_history.exam_place,
                'level': grade_history.level
            }
        )


def create_grade_status_notification(grade_history, new_status, admin_user, admin_notes=''):
    """Create notification when grade history status changes"""
    athlete = grade_history.athlete
    
    # Map status to notification type and messages
    status_mapping = {
        'approved': {
            'type': 'grade_approved',
            'title': '🎉 Grade Exam Approved!',
            'message': f'Congratulations! Your grade exam for {grade_history.grade.name} has been approved.',
        },
        'rejected': {
            'type': 'grade_rejected',
            'title': 'Grade Exam Rejected',
            'message': f'Your grade exam submission for {grade_history.grade.name} has been rejected.',
        },
        'revision_required': {
            'type': 'grade_revision_required',
            'title': 'Grade Exam Revision Required',
            'message': f'Your grade exam submission for {grade_history.grade.name} requires revision.',
        }
    }
    
    status_info = status_mapping.get(new_status)
    if not status_info:
        return
    
    # Add admin notes to message if provided
    message = status_info['message']
    if admin_notes:
        message += f'\n\nAdmin notes: {admin_notes}'
    
    # Create notification for the athlete
    create_notification(
        recipient=athlete.user,
        notification_type=status_info['type'],
        title=status_info['title'],
        message=message,
        action_data={
            'grade_name': grade_history.grade.name,
            'exam_date': grade_history.exam_date.isoformat() if grade_history.exam_date else None,
            'exam_place': grade_history.exam_place,
            'level': grade_history.level,
            'reviewed_by': admin_user.get_full_name() if admin_user else 'Admin',
            'admin_notes': admin_notes,
            'new_status': new_status
        }
    )


# Training Seminar Notification Functions
def create_seminar_submitted_notification(participation):
    """Create notification when an athlete submits seminar participation"""
    athlete = participation.athlete
    seminar = participation.seminar
    
    # Notification for the athlete (confirmation)
    create_notification(
        recipient=athlete.user,
        notification_type='seminar_submitted',
        title='Seminar Participation Submitted Successfully',
        message=f'Your participation submission for "{seminar.name}" has been submitted and is pending review.',
        action_data={
            'seminar_name': seminar.name,
            'seminar_start_date': seminar.start_date.isoformat() if seminar.start_date else None,
            'seminar_end_date': seminar.end_date.isoformat() if seminar.end_date else None,
            'seminar_place': seminar.place
        }
    )
    
    # Notification for admin users
    admin_users = User.objects.filter(role='admin')
    for admin in admin_users:
        create_notification(
            recipient=admin,
            notification_type='seminar_submitted',
            title='New Seminar Participation Submitted for Review',
            message=f'{athlete.first_name} {athlete.last_name} submitted participation for "{seminar.name}".',
            action_data={
                'athlete_name': f'{athlete.first_name} {athlete.last_name}',
                'seminar_name': seminar.name,
                'seminar_start_date': seminar.start_date.isoformat() if seminar.start_date else None,
                'seminar_end_date': seminar.end_date.isoformat() if seminar.end_date else None,
                'seminar_place': seminar.place
            }
        )


def create_seminar_status_notification(participation, new_status, admin_user, admin_notes=''):
    """Create notification when seminar participation status changes"""
    athlete = participation.athlete
    seminar = participation.seminar
    
    # Map status to notification type and messages
    status_mapping = {
        'approved': {
            'type': 'seminar_approved',
            'title': '🎉 Seminar Participation Approved!',
            'message': f'Congratulations! Your participation in "{seminar.name}" has been approved.',
        },
        'rejected': {
            'type': 'seminar_rejected',
            'title': 'Seminar Participation Rejected',
            'message': f'Your participation submission for "{seminar.name}" has been rejected.',
        },
        'revision_required': {
            'type': 'seminar_revision_required',
            'title': 'Seminar Participation Revision Required',
            'message': f'Your participation submission for "{seminar.name}" requires revision.',
        }
    }
    
    status_info = status_mapping.get(new_status)
    if not status_info:
        return
    
    # Add admin notes to message if provided
    message = status_info['message']
    if admin_notes:
        message += f'\n\nAdmin notes: {admin_notes}'
    
    # Create notification for the athlete
    create_notification(
        recipient=athlete.user,
        notification_type=status_info['type'],
        title=status_info['title'],
        message=message,
        action_data={
            'seminar_name': seminar.name,
            'seminar_start_date': seminar.start_date.isoformat() if seminar.start_date else None,
            'seminar_end_date': seminar.end_date.isoformat() if seminar.end_date else None,
            'seminar_place': seminar.place,
            'reviewed_by': admin_user.get_full_name() if admin_user else 'Admin',
            'admin_notes': admin_notes,
            'new_status': new_status
        }
    )