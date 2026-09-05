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

from ._common import User
class Notification(models.Model):
    """Model for storing notifications to users"""
    NOTIFICATION_TYPES = [
        ('result_submitted', 'Rezultat trimis'),
        ('result_approved', 'Rezultat aprobat'),
        ('result_rejected', 'Rezultat respins'),
        ('result_revision_required', 'Rezultat cu revizie solicitată'),
        ('grade_submitted', 'Examen de grad trimis'),
        ('grade_approved', 'Examen de grad aprobat'),
        ('grade_rejected', 'Examen de grad respins'),
        ('grade_revision_required', 'Examen de grad cu revizie solicitată'),
        ('seminar_submitted', 'Participare la seminar trimisă'),
        ('seminar_approved', 'Participare la seminar aprobată'),
        ('seminar_rejected', 'Participare la seminar respinsă'),
        ('seminar_revision_required', 'Participare la seminar cu revizie solicitată'),
        ('competition_created', 'Competiție creată'),
        ('competition_updated', 'Competiție actualizată'),
        ('system_announcement', 'Anunț de sistem'),
        ('supporter_request', 'Cerere relație susținător'),
        ('supporter_approved', 'Relație susținător aprobată'),
        ('supporter_rejected', 'Relație susținător respinsă'),
    ]
    
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name=_('Destinatar'), related_name='notifications')
    notification_type = models.CharField(_('Tip notificare'), max_length=30, choices=NOTIFICATION_TYPES)
    title = models.CharField(_('Titlu'), max_length=200)
    message = models.TextField(_('Mesaj'))
    is_read = models.BooleanField(_('Citită'), default=False)
    created_at = models.DateTimeField(_('Data creării'), auto_now_add=True)
    read_at = models.DateTimeField(_('Data citirii'), null=True, blank=True)
    
    # Optional link to related objects
    related_result = models.ForeignKey(
        'CategoryAthleteScore',
        on_delete=models.CASCADE,
        verbose_name=_('Rezultat asociat'),
        null=True,
        blank=True
    )
    related_competition = models.ForeignKey(
        'landing.Event', on_delete=models.CASCADE, null=True, blank=True,
        verbose_name=_('Eveniment asociat'),
        related_name='notifications',
        help_text=_('Legătură opțională către competiția sau evenimentul la care se referă notificarea.'),
    )
    
    # Optional action data (JSON field for flexible data storage)
    action_data = models.JSONField(
        _('Date acțiune'),
        null=True,
        blank=True,
        help_text=_('Date suplimentare pentru acțiunile notificării.')
    )
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['recipient', '-created_at']),
            models.Index(fields=['recipient', 'is_read']),
        ]
        verbose_name = _('Notificare')
        verbose_name_plural = _('Notificări')
    
    def __str__(self):
        return f"{self.title} - {self.recipient.get_full_name()}"
    
    def mark_as_read(self):
        """Mark notification as read"""
        from django.utils import timezone
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save()


class NotificationSettings(models.Model):
    """Model for user notification preferences"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, verbose_name=_('Utilizator'), related_name='notification_settings')
    
    # Email notification preferences
    email_on_result_status_change = models.BooleanField(_('Email la schimbarea stării rezultatului'), default=True)
    email_on_competition_updates = models.BooleanField(_('Email la actualizări ale competiției'), default=True)
    email_on_system_announcements = models.BooleanField(_('Email la anunțuri de sistem'), default=True)
    
    # In-app notification preferences
    notify_result_submitted = models.BooleanField(_('Notifică rezultat trimis'), default=True)
    notify_result_approved = models.BooleanField(_('Notifică rezultat aprobat'), default=True)
    notify_result_rejected = models.BooleanField(_('Notifică rezultat respins'), default=True)
    notify_result_revision_required = models.BooleanField(_('Notifică rezultat cu revizie solicitată'), default=True)
    notify_grade_submitted = models.BooleanField(_('Notifică grad trimis'), default=True)
    notify_grade_approved = models.BooleanField(_('Notifică grad aprobat'), default=True)
    notify_grade_rejected = models.BooleanField(_('Notifică grad respins'), default=True)
    notify_grade_revision_required = models.BooleanField(_('Notifică grad cu revizie solicitată'), default=True)
    notify_seminar_submitted = models.BooleanField(_('Notifică participare la seminar trimisă'), default=True)
    notify_seminar_approved = models.BooleanField(_('Notifică participare la seminar aprobată'), default=True)
    notify_seminar_rejected = models.BooleanField(_('Notifică participare la seminar respinsă'), default=True)
    notify_seminar_revision_required = models.BooleanField(_('Notifică participare la seminar cu revizie solicitată'), default=True)
    notify_competition_created = models.BooleanField(_('Notifică competiție creată'), default=True)
    notify_competition_updated = models.BooleanField(_('Notifică competiție actualizată'), default=False)
    notify_system_announcements = models.BooleanField(_('Notifică anunțuri de sistem'), default=True)
    
    created_at = models.DateTimeField(_('Data creării'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Data actualizării'), auto_now=True)

    class Meta:
        verbose_name = _('Setări notificări')
        verbose_name_plural = _('Setări notificări')
    
    def __str__(self):
        return f"Setări notificări - {self.user.get_full_name()}"


# Signal to create notification settings for new users
@receiver(post_save, sender=User)
def create_notification_settings(sender, instance, created, **kwargs):
    """Create notification settings when a new user is created"""
    if created:
        NotificationSettings.objects.create(user=instance)
