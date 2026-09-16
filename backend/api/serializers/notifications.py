from rest_framework import serializers
from django.db.models import Q
from ..models import *
from landing.models import Event


class NotificationSerializer(serializers.ModelSerializer):
    """Serializer for user notifications"""
    recipient_name = serializers.CharField(source='recipient.__str__', read_only=True)
    time_since_created = serializers.SerializerMethodField()
    resolved_status = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            'id', 'recipient', 'recipient_name', 'notification_type', 'title', 'message',
            'is_read', 'created_at', 'read_at', 'time_since_created', 'related_result',
            'related_competition', 'action_data', 'resolved_status'
        ]
        read_only_fields = ['recipient', 'created_at', 'read_at', 'time_since_created', 'resolved_status']

    def get_resolved_status(self, obj):
        """'approved'/'rejected'/'revision_required' if this submitted-request
        notification's underlying item has already been reviewed, else None -
        set in bulk by NotificationViewSet.list() via the serializer context
        (empty outside that action, e.g. on create/update responses)."""
        return self.context.get('resolved_status_map', {}).get(obj.id)

    def get_time_since_created(self, obj):
        """Get human-readable time since notification was created"""
        from django.utils import timezone
        from datetime import timedelta
        
        now = timezone.now()
        diff = now - obj.created_at
        
        if diff < timedelta(minutes=1):
            return "Acum"
        elif diff < timedelta(hours=1):
            minutes = int(diff.total_seconds() / 60)
            return f"acum {minutes} minut{'e' if minutes != 1 else ''}"
        elif diff < timedelta(days=1):
            hours = int(diff.total_seconds() / 3600)
            return f"acum {hours} {'oră' if hours == 1 else 'ore'}"
        elif diff < timedelta(days=7):
            days = diff.days
            return f"acum {days} {'zi' if days == 1 else 'zile'}"
        else:
            return obj.created_at.strftime('%d.%m.%Y')


class NotificationSettingsSerializer(serializers.ModelSerializer):
    """Serializer for user notification settings"""
    
    class Meta:
        model = NotificationSettings
        fields = [
            'id', 'user', 'email_on_result_status_change', 'email_on_grade_status_change',
            'email_on_seminar_status_change', 'email_on_visa_status_change', 'email_on_competition_updates',
            'email_on_system_announcements', 'notify_via_whatsapp', 'notify_result_submitted',
            'notify_result_approved', 'notify_result_rejected', 'notify_result_revision_required',
            'notify_grade_submitted', 'notify_grade_approved', 'notify_grade_rejected',
            'notify_grade_revision_required', 'notify_seminar_submitted', 'notify_seminar_approved',
            'notify_seminar_rejected', 'notify_seminar_revision_required', 'notify_competition_created',
            'notify_competition_updated', 'notify_system_announcements', 'created_at', 'updated_at'
        ]
        read_only_fields = ['user', 'created_at', 'updated_at']


class NotificationActionSerializer(serializers.Serializer):
    """Serializer for notification actions (mark as read, etc.)"""
    action = serializers.ChoiceField(choices=['mark_read', 'mark_unread', 'mark_all_read'])
    notification_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        help_text="List of notification IDs for batch operations"
    )


# ============================================================================
# PWA COMPETITION MANAGEMENT SERIALIZERS
# ============================================================================
