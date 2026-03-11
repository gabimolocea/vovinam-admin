from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0025_diplomatemplate_category_scope'),
    ]

    operations = [
        migrations.AddField(
            model_name='match',
            name='display_mode',
            field=models.CharField(
                choices=[('reveal_final', 'Reveal Final'), ('real_time', 'Real Time Scoring')],
                default='reveal_final',
                max_length=20,
            ),
        ),
    ]
