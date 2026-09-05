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

class MatchVideoRecording(models.Model):
    """
    Video recording for individual Fight category matches.
    Each match can have its own video recording.
    All fields optional to allow gradual video addition.
    """
    match = models.ForeignKey(
        'Match',
        on_delete=models.CASCADE,
        related_name='video_recordings',
        help_text='The match this video records'
    )
    
    # Video storage - either file upload OR external URL
    video_file = models.FileField(
        upload_to='match_videos/%Y/%m/%d/',
        blank=True,
        null=True,
        help_text='Uploaded video file (MP4, WebM, etc.)'
    )
    
    video_url = models.URLField(
        blank=True,
        null=True,
        max_length=500,
        help_text='External video URL (YouTube, Vimeo, streaming service)'
    )
    
    # Video metadata
    duration_seconds = models.IntegerField(
        blank=True,
        null=True,
        help_text='Total video duration in seconds'
    )
    
    recorded_at = models.DateTimeField(
        blank=True,
        null=True,
        help_text='When the video was recorded'
    )
    
    uploaded_at = models.DateTimeField(
        auto_now_add=True,
        help_text='When video was uploaded to system'
    )
    
    # Access control
    is_public = models.BooleanField(
        default=False,
        help_text='Whether video is publicly accessible'
    )
    
    class Meta:
        verbose_name = 'Match Video Recording'
        verbose_name_plural = 'Match Video Recordings'
        ordering = ['-recorded_at', '-uploaded_at']
    
    def __str__(self):
        date = self.recorded_at.strftime('%Y-%m-%d') if self.recorded_at else 'No date'
        return f"{self.match.name} ({date})"
    
    def clean(self):
        """Validate that at least one video source is provided"""
        if not self.video_file and not self.video_url:
            raise ValidationError("Either video file or video URL must be provided")


class AthletePerformanceVideo(models.Model):
    """
    Video recording of an individual athlete's performance in a Solo category.
    Links to CategoryAthleteScore for individual athlete results.
    """
    athlete_score = models.OneToOneField(
        'CategoryAthleteScore',
        on_delete=models.CASCADE,
        related_name='performance_video',
        verbose_name='Solo category',
        help_text='The athlete score entry this video documents'
    )
    
    # Video storage - either file upload OR external URL
    video_file = models.FileField(
        upload_to='athlete_videos/%Y/%m/%d/',
        blank=True,
        null=True,
        help_text='Uploaded video file (MP4, WebM, etc.)'
    )
    
    video_url = models.URLField(
        blank=True,
        null=True,
        max_length=500,
        help_text='External video URL (YouTube, Vimeo, streaming service)'
    )
    
    duration_seconds = models.IntegerField(
        blank=True,
        null=True,
        help_text='Total video duration in seconds'
    )
    
    recorded_at = models.DateTimeField(
        blank=True,
        null=True,
        help_text='When the video was recorded'
    )
    
    uploaded_at = models.DateTimeField(
        auto_now_add=True,
        help_text='When video was uploaded to system'
    )
    
    # Access control
    is_public = models.BooleanField(
        default=False,
        help_text='Whether video is publicly accessible'
    )
    
    class Meta:
        verbose_name = 'Solo Performance Video'
        verbose_name_plural = 'Solo Performance Videos'
        ordering = ['-recorded_at', '-uploaded_at']
    
    def __str__(self):
        athlete = self.athlete_score.athlete
        category = self.athlete_score.category
        group = category.group
        event = category.event
        date = self.recorded_at.strftime('%Y-%m-%d') if self.recorded_at else 'No date'
        group_name = group.name if group else 'No Group'
        event_title = event.title if event else 'No Competition'
        return (
            f"{athlete.first_name} {athlete.last_name} - "
            f"{category.name} / {group_name} / {event_title} ({date})"
        )
    
    def clean(self):
        """Validate that at least one video source is provided"""
        if not self.video_file and not self.video_url:
            raise ValidationError("Either video file or video URL must be provided")


class TeamPerformanceVideo(models.Model):
    """
    Video recording of a team's performance in a Team category.
    Links to CategoryTeam for team results.
    """
    category_team = models.OneToOneField(
        'CategoryTeam',
        on_delete=models.CASCADE,
        related_name='performance_video',
        help_text='The team enrollment this video documents'
    )
    
    # Video storage - either file upload OR external URL
    video_file = models.FileField(
        upload_to='team_videos/%Y/%m/%d/',
        blank=True,
        null=True,
        help_text='Uploaded video file (MP4, WebM, etc.)'
    )
    
    video_url = models.URLField(
        blank=True,
        null=True,
        max_length=500,
        help_text='External video URL (YouTube, Vimeo, streaming service)'
    )
    
    duration_seconds = models.IntegerField(
        blank=True,
        null=True,
        help_text='Total video duration in seconds'
    )
    
    recorded_at = models.DateTimeField(
        blank=True,
        null=True,
        help_text='When the video was recorded'
    )
    
    uploaded_at = models.DateTimeField(
        auto_now_add=True,
        help_text='When video was uploaded to system'
    )
    
    # Access control
    is_public = models.BooleanField(
        default=False,
        help_text='Whether video is publicly accessible'
    )
    
    class Meta:
        verbose_name = 'Team Performance Video'
        verbose_name_plural = 'Team Performance Videos'
        ordering = ['-recorded_at', '-uploaded_at']
    
    def __str__(self):
        team = self.category_team.team
        date = self.recorded_at.strftime('%Y-%m-%d') if self.recorded_at else 'No date'
        return f"{team.name} ({date})"
    
    def clean(self):
        """Validate that at least one video source is provided"""
        if not self.video_file and not self.video_url:
            raise ValidationError("Either video file or video URL must be provided")


# ============================================================================
# PWA COMPETITION MANAGEMENT MODELS
# ============================================================================
