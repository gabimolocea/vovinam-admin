from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0045_supporterathleterelation_reviewed_by_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='athlete',
            name='referee_level',
            field=models.CharField(
                blank=True,
                choices=[('national', 'Arbitru național'), ('international', 'Arbitru internațional')],
                help_text='Folosit pentru gruparea pe pagina publică Arbitri (internaționali/naționali).',
                max_length=20,
                null=True,
                verbose_name='Nivel arbitraj',
            ),
        ),
    ]
