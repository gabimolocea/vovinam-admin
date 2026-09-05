from django.db import models, transaction
from django.db.models import F
from django.core.exceptions import ValidationError
from django.contrib import admin
from django.conf import settings
from django.contrib.auth.models import AbstractUser
from datetime import date, timedelta
import hashlib
import secrets
from urllib.parse import urlparse
from django.db.models.signals import m2m_changed, post_save
from django.dispatch import receiver
from django.core.exceptions import ValidationError
from django.db.models.signals import post_delete
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from django.utils.text import slugify
from ..mixins import TimestampMixin, SyncMixin, SoftDeleteMixin, AuditMixin
from ..managers import AthleteManager

# Create your models here.

from ._common import User
class Notification(models.Model):
    """Model for storing notifications to users"""
    NOTIFICATION_TYPES = [
        ('result_submitted', 'Result Submitted'),
        ('result_approved', 'Result Approved'),
        ('result_rejected', 'Result Rejected'),
        ('result_revision_required', 'Result Revision Required'),
        ('grade_submitted', 'Grade Exam Submitted'),
        ('grade_approved', 'Grade Exam Approved'),
        ('grade_rejected', 'Grade Exam Rejected'),
        ('grade_revision_required', 'Grade Exam Revision Required'),
        ('seminar_submitted', 'Seminar Participation Submitted'),
        ('seminar_approved', 'Seminar Participation Approved'),
        ('seminar_rejected', 'Seminar Participation Rejected'),
        ('seminar_revision_required', 'Seminar Participation Revision Required'),
        ('competition_created', 'Competition Created'),
        ('competition_updated', 'Competition Updated'),
        ('system_announcement', 'System Announcement'),
        ('supporter_request', 'Supporter Relation Request'),
        ('supporter_approved', 'Supporter Relation Approved'),
        ('supporter_rejected', 'Supporter Relation Rejected'),
    ]
    
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    notification_type = models.CharField(max_length=30, choices=NOTIFICATION_TYPES)
    title = models.CharField(max_length=200)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)
    
    # Optional link to related objects
    related_result = models.ForeignKey('CategoryAthleteScore', on_delete=models.CASCADE, null=True, blank=True)
    related_competition = models.ForeignKey(
        'landing.Event', on_delete=models.CASCADE, null=True, blank=True,
        related_name='notifications',
        help_text="Optional link to the competition/event this notification is about",
    )
    
    # Optional action data (JSON field for flexible data storage)
    action_data = models.JSONField(null=True, blank=True, help_text="Additional data for notification actions")
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['recipient', '-created_at']),
            models.Index(fields=['recipient', 'is_read']),
        ]
    
    def __str__(self):
        return f"{self.title} - {self.recipient.get_full_name()}"
    
    def mark_as_read(self):
        """Mark notification as read"""
        from django.utils import timezone
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save()


class NotificationSettings(models.Model):
    """Model for user notification preferences"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='notification_settings')
    
    # Email notification preferences
    email_on_result_status_change = models.BooleanField(default=True)
    email_on_competition_updates = models.BooleanField(default=True)
    email_on_system_announcements = models.BooleanField(default=True)
    
    # In-app notification preferences
    notify_result_submitted = models.BooleanField(default=True)
    notify_result_approved = models.BooleanField(default=True)
    notify_result_rejected = models.BooleanField(default=True)
    notify_result_revision_required = models.BooleanField(default=True)
    notify_grade_submitted = models.BooleanField(default=True)
    notify_grade_approved = models.BooleanField(default=True)
    notify_grade_rejected = models.BooleanField(default=True)
    notify_grade_revision_required = models.BooleanField(default=True)
    notify_seminar_submitted = models.BooleanField(default=True)
    notify_seminar_approved = models.BooleanField(default=True)
    notify_seminar_rejected = models.BooleanField(default=True)
    notify_seminar_revision_required = models.BooleanField(default=True)
    notify_competition_created = models.BooleanField(default=True)
    notify_competition_updated = models.BooleanField(default=False)
    notify_system_announcements = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"Notification Settings - {self.user.get_full_name()}"


# Signal to create notification settings for new users
@receiver(post_save, sender=User)
def create_notification_settings(sender, instance, created, **kwargs):
    """Create notification settings when a new user is created"""
    if created:
        NotificationSettings.objects.create(user=instance)

