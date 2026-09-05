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

from ._common import (
    Athlete,
    User,
)
class SupporterAthleteRelation(models.Model):
    """Relationship between supporters and athletes"""
    RELATIONSHIP_CHOICES = [
        ('parent', 'Părinte'),
        ('guardian', 'Tutore'),
        ('coach', 'Antrenor'),
        ('other', 'Altă relație'),
    ]

    STATUS_CHOICES = [
        ('pending', 'În așteptare'),
        ('approved', 'Aprobată'),
        ('rejected', 'Respinsă'),
    ]

    supporter = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name=_('Susținător'), related_name='supported_athletes')
    athlete = models.ForeignKey(Athlete, on_delete=models.CASCADE, verbose_name=_('Sportiv'), related_name='supporters')
    relationship = models.CharField(_('Relație'), max_length=20, choices=RELATIONSHIP_CHOICES, default='other')
    can_edit = models.BooleanField(_('Poate edita profilul'), default=False, help_text=_('Poate edita profilul sportivului.'))
    can_register_competitions = models.BooleanField(
        _('Poate înscrie la competiții'),
        default=False,
        help_text=_('Poate înscrie sportivul la competiții.')
    )
    status = models.CharField(
        _('Stare'),
        max_length=20, choices=STATUS_CHOICES, default='pending',
        help_text=_('Relația trebuie aprobată de sportiv sau de un administrator înainte de a acorda permisiuni.'),
    )
    reviewed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, verbose_name=_('Revizuit de'), null=True, blank=True, related_name='reviewed_supporter_relations',
    )
    reviewed_date = models.DateTimeField(_('Data revizuirii'), null=True, blank=True)
    created = models.DateTimeField(_('Data creării'), auto_now_add=True)

    class Meta:
        unique_together = ['supporter', 'athlete']
        verbose_name = _('Relație susținător-sportiv')
        verbose_name_plural = _('Relații susținător-sportiv')

    def __str__(self):
        return f"{self.supporter.get_full_name() or self.supporter.username} supports {self.athlete}"

    @property
    def is_approved(self):
        return self.status == 'approved'

    def approve(self, reviewer):
        self.status = 'approved'
        self.reviewed_by = reviewer
        self.reviewed_date = timezone.now()
        self.save(update_fields=['status', 'reviewed_by', 'reviewed_date'])

    def reject(self, reviewer):
        self.status = 'rejected'
        self.reviewed_by = reviewer
        self.reviewed_date = timezone.now()
        self.save(update_fields=['status', 'reviewed_by', 'reviewed_date'])
