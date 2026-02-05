from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0059_delete_category_video_recording'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='athleteperformancevideo',
            options={
                'verbose_name': 'Solo Performance Video',
                'verbose_name_plural': 'Solo Performance Videos',
                'ordering': ['-recorded_at', '-uploaded_at'],
            },
        ),
        migrations.AlterField(
            model_name='athleteperformancevideo',
            name='athlete_score',
            field=models.OneToOneField(
                help_text='The athlete score entry this video documents',
                on_delete=django.db.models.deletion.CASCADE,
                related_name='performance_video',
                to='api.categoryathletescore',
                verbose_name='Solo category',
            ),
        ),
    ]
