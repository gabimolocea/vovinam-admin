from django.db import models, transaction
from django.db.models import F, Q
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
        verbose_name = _('Alocare arbitri pentru categorie')
        verbose_name_plural = _('Alocări de arbitri pentru categorii')
    
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
    ROLE_CHOICES = [
        ('central', 'Arbitru central'),
        ('corner', 'Arbitru de colț'),
        ('table', 'Arbitru masă centrală'),
        ('secretariat', 'Secretariat'),
    ]
    role = models.CharField(
        _('Rol delegat'), max_length=20, choices=ROLE_CHOICES, blank=True, default='',
        help_text=_('Rolul cu care este delegat arbitrul la această competiție (folosit pe delegarea oficială).')
    )
    license_number = models.CharField(
        _('Licență'), max_length=50, blank=True, default='',
        help_text=_('Numărul licenței de arbitru, afișat pe delegarea oficială.')
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
        verbose_name = _('Arbitru de competiție')
        verbose_name_plural = _('Arbitri de competiție')

    def __str__(self):
        return f"{self.athlete.last_name} {self.athlete.first_name} - {self.event.title}"


class RefereePresence(models.Model):
    """Tracks which referees are actively connected to a category or match
    scoring page. The referee scoring panel pings this endpoint every poll
    cycle to indicate presence. Exactly one of category/match is set - solo
    /team scoring pings by category, fight scoring pings by match.
    """
    category = models.ForeignKey(
        'Category',
        on_delete=models.CASCADE,
        verbose_name=_('Categorie'),
        related_name='referee_presences',
        null=True,
        blank=True,
        help_text=_('Categoria pe care o arbitrează acest arbitru (probe solo/echipă).')
    )
    match = models.ForeignKey(
        'Match',
        on_delete=models.CASCADE,
        verbose_name=_('Meci'),
        related_name='referee_presences',
        null=True,
        blank=True,
        help_text=_('Meciul pe care îl arbitrează acest arbitru (probe de luptă).')
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
        constraints = [
            models.UniqueConstraint(fields=['category', 'referee'], condition=Q(category__isnull=False), name='unique_category_referee_presence'),
            models.UniqueConstraint(fields=['match', 'referee'], condition=Q(match__isnull=False), name='unique_match_referee_presence'),
        ]
        verbose_name = _('Prezență arbitru')
        verbose_name_plural = _('Prezențe ale arbitrilor')

    def __str__(self):
        if self.match_id:
            return f"Referee {self.referee_id} on match {self.match_id}"
        return f"Referee {self.referee_id} on category {self.category_id}"


class RefereeQRLogin(models.Model):
    """A long-lived, admin-resettable QR login credential for a referee at
    a specific event. Scanning the QR (which encodes a URL carrying this
    `token`) hits a public endpoint that exchanges it for a real JWT
    session, so a referee never has to type email/password on their own
    phone. `token` stays valid all day until an admin explicitly resets
    it (see referee_qr_login_reset) - there's no fixed expiry, since a
    referee's session naturally comes and goes throughout an event and
    they should just be able to re-scan the same still-displayed code."""
    event = models.ForeignKey(
        'landing.Event',
        on_delete=models.CASCADE,
        verbose_name=_('Eveniment'),
        related_name='referee_qr_logins',
    )
    referee = models.ForeignKey(
        'Athlete',
        on_delete=models.CASCADE,
        verbose_name=_('Arbitru'),
        related_name='qr_logins',
    )
    token = models.CharField(_('Token'), max_length=64, unique=True, db_index=True)
    # Same credential, shorter, for hardware that has no keyboard and no
    # camera - the ESP32 scoring device (devices/referee-esp32c3) dials
    # this in on its rotary encoder. Unique across every event, so the
    # device can send the PIN alone and the server knows which referee at
    # which event it is, with nothing else to configure on it.
    pin = models.CharField(_('PIN'), max_length=8, unique=True, db_index=True, null=True, blank=True)
    created_at = models.DateTimeField(_('Creat la'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Actualizat la'), auto_now=True)

    # A PIN this short is only defensible because the login endpoint that
    # takes it is rate-limited and the server lives on the venue LAN.
    # Widening it costs nothing here: the device dials any length.
    PIN_LENGTH = 5

    class Meta:
        unique_together = ('event', 'referee')
        verbose_name = _('Login QR arbitru')
        verbose_name_plural = _('Login-uri QR arbitri')

    @classmethod
    def generate_pin(cls):
        """A free PIN, drawn uniformly and checked against the ones in
        use. With a handful of referees against 100k codes a collision is
        rare, but "rare" on competition morning still means an operator
        staring at an error, so retry instead of hoping."""
        span = 10 ** cls.PIN_LENGTH
        for _attempt in range(50):
            candidate = f'{secrets.randbelow(span):0{cls.PIN_LENGTH}d}'
            if not cls.objects.filter(pin=candidate).exists():
                return candidate
        raise RuntimeError('Nu s-a putut genera un PIN liber pentru arbitru.')

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = secrets.token_urlsafe(32)
        if not self.pin:
            self.pin = self.generate_pin()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"QR login for referee {self.referee_id} on event {self.event_id}"


class RefereePinLoginAttempt(models.Model):
    """One row per *failed* PIN login, so the endpoint can lock out a
    brute-force attempt. A five-digit PIN is 100,000 codes; with a few
    dozen referees holding valid ones, an unthrottled script on the venue
    WiFi would land on somebody's within minutes. Counting failures per
    source address turns that into hours of very obvious traffic.

    In the database rather than the cache on purpose: nothing configures
    CACHES here, so Django falls back to per-process local memory, and
    the venue backend runs several gunicorn workers - the limit would
    quietly be several times looser than it reads. Successful logins are
    not recorded; this table only ever holds misses."""
    ip_address = models.GenericIPAddressField(_('Adresă IP'), db_index=True)
    pin_tried = models.CharField(_('PIN încercat'), max_length=8, blank=True)
    created_at = models.DateTimeField(_('Creat la'), auto_now_add=True, db_index=True)

    WINDOW_MINUTES = 10
    MAX_FAILURES = 10

    class Meta:
        verbose_name = _('Încercare login PIN arbitru')
        verbose_name_plural = _('Încercări login PIN arbitru')

    def __str__(self):
        return f"Failed referee PIN login from {self.ip_address} at {self.created_at}"


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
