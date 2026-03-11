from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('landing', '0011_event_local_sync_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='event',
            name='results_uploaded_at',
            field=models.DateTimeField(
                blank=True,
                null=True,
                help_text='Momentul în care rezultatele locale au fost încărcate în cloud.',
            ),
        ),
        migrations.AddField(
            model_name='event',
            name='sync_completed_at',
            field=models.DateTimeField(
                blank=True,
                null=True,
                help_text='Momentul în care sincronizarea locală a fost finalizată și evenimentul a revenit în cloud.',
            ),
        ),
    ]