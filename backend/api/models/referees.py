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

class CategoryRefereeAssignment(models.Model):
    """
    Assigns 5 referees to a category for scoring solo/team performances.
    All athletes/teams in the category are scored by the same 5 referees.
    """
    category = models.OneToOneField(
        'Category',
        on_delete=models.CASCADE,
        verbose_name=_('Categorie'),
        related_name='referee_assignment',
        help_text=_('Categoria la care sunt alocați acești arbitri.')
    )
    
    referee_1 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={'is_referee': True},
        related_name='referee_1_categories',
        verbose_name=_('Arbitru 1'),
        help_text=_('Arbitrul de pe poziția 1 (R1).')
    )
    
    referee_2 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={'is_referee': True},
        related_name='referee_2_categories',
        verbose_name=_('Arbitru 2'),
        help_text=_('Arbitrul de pe poziția 2 (R2).')
    )
    
    referee_3 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={'is_referee': True},
        related_name='referee_3_categories',
        verbose_name=_('Arbitru 3'),
        help_text=_('Arbitrul de pe poziția 3 (R3).')
    )
    
    referee_4 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={'is_referee': True},
        related_name='referee_4_categories',
        verbose_name=_('Arbitru 4'),
        help_text=_('Arbitrul de pe poziția 4 (R4).')
    )
    
    referee_5 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={'is_referee': True},
        related_name='referee_5_categories',
        verbose_name=_('Arbitru 5'),
        help_text=_('Arbitrul de pe poziția 5 (R5).')
    )

    class Meta:
        verbose_name = _('Alocare arbitri categorie')
        verbose_name_plural = _('Alocări arbitri categorie')
    
    def __str__(self):
        return f"Referees for {self.category.name}"
    
    def get_referees_list(self):
        """Return list of (position, referee) tuples"""
        return [
            (1, self.referee_1),
            (2, self.referee_2),
            (3, self.referee_3),
            (4, self.referee_4),
            (5, self.referee_5),
        ]
    
    def clean(self):
        """Validate referee assignments"""
        super().clean()
        # Check if category is a solo or team category (not Fight)
        from django.contrib.contenttypes.models import ContentType
        if self.category:
            category_type = ContentType.objects.get_for_model(self.category).model
            if category_type not in ['solocategory', 'teamcategory']:
                raise ValidationError(
                    f"Referee assignments are only for solo and team categories, not {category_type}"
                )
        
        # Note: duplicate referees are allowed (same referee can be assigned to multiple positions)


class CompetitionReferee(models.Model):
    """
    Tracks which referees are participating in a competition.
    Acts as the roster from which referees can be assigned to categories/matches.
    """
    event = models.ForeignKey(
        'landing.Event',
        on_delete=models.CASCADE,
        verbose_name=_('Eveniment'),
        related_name='competition_referees',
        help_text=_('Evenimentul la care participă acest arbitru.')
    )
    athlete = models.ForeignKey(
        'Athlete',
        on_delete=models.CASCADE,
        verbose_name=_('Arbitru'),
        related_name='competition_referee_entries',
        limit_choices_to={'is_referee': True},
        help_text=_('Sportivul care arbitrează.')
    )
    notes = models.TextField(
        _('Note'),
        blank=True,
        default='',
        help_text=_('Note suplimentare.')
    )
    created_at = models.DateTimeField(_('Data creării'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Data actualizării'), auto_now=True)

    class Meta:
        unique_together = ('event', 'athlete')
        ordering = ['athlete__last_name']
        verbose_name = _('Arbitru competiție')
        verbose_name_plural = _('Arbitri competiție')

    def __str__(self):
        return f"{self.athlete.last_name} {self.athlete.first_name} - {self.event.title}"


class RefereePresence(models.Model):
    """Tracks which referees are actively connected to a category scoring page.
    The referee scoring panel pings this endpoint every poll cycle to indicate presence.
    """
    category = models.ForeignKey(
        'Category',
        on_delete=models.CASCADE,
        verbose_name=_('Categorie'),
        related_name='referee_presences',
        help_text=_('Categoria pe care o arbitrează acest arbitru.')
    )
    referee = models.ForeignKey(
        'Athlete',
        on_delete=models.CASCADE,
        verbose_name=_('Arbitru'),
        related_name='presence_records',
        help_text=_('Sportivul arbitru.')
    )
    last_ping = models.DateTimeField(
        _('Ultimul ping'),
        help_text=_('Ultima dată când arbitrul a trimis un ping din pagina de arbitraj.')
    )

    class Meta:
        unique_together = ('category', 'referee')
        verbose_name = _('Prezență arbitru')
        verbose_name_plural = _('Prezențe arbitri')

    def __str__(self):
        return f"Referee {self.referee_id} on category {self.category_id}"


# DISABLED FEATURES (for future use):
# MatchVideoSegment - Timestamp segments within a match video for specific rounds/periods
# RefereePointEventTimestamp - Links a specific referee point event to a video timestamp
# These models are commented out because they are not needed yet.
# To re-enable: uncomment and create a migration.
#
# class MatchVideoSegment(models.Model):
#     """Timestamp segments within a match video for specific rounds/periods."""
#     video_recording = models.ForeignKey('MatchVideoRecording', on_delete=models.CASCADE, related_name='segments')
#     round_number = models.IntegerField(help_text='Round number (1, 2, 3, etc.)')
