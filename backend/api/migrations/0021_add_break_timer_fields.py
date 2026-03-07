from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0020_add_decisions_revealed_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='displaymonitorsession',
            name='break_end_time',
            field=models.DateTimeField(blank=True, null=True, help_text='Absolute UTC time when break should end'),
        ),
        migrations.AddField(
            model_name='displaymonitorsession',
            name='break_paused',
            field=models.BooleanField(default=False, help_text='Whether the break timer is currently paused'),
        ),
        migrations.AddField(
            model_name='displaymonitorsession',
            name='break_paused_remaining',
            field=models.IntegerField(default=0, help_text='Seconds remaining when break was paused'),
        ),
    ]
