from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0026_delete_trainingseminarbackup_eventproxy_and_more'),
    ]

    operations = [
        migrations.RenameModel(
            old_name='EventProxy',
            new_name='Event',
        ),
    ]
