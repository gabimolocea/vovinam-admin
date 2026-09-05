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

from .core import City
class Club(models.Model):
    name = models.CharField(_('Nume'), max_length=100, unique=True)
    logo = models.ImageField(_('Siglă'), upload_to='club_logos/', blank=True, null=True)  # Optional logo field
    city = models.ForeignKey(
        City, 
        on_delete=models.SET_NULL,  # Changed from CASCADE to SET_NULL for data safety
        verbose_name=_('Oraș'),
        related_name='clubs',
        blank=True,
        null=True
    )
    address = models.TextField(_('Adresă'), blank=True, null=True)
    mobile_number = models.CharField(_('Telefon mobil'), max_length=15, blank=True, null=True)
    website = models.URLField(_('Website'), max_length=200, blank=True, null=True)
    coaches = models.ManyToManyField(
        'Athlete', 
        verbose_name=_('Antrenori'),
        related_name='coached_clubs', 
        blank=True
    )  # Replace coach field with ManyToManyField to Athlete
    display_order = models.IntegerField(
        _('Ordine de afișare'),
        default=0,
        help_text=_('Ordinea de afișare în centralizator.')
    )
    created = models.DateTimeField(_('Data creării'), auto_now_add=True)
    modified = models.DateTimeField(_('Data actualizării'), auto_now=True)

    class Meta:
        ordering = ['display_order', 'name']
        verbose_name = _('Club')
        verbose_name_plural = _('Cluburi')

    def __str__(self):
        return self.name
