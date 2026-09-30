from django.db import models
from django.utils.translation import gettext_lazy as _

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
