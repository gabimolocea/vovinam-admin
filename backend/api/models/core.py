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

class City(models.Model):
    name = models.CharField(_('Nume'), max_length=100, unique=True)
    created = models.DateTimeField(_('Data creării'), auto_now_add=True)
    modified = models.DateTimeField(_('Data actualizării'), auto_now=True)

    class Meta:
        verbose_name = _('Oraș')
        verbose_name_plural = _('Orașe')

    def __str__(self):
        return self.name
    
class Group(models.Model):
    """
    Represents an age-based group within an event/competition.
    Groups organize categories by athlete birth year ranges.
    Example: Athletes born 2015-2018
    """
    name = models.CharField(
        _('Nume'),
        max_length=100,
        help_text=_("Numele grupei (de exemplu, „U12 Începători”, „Tineret 2015-2018”).")
    )
    event = models.ForeignKey(
        'landing.Event',
        on_delete=models.CASCADE,
        verbose_name=_('Eveniment'),
        related_name='groups',
        null=True,
        blank=True
    )
    birth_year_start = models.IntegerField(
        _('An naștere de început'),
        null=True,
        blank=True,
        help_text=_('Anul de naștere de început pentru această grupă de vârstă (de exemplu, 2015).')
    )
    birth_year_end = models.IntegerField(
        _('An naștere de sfârșit'),
        null=True,
        blank=True,
        help_text=_('Anul de naștere de sfârșit pentru această grupă de vârstă (de exemplu, 2018).')
    )
    birth_date_start = models.DateField(
        _('Data nașterii de început'),
        null=True,
        blank=True,
        help_text=_('Data exactă de început pentru eligibilitatea de vârstă (inclusiv). Dacă este setată, are prioritate față de anul de naștere de început.')
    )
    birth_date_end = models.DateField(
        _('Data nașterii de sfârșit'),
        null=True,
        blank=True,
        help_text=_('Data exactă de sfârșit pentru eligibilitatea de vârstă (inclusiv). Dacă este setată, are prioritate față de anul de naștere de sfârșit.')
    )
    allow_younger = models.BooleanField(
        _('Permite sportivi mai tineri'),
        default=False,
        help_text=_('Permite sportivilor mai tineri decât vârsta minimă să concureze într-o categorie de vârstă superioară.')
    )
    GRADE_TYPE_CHOICES = [
        ('all', 'Toate gradele'),
        ('inferior', 'Doar grade inferioare'),
        ('superior', 'Doar grade superioare'),
    ]
    allowed_grade_type = models.CharField(
        _('Tip grad permis'),
        max_length=10,
        choices=GRADE_TYPE_CHOICES,
        default='all',
        help_text=_('Restricționează participarea după tipul gradului: „inferior” = doar grade inferioare, „superior” = doar grade superioare.')
    )
    display_order = models.IntegerField(
        _('Ordine de afișare'),
        default=0,
        help_text=_('Ordinea de afișare în cadrul evenimentului.')
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['event', 'name'],
                name='unique_group_per_event',
                condition=models.Q(event__isnull=False)
            ),
        ]
        ordering = ['event', 'display_order', 'id']
        verbose_name = _('Grupă')
        verbose_name_plural = _('Grupe')

    def __str__(self):
        age_range = ""
        if self.birth_year_start and self.birth_year_end:
            age_range = f" [{self.birth_year_start}-{self.birth_year_end}]"
        elif self.birth_year_start:
            age_range = f" [{self.birth_year_start}+]"
        elif self.birth_year_end:
            age_range = f" [up to {self.birth_year_end}]"
        
        if self.event:
            return f"{self.name}{age_range} ({self.event.title})"
        return f"{self.name}{age_range} (No Event)"
    
    def clean(self):
        from django.core.exceptions import ValidationError
        if self.birth_year_start and self.birth_year_end:
            if self.birth_year_start > self.birth_year_end:
                raise ValidationError({
                    'birth_year_start': 'Start year must be before or equal to end year'
                })

    def eligibility_warnings(self, athlete):
        """Non-blocking eligibility checks (age + grade type) for enrolling
        ``athlete`` into this group. Returns a list of Romanian warning
        strings; an empty list means no issues detected. Callers should
        still allow the enrollment to proceed (e.g. an admin can force it)."""
        warnings = []

        dob = getattr(athlete, 'date_of_birth', None)
        if dob:
            if self.birth_date_start and self.birth_date_end:
                if not (self.birth_date_start <= dob <= self.birth_date_end):
                    if not (self.allow_younger and dob < self.birth_date_start):
                        warnings.append(
                            'Data de naștere a sportivului nu se încadrează în intervalul grupei de vârstă.'
                        )
            elif self.birth_year_start and self.birth_year_end:
                if not (self.birth_year_start <= dob.year <= self.birth_year_end):
                    if not (self.allow_younger and dob.year < self.birth_year_start):
                        warnings.append(
                            'Anul nașterii sportivului nu se încadrează în intervalul grupei de vârstă.'
                        )

        if self.allowed_grade_type != 'all':
            grade = getattr(athlete, 'current_grade', None)
            if grade and grade.grade_type != self.allowed_grade_type:
                warnings.append(
                    f'Gradul sportivului ({grade.get_grade_type_display()}) nu corespunde cerinței grupei '
                    f'({self.get_allowed_grade_type_display()}).'
                )

        return warnings

 
# FrontendTheme model removed — dynamic theme management has been deleted.
# The database migration that originally created the model remains; a
# subsequent migration will drop the table when applied.

# AthleteActivity and CategoryScoreActivity models removed - activity tracking eliminated per business decision
