from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0030_athlete_license_series_and_cnp'),
    ]

    operations = [
        migrations.CreateModel(
            name='Competition',
            fields=[],
            options={
                'verbose_name': 'Competition',
                'verbose_name_plural': 'Competitions',
                'proxy': True,
                'indexes': [],
                'constraints': [],
            },
            bases=('api.event',),
        ),
        migrations.CreateModel(
            name='TrainingSeminar',
            fields=[],
            options={
                'verbose_name': 'Training seminar',
                'verbose_name_plural': 'Training seminars',
                'proxy': True,
                'indexes': [],
                'constraints': [],
            },
            bases=('api.event',),
        ),
    ]
