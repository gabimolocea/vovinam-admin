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
        ('parent', 'Parent'),
        ('guardian', 'Guardian'),
        ('coach', 'Coach'),
        ('other', 'Other'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    supporter = models.ForeignKey(User, on_delete=models.CASCADE, related_name='supported_athletes')
    athlete = models.ForeignKey(Athlete, on_delete=models.CASCADE, related_name='supporters')
    relationship = models.CharField(max_length=20, choices=RELATIONSHIP_CHOICES, default='other')
    can_edit = models.BooleanField(default=False, help_text='Can edit athlete profile')
    can_register_competitions = models.BooleanField(default=False, help_text='Can register athlete for competitions')
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default='pending',
        help_text='Relationship must be approved by the athlete or an admin before it grants any permission.',
    )
    reviewed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_supporter_relations',
    )
    reviewed_date = models.DateTimeField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['supporter', 'athlete']

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

