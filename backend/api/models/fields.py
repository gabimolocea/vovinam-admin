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
        verbose_name=_('Eveniment'),
        related_name='fields',
        help_text=_('Evenimentul de care aparține acest teren.')
    )
    
    name = models.CharField(
        _('Nume'),
        max_length=100,
        help_text=_('Numele terenului (de exemplu, „Teren 1”, „Tatami A”, „Zona B”).')
    )
    
    field_number = models.IntegerField(
        _('Număr teren'),
        help_text=_('Identificatorul numeric al terenului.')
    )
    
    is_active = models.BooleanField(
        _('Activ'),
        default=True,
        help_text=_('Indică dacă acest teren este utilizat în prezent.')
    )

    start_time = models.TimeField(
        _('Ora de început'),
        null=True,
        blank=True,
        help_text=_('Ora planificată de început pentru acest teren (de exemplu, 09:00).')
    )

    created_at = models.DateTimeField(_('Data creării'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Data actualizării'), auto_now=True)
    
    class Meta:
        unique_together = ('event', 'field_number')
        ordering = ['field_number']
        verbose_name = _('Teren competiție')
        verbose_name_plural = _('Terenuri competiție')
    
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
        verbose_name=_('Teren'),
        related_name='breaks',
        help_text=_('Terenul de care aparține această pauză.')
    )
    label = models.CharField(
        _('Denumire'),
        max_length=100,
        default='Pauză',
        help_text=_('Denumirea pauzei (de exemplu, „Pauză de masă”).')
    )
    duration = models.IntegerField(
        _('Durată'),
        default=60,
        help_text=_('Durata în minute.')
    )
    order = models.IntegerField(
        _('Ordine'),
        default=0,
        help_text=_('Poziția în programul terenului, împreună cu alocările de categorii și meciuri.')
    )
    created_at = models.DateTimeField(_('Data creării'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Data actualizării'), auto_now=True)

    class Meta:
        ordering = ['order']
        verbose_name = _('Pauză teren')
        verbose_name_plural = _('Pauze teren')

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
        verbose_name=_('Categorie'),
        related_name='field_assignment',
        help_text=_('Categoria alocată.')
    )
    
    field = models.ForeignKey(
        'CompetitionField',
        on_delete=models.CASCADE,
        verbose_name=_('Teren'),
        related_name='category_assignments',
        help_text=_('Terenul la care este alocată această categorie.')
    )
    
    STATUS_CHOICES = [
        ('not_started', 'Neîncepută'),
        ('in_progress', 'În desfășurare'),
        ('completed', 'Finalizată'),
    ]

    status = models.CharField(
        _('Stare'),
        max_length=20,
        choices=STATUS_CHOICES,
        default='not_started',
        help_text=_('Starea curentă a acestei categorii pe teren.')
    )

    scheduled_start_time = models.DateTimeField(
        _('Început programat'),
        null=True,
        blank=True,
        help_text=_('Momentul programat pentru începerea categoriei.')
    )
    
    actual_start_time = models.DateTimeField(
        _('Început efectiv'),
        null=True,
        blank=True,
        help_text=_('Momentul la care categoria a început efectiv.')
    )
    
    actual_end_time = models.DateTimeField(
        _('Sfârșit efectiv'),
        null=True,
        blank=True,
        help_text=_('Momentul la care categoria s-a încheiat efectiv.')
    )
    
    order = models.IntegerField(
        _('Ordine'),
        default=0,
        help_text=_('Ordinea în care categoriile se desfășoară pe acest teren.')
    )
    
    estimated_duration = models.IntegerField(
        _('Durată estimată'),
        default=15,
        help_text=_('Durata estimată, în minute.')
    )

    created_at = models.DateTimeField(_('Data creării'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Data actualizării'), auto_now=True)
    
    class Meta:
        ordering = ['order']
        verbose_name = _('Alocare teren categorie')
        verbose_name_plural = _('Alocări teren categorie')
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
        verbose_name=_('Meci'),
        related_name='field_assignment',
        help_text=_('Meciul alocat.')
    )

    field = models.ForeignKey(
        'CompetitionField',
        on_delete=models.SET_NULL,
        verbose_name=_('Teren'),
        null=True,
        blank=True,
        related_name='match_assignments',
        help_text=_('Terenul la care este alocat acest meci.')
    )

    STATUS_CHOICES = [
        ('not_started', 'Neînceput'),
        ('in_progress', 'În desfășurare'),
        ('completed', 'Finalizat'),
    ]

    status = models.CharField(
        _('Stare'),
        max_length=20,
        choices=STATUS_CHOICES,
        default='not_started',
        help_text=_('Starea curentă a acestui meci pe teren.')
    )

    scheduled_start_time = models.DateTimeField(
        _('Început programat'),
        null=True,
        blank=True,
        help_text=_('Momentul programat pentru începerea meciului.')
    )

    actual_start_time = models.DateTimeField(
        _('Început efectiv'),
        null=True,
        blank=True,
        help_text=_('Momentul la care meciul a început efectiv.')
    )

    actual_end_time = models.DateTimeField(
        _('Sfârșit efectiv'),
        null=True,
        blank=True,
        help_text=_('Momentul la care meciul s-a încheiat efectiv.')
    )

    order = models.IntegerField(
        _('Ordine'),
        default=0,
        help_text=_('Ordinea în care meciurile se desfășoară pe acest teren.')
    )

    estimated_duration = models.IntegerField(
        _('Durată estimată'),
        default=10,
        help_text=_('Durata estimată, în minute.')
    )

    created_at = models.DateTimeField(_('Data creării'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Data actualizării'), auto_now=True)

    class Meta:
        ordering = ['order']
        verbose_name = _('Alocare teren meci')
        verbose_name_plural = _('Alocări teren meci')
        indexes = [
            models.Index(fields=['field', 'status'], name='api_match_field_status_idx'),
        ]

    def __str__(self):
        return f"{self.match.name or self.match.pk} → {self.field.name if self.field else 'Nealocat'}"

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
        verbose_name=_('Teren'),
        related_name='monitor_session',
        help_text=_('Terenul deservit de acest monitor.')
    )
    
    current_category = models.ForeignKey(
        'Category',
        on_delete=models.SET_NULL,
        verbose_name=_('Categoria curentă'),
        null=True,
        blank=True,
        related_name='monitor_sessions_category',
        help_text=_('Categoria afișată în prezent.')
    )
    
    current_match = models.ForeignKey(
        'Match',
        on_delete=models.SET_NULL,
        verbose_name=_('Meciul curent'),
        null=True,
        blank=True,
        related_name='monitor_sessions_match',
        help_text=_('Meciul afișat în prezent (pentru categoriile de luptă).')
    )
    
    current_athlete = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        verbose_name=_('Sportivul curent'),
        null=True,
        blank=True,
        related_name='monitor_sessions',
        help_text=_('Sportivul afișat în prezent (pentru solo sau echipe).')
    )
    
    STATUS_CHOICES = [
        ('idle', 'În așteptare'),
        ('displaying', 'Se afișează'),
        ('scores_revealed', 'Scoruri afișate'),
        ('decisions_revealed', 'Decizii afișate'),
        ('winner_revealed', 'Câștigător afișat'),
    ]
    
    status = models.CharField(
        _('Stare'),
        max_length=20,
        choices=STATUS_CHOICES,
        default='idle',
        help_text=_('Starea curentă a afișajului.')
    )

    # Break timer sync fields (admin ↔ public display)
    break_end_time = models.DateTimeField(
        _('Sfârșit pauză'),
        null=True, blank=True,
        help_text=_('Momentul UTC absolut la care pauza ar trebui să se încheie.')
    )
    break_paused = models.BooleanField(
        _('Pauză suspendată'),
        default=False,
        help_text=_('Indică dacă temporizatorul pauzei este suspendat în prezent.')
    )
    break_paused_remaining = models.IntegerField(
        _('Secunde rămase la suspendare'),
        default=0,
        help_text=_('Numărul de secunde rămase când pauza a fost suspendată.')
    )

    created_at = models.DateTimeField(_('Data creării'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Data actualizării'), auto_now=True)
    
    class Meta:
        verbose_name = _('Sesiune monitor afișaj')
        verbose_name_plural = _('Sesiuni monitor afișaj')
    
    def __str__(self):
        if self.current_category:
            return f"Monitor {self.field.field_number}: {self.current_category.name}"
        return f"Monitor {self.field.field_number}: În așteptare"


class QRCodeAssignment(models.Model):
    """
    Generates unique QR codes for quick referee access to their assigned categories/matches.
    When a referee scans the QR, they're automatically logged in to that specific category/match.
    """
    referee = models.ForeignKey(
        'Athlete',
        on_delete=models.CASCADE,
        verbose_name=_('Arbitru'),
        limit_choices_to={'is_referee': True},
        related_name='qr_assignments',
        help_text=_('Arbitrul pentru care este emis acest cod QR.')
    )
    
    category = models.ForeignKey(
        'Category',
        on_delete=models.CASCADE,
        verbose_name=_('Categorie'),
        null=True,
        blank=True,
        related_name='qr_assignments',
        help_text=_('Categoria la care acest cod QR oferă acces (doar solo sau echipe).')
    )
    
    match = models.ForeignKey(
        'Match',
        on_delete=models.CASCADE,
        verbose_name=_('Meci'),
        null=True,
        blank=True,
        related_name='qr_assignments',
        help_text=_('Meciul la care acest cod QR oferă acces (doar luptă).')
    )
    
    code = models.CharField(
        _('Cod'),
        max_length=255,
        unique=True,
        db_index=True,
        help_text=_('Valoarea unică a codului QR.')
    )
    
    is_active = models.BooleanField(
        _('Activ'),
        default=True,
        help_text=_('Indică dacă acest cod QR poate fi utilizat.')
    )

    created_at = models.DateTimeField(_('Data creării'), auto_now_add=True)
    expires_at = models.DateTimeField(
        _('Expiră la'),
        null=True,
        blank=True,
        help_text=_('Data opțională de expirare pentru acest cod QR.')
    )
    
    class Meta:
        unique_together = ('referee', 'category', 'match')
        verbose_name = _('Alocare cod QR')
        verbose_name_plural = _('Alocări coduri QR')
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
