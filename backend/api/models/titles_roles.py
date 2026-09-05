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

class Title(models.Model):
    name = models.CharField(_('Nume'), max_length=100, unique=True)  # Title name

    class Meta:
        verbose_name = _('Titlu')
        verbose_name_plural = _('Titluri')

    def __str__(self):
        return self.name


class FederationRole(models.Model):
    name = models.CharField(_('Nume'), max_length=100, unique=True)  # Federation role name

    class Meta:
        verbose_name = _('Rol în federație')
        verbose_name_plural = _('Roluri în federație')

    def __str__(self):
        return self.name
