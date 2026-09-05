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
    name = models.CharField(max_length=100, unique=True)
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name
    
class Group(models.Model):
    """
    Represents an age-based group within an event/competition.
    Groups organize categories by athlete birth year ranges.
    Example: Athletes born 2015-2018
    """
    name = models.CharField(max_length=100, help_text="Group name (e.g., 'U12 Beginners', 'Youth 2015-2018')")
    event = models.ForeignKey(
        'landing.Event',
        on_delete=models.CASCADE,
        related_name='groups',
        null=True,
        blank=True
    )
    birth_year_start = models.IntegerField(
        null=True,
        blank=True,
        help_text="Starting birth year for this age group (e.g., 2015)"
    )
    birth_year_end = models.IntegerField(
        null=True,
        blank=True,
        help_text="Ending birth year for this age group (e.g., 2018)"
    )
    birth_date_start = models.DateField(
        null=True,
        blank=True,
        help_text="Exact start date for age eligibility (inclusive). If set, takes priority over birth_year_start."
    )
    birth_date_end = models.DateField(
        null=True,
        blank=True,
        help_text="Exact end date for age eligibility (inclusive). If set, takes priority over birth_year_end."
    )
    allow_younger = models.BooleanField(
        default=False,
        help_text="Allow athletes younger than the minimum age (who want to compete in a higher age category)"
    )
    GRADE_TYPE_CHOICES = [
        ('all', 'All grades'),
        ('inferior', 'Inferior grades only'),
        ('superior', 'Superior grades only'),
    ]
    allowed_grade_type = models.CharField(
        max_length=10,
        choices=GRADE_TYPE_CHOICES,
        default='all',
        help_text="Restrict participation by grade type. 'inferior' = only inferior grades, 'superior' = only superior grades."
    )
    display_order = models.IntegerField(default=0, help_text="Order within the event for display purposes")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['event', 'name'],
                name='unique_group_per_event',
                condition=models.Q(event__isnull=False)
            ),
        ]
        ordering = ['event', 'display_order', 'id']

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

