from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0060_update_solo_performance_video_labels'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='matchvideorecording',
            name='title',
        ),
        migrations.RemoveField(
            model_name='athleteperformancevideo',
            name='title',
        ),
        migrations.RemoveField(
            model_name='teamperformancevideo',
            name='title',
        ),
        migrations.RemoveField(
            model_name='matchvideorecording',
            name='notes',
        ),
        migrations.RemoveField(
            model_name='athleteperformancevideo',
            name='notes',
        ),
        migrations.RemoveField(
            model_name='teamperformancevideo',
            name='notes',
        ),
    ]
