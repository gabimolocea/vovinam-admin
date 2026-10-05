from datetime import datetime, time, timedelta

from django.db import migrations, models
from django.utils import timezone


def completeaza_expirarea(apps, schema_editor):
    """Codurile de pana acum primesc expirare: finalul ultimei zile a
    evenimentului lor, sau al zilei de azi daca evenimentul s-a incheiat deja.

    Fara pasul asta, tocmai codurile care exista deja - singurele cu care se
    lucreaza azi - ar fi ramas singurele fara expirare.
    """
    RefereeQRLogin = apps.get_model('api', 'RefereeQRLogin')
    azi = timezone.localtime(timezone.now()).date()
    for qr in RefereeQRLogin.objects.select_related('event').all():
        sfarsit = getattr(qr.event, 'end_date', None)
        ziua = azi
        if sfarsit is not None:
            if isinstance(sfarsit, datetime):
                sfarsit = timezone.localtime(sfarsit).date() if timezone.is_aware(sfarsit) else sfarsit.date()
            ziua = max(ziua, sfarsit)
        qr.expires_at = timezone.make_aware(
            datetime.combine(ziua + timedelta(days=1), time.min),
            timezone.get_current_timezone(),
        )
        qr.save(update_fields=['expires_at'])


def inapoi(apps, schema_editor):
    """Nimic de facut: campul dispare oricum odata cu migrarea inapoi."""


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0077_categoryflowevent'),
    ]

    operations = [
        migrations.AddField(
            model_name='refereeqrlogin',
            name='expires_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Expiră la'),
        ),
        migrations.RunPython(completeaza_expirarea, inapoi),
    ]
