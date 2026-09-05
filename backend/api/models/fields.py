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

class CompetitionField(models.Model):
    """
    Represents a scoring field/tatami at a competition.
    Multiple fields can run simultaneously during an event.
    Each field displays scores on a dedicated monitor.
    """
    event = models.ForeignKey(
        'landing.Event',
        on_delete=models.CASCADE,
        related_name='fields',
        help_text='The event this field belongs to'
    )
    
    name = models.CharField(
        max_length=100,
        help_text='Field name (e.g., "Field 1", "Tatami A", "Area B")'
    )
    
    field_number = models.IntegerField(
        help_text='Numeric identifier for the field'
    )
    
    is_active = models.BooleanField(
        default=True,
        help_text='Whether this field is currently being used'
    )

    start_time = models.TimeField(
        null=True,
        blank=True,
        help_text='Planned start time for this field (e.g., 09:00)'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ('event', 'field_number')
        ordering = ['field_number']
        verbose_name = 'Competition Field'
        verbose_name_plural = 'Competition Fields'
    
    def __str__(self):
        return f"{self.name} (Event: {self.event.title})"


class FieldBreak(models.Model):
    """
    A break/pause in a competition field schedule (e.g., lunch break).
    Appears in the schedule timeline between categories/matches.
    """
    field = models.ForeignKey(
        'CompetitionField',
        on_delete=models.CASCADE,
        related_name='breaks',
        help_text='The field this break belongs to'
    )
    label = models.CharField(
        max_length=100,
        default='Pauză',
        help_text='Label for the break (e.g., "Pauză de masă")'
    )
    duration = models.IntegerField(
        default=60,
        help_text='Duration in minutes'
    )
    order = models.IntegerField(
        default=0,
        help_text='Order position in the field schedule (mixed with category/match assignments)'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order']
        verbose_name = 'Field Break'
        verbose_name_plural = 'Field Breaks'

    def __str__(self):
        return f"{self.label} ({self.duration}min) - {self.field.name}"


class CategoryFieldAssignment(models.Model):
    """
    Assigns a category to a specific field for competition day.
    Allows admin to track which categories are being held on which fields.
    """
    category = models.OneToOneField(
        'Category',
        on_delete=models.CASCADE,
        related_name='field_assignment',
        help_text='The category being assigned'
    )
    
    field = models.ForeignKey(
        'CompetitionField',
        on_delete=models.CASCADE,
        related_name='category_assignments',
        help_text='The field this category is assigned to'
    )
    
    STATUS_CHOICES = [
        ('not_started', 'Not Started'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
    ]

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='not_started',
        help_text='Current status of this category on this field'
    )

    scheduled_start_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the category is scheduled to start'
    )
    
    actual_start_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the category actually started'
    )
    
    actual_end_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the category actually ended'
    )
    
    order = models.IntegerField(
        default=0,
        help_text='Order in which categories are run on this field'
    )
    
    estimated_duration = models.IntegerField(
        default=15,
        help_text='Estimated duration in minutes'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['order']
        verbose_name = 'Category Field Assignment'
        verbose_name_plural = 'Category Field Assignments'
        indexes = [
            models.Index(fields=['field', 'status']),
        ]
    
    def __str__(self):
        return f"{self.category.name} → {self.field.name}"


class MatchFieldAssignment(models.Model):
    """
    Assigns a match to a specific field with status and scheduling info.
    """
    match = models.OneToOneField(
        'Match',
        on_delete=models.CASCADE,
        related_name='field_assignment',
        help_text='The match being assigned'
    )

    field = models.ForeignKey(
        'CompetitionField',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='match_assignments',
        help_text='The field this match is assigned to'
    )

    STATUS_CHOICES = [
        ('not_started', 'Not Started'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
    ]

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='not_started',
        help_text='Current status of this match on this field'
    )

    scheduled_start_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the match is scheduled to start'
    )

    actual_start_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the match actually started'
    )

    actual_end_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the match actually ended'
    )

    order = models.IntegerField(
        default=0,
        help_text='Order in which matches are run on this field'
    )

    estimated_duration = models.IntegerField(
        default=10,
        help_text='Estimated duration in minutes'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order']
        verbose_name = 'Match Field Assignment'
        verbose_name_plural = 'Match Field Assignments'
        indexes = [
            models.Index(fields=['field', 'status'], name='api_match_field_status_idx'),
        ]

    def __str__(self):
        return f"{self.match.name or self.match.pk} → {self.field.name if self.field else 'Unassigned'}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        try:
            if self.match_id and self.field_id and self.match.field_id != self.field_id:
                self.match.field_id = self.field_id
                self.match.save(update_fields=['field'])
        except Exception:
            pass


class DisplayMonitorSession(models.Model):
    """
    Tracks what is currently being displayed on each field's monitor.
    Admin can switch which category/match is shown on each monitor in real-time.
    """
    field = models.OneToOneField(
        'CompetitionField',
        on_delete=models.CASCADE,
        related_name='monitor_session',
        help_text='Which field this monitor serves'
    )
    
    current_category = models.ForeignKey(
        'Category',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='monitor_sessions_category',
        help_text='The category currently displayed'
    )
    
    current_match = models.ForeignKey(
        'Match',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='monitor_sessions_match',
        help_text='The match currently displayed (for fighting categories)'
    )
    
    current_athlete = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='monitor_sessions',
        help_text='The current athlete being displayed (for solo/teams)'
    )
    
    STATUS_CHOICES = [
        ('idle', 'Idle'),
        ('displaying', 'Displaying'),
        ('scores_revealed', 'Scores Revealed'),
        ('decisions_revealed', 'Decisions Revealed'),
        ('winner_revealed', 'Winner Revealed'),
    ]
    
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='idle',
        help_text='Current display status'
    )

    # Break timer sync fields (admin ↔ public display)
    break_end_time = models.DateTimeField(
        null=True, blank=True,
        help_text='Absolute UTC time when break should end'
    )
    break_paused = models.BooleanField(
        default=False,
        help_text='Whether the break timer is currently paused'
    )
    break_paused_remaining = models.IntegerField(
        default=0,
        help_text='Seconds remaining when break was paused'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Display Monitor Session'
        verbose_name_plural = 'Display Monitor Sessions'
    
    def __str__(self):
        if self.current_category:
            return f"Monitor {self.field.field_number}: {self.current_category.name}"
        return f"Monitor {self.field.field_number}: Idle"


class QRCodeAssignment(models.Model):
    """
    Generates unique QR codes for quick referee access to their assigned categories/matches.
    When a referee scans the QR, they're automatically logged in to that specific category/match.
    """
    referee = models.ForeignKey(
        'Athlete',
        on_delete=models.CASCADE,
        limit_choices_to={'is_referee': True},
        related_name='qr_assignments',
        help_text='The referee this QR code is for'
    )
    
    category = models.ForeignKey(
        'Category',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='qr_assignments',
        help_text='The category this QR code grants access to (solo/teams only)'
    )
    
    match = models.ForeignKey(
        'Match',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='qr_assignments',
        help_text='The match this QR code grants access to (fighting only)'
    )
    
    code = models.CharField(
        max_length=255,
        unique=True,
        db_index=True,
        help_text='Unique QR code value'
    )
    
    is_active = models.BooleanField(
        default=True,
        help_text='Whether this QR code can be used'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='Optional expiration date for this QR code'
    )
    
    class Meta:
        unique_together = ('referee', 'category', 'match')
        verbose_name = 'QR Code Assignment'
        verbose_name_plural = 'QR Code Assignments'
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['referee', 'category']),
            models.Index(fields=['referee', 'match']),
        ]
    
    def __str__(self):
        target = self.category.name if self.category else self.match.match_number
        return f"QR for {self.referee.first_name} → {target}"
    
    def clean(self):
        """Validate that either category or match is specified, but not both"""
        if not self.category and not self.match:
            raise ValidationError("QR code must be assigned to either a category or a match")
        if self.category and self.match:
            raise ValidationError("QR code cannot be assigned to both a category and a match")

    def save(self, *args, **kwargs):
        # Auto-expire the code shortly after the competition ends, so a
        # referee's access QR doesn't stay valid indefinitely if no explicit
        # expires_at was provided.
        if self.expires_at is None:
            event = None
            if self.category_id:
                event = getattr(self.category, 'event', None)
            elif self.match_id:
                event = getattr(getattr(self.match, 'category', None), 'event', None)
            end_date = getattr(event, 'end_date', None)
            if end_date:
                self.expires_at = end_date + timedelta(days=1)
        super().save(*args, **kwargs)

