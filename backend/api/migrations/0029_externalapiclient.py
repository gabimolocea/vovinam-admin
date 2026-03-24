from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0028_athlete_gender'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ExternalAPIClient',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120, unique=True)),
                ('api_key_prefix', models.CharField(db_index=True, editable=False, max_length=16)),
                ('api_key_hash', models.CharField(editable=False, max_length=64, unique=True)),
                ('allowed_origins', models.TextField(blank=True, help_text='Un origin per linie, de exemplu https://my-app.web.app sau https://my-app.firebaseapp.com')),
                ('allow_write', models.BooleanField(default=True, help_text='Permite cereri POST/PUT/PATCH/DELETE. Dacă este debifat, cheia rămâne doar pentru citire.')),
                ('is_active', models.BooleanField(default=True)),
                ('notes', models.TextField(blank=True)),
                ('last_used_at', models.DateTimeField(blank=True, null=True)),
                ('last_used_ip', models.GenericIPAddressField(blank=True, null=True, unpack_ipv4=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('service_user', models.ForeignKey(help_text='Utilizatorul folosit de cererile autentificate cu această cheie API.', on_delete=django.db.models.deletion.PROTECT, related_name='external_api_clients', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Client API extern',
                'verbose_name_plural': 'Clienți API externi',
                'ordering': ('name',),
            },
        ),
    ]
