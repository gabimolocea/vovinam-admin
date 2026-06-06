from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('landing', '0010_event_coach_registration_deadline'),
    ]

    operations = [
        migrations.AddField(
            model_name='event',
            name='exported_to_local_at',
            field=models.DateTimeField(
                blank=True,
                null=True,
                help_text='Momentul în care evenimentul a fost exportat pentru operare locală.',
            ),
        ),
        migrations.AddField(
            model_name='event',
            name='local_sync_status',
            field=models.CharField(
                choices=[
                    ('idle', 'Neexportat'),
                    ('exported', 'Exportat local'),
                    ('local_in_progress', 'În desfășurare local'),
                    ('results_uploaded', 'Rezultate încărcate'),
                    ('completed', 'Sincronizare finalizată'),
                ],
                default='idle',
                help_text='Starea fluxului de sincronizare cloud → local → cloud pentru acest eveniment.',
                max_length=24,
            ),
        ),
        migrations.AddField(
            model_name='event',
            name='sync_locked',
            field=models.BooleanField(
                default=False,
                help_text='Blochează modificările operaționale în cloud după exportul către serverul local al competiției.',
            ),
        ),
        migrations.AddField(
            model_name='event',
            name='sync_mode',
            field=models.CharField(
                choices=[('cloud', 'Cloud'), ('local_event', 'Eveniment local')],
                default='cloud',
                help_text='Indică dacă evenimentul este administrat în cloud sau în modul local de competiție.',
                max_length=20,
            ),
        ),
    ]