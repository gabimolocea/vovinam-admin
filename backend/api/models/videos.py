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
        verbose_name=_('Meci'),
        related_name='video_recordings',
        help_text=_('Meciul înregistrat de acest video.')
    )
    
    # Video storage - either file upload OR external URL
    video_file = models.FileField(
        _('Fișier video'),
        upload_to='match_videos/%Y/%m/%d/',
        blank=True,
        null=True,
        help_text=_('Fișierul video încărcat (MP4, WebM etc.).')
    )
    
    video_url = models.URLField(
        _('URL video'),
        blank=True,
        null=True,
        max_length=500,
        help_text=_('URL video extern (YouTube, Vimeo, serviciu de streaming).')
    )
    
    # Video metadata
    duration_seconds = models.IntegerField(
        _('Durată (secunde)'),
        blank=True,
        null=True,
        help_text=_('Durata totală a videoclipului în secunde.')
    )
    
    recorded_at = models.DateTimeField(
        _('Înregistrat la'),
        blank=True,
        null=True,
        help_text=_('Momentul înregistrării videoclipului.')
    )
    
    uploaded_at = models.DateTimeField(
        _('Încărcat la'),
        auto_now_add=True,
        help_text=_('Momentul încărcării videoclipului în sistem.')
    )
    
    # Access control
    is_public = models.BooleanField(
        _('Public'),
        default=False,
        help_text=_('Indică dacă videoclipul este accesibil public.')
    )
    
    class Meta:
        verbose_name = _('Înregistrare video a meciului')
        verbose_name_plural = _('Înregistrări video ale meciurilor')
        ordering = ['-recorded_at', '-uploaded_at']
    
    def __str__(self):
        date = self.recorded_at.strftime('%Y-%m-%d') if self.recorded_at else 'Fără dată'
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
        verbose_name=_('Rezultat individual'),
        help_text=_('Înregistrarea rezultatului sportivului documentată de acest video.')
    )
    
    # Video storage - either file upload OR external URL
    video_file = models.FileField(
        _('Fișier video'),
        upload_to='athlete_videos/%Y/%m/%d/',
        blank=True,
        null=True,
        help_text=_('Fișierul video încărcat (MP4, WebM etc.).')
    )
    
    video_url = models.URLField(
        _('URL video'),
        blank=True,
        null=True,
        max_length=500,
        help_text=_('URL video extern (YouTube, Vimeo, serviciu de streaming).')
    )
    
    duration_seconds = models.IntegerField(
        _('Durată (secunde)'),
        blank=True,
        null=True,
        help_text=_('Durata totală a videoclipului în secunde.')
    )
    
    recorded_at = models.DateTimeField(
        _('Înregistrat la'),
        blank=True,
        null=True,
        help_text=_('Momentul înregistrării videoclipului.')
    )
    
    uploaded_at = models.DateTimeField(
        _('Încărcat la'),
        auto_now_add=True,
        help_text=_('Momentul încărcării videoclipului în sistem.')
    )
    
    # Access control
    is_public = models.BooleanField(
        _('Public'),
        default=False,
        help_text=_('Indică dacă videoclipul este accesibil public.')
    )
    
    class Meta:
        verbose_name = _('Înregistrare video a probei individuale')
        verbose_name_plural = _('Înregistrări video ale probelor individuale')
        ordering = ['-recorded_at', '-uploaded_at']
    
    def __str__(self):
        athlete = self.athlete_score.athlete
        category = self.athlete_score.category
        group = category.group
        event = category.event
        date = self.recorded_at.strftime('%Y-%m-%d') if self.recorded_at else 'Fără dată'
        group_name = group.name if group else 'Fără grupă'
        event_title = event.title if event else 'Fără competiție'
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
        verbose_name=_('Rezultat echipă în categorie'),
        related_name='performance_video',
        help_text=_('Înscrierea echipei în categorie documentată de acest video.')
    )
    
    # Video storage - either file upload OR external URL
    video_file = models.FileField(
        _('Fișier video'),
        upload_to='team_videos/%Y/%m/%d/',
        blank=True,
        null=True,
        help_text=_('Fișierul video încărcat (MP4, WebM etc.).')
    )
    
    video_url = models.URLField(
        _('URL video'),
        blank=True,
        null=True,
        max_length=500,
        help_text=_('URL video extern (YouTube, Vimeo, serviciu de streaming).')
    )
    
    duration_seconds = models.IntegerField(
        _('Durată (secunde)'),
        blank=True,
        null=True,
        help_text=_('Durata totală a videoclipului în secunde.')
    )
    
    recorded_at = models.DateTimeField(
        _('Înregistrat la'),
        blank=True,
        null=True,
        help_text=_('Momentul înregistrării videoclipului.')
    )
    
    uploaded_at = models.DateTimeField(
        _('Încărcat la'),
        auto_now_add=True,
        help_text=_('Momentul încărcării videoclipului în sistem.')
    )
    
    # Access control
    is_public = models.BooleanField(
        _('Public'),
        default=False,
        help_text=_('Indică dacă videoclipul este accesibil public.')
    )
    
    class Meta:
        verbose_name = _('Înregistrare video a probei pe echipe')
        verbose_name_plural = _('Înregistrări video ale probelor pe echipe')
        ordering = ['-recorded_at', '-uploaded_at']
    
    def __str__(self):
        team = self.category_team.team
        date = self.recorded_at.strftime('%Y-%m-%d') if self.recorded_at else 'Fără dată'
        return f"{team.name} ({date})"
    
    def clean(self):
        """Validate that at least one video source is provided"""
        if not self.video_file and not self.video_url:
            raise ValidationError("Either video file or video URL must be provided")


# ============================================================================
# PWA COMPETITION MANAGEMENT MODELS
# ============================================================================
