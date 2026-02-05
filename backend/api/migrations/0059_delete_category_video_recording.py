from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0058_athleteperformancevideo_teamperformancevideo'),
    ]

    operations = [
        migrations.DeleteModel(
            name='CategoryVideoSegment',
        ),
        migrations.DeleteModel(
            name='CategoryVideoRecording',
        ),
    ]
