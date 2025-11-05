from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0013_extend_notification_types'),
    ]

    operations = [
        migrations.DeleteModel(
            name='FrontendTheme',
        ),
    ]
