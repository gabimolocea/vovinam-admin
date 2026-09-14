import landing.models
from django.db import migrations, models


def populate_event_types(apps, schema_editor):
    Event = apps.get_model('landing', 'Event')
    for event in Event.objects.all():
        event.event_types = [event.event_type] if event.event_type else []
        event.save(update_fields=['event_types'])


class Migration(migrations.Migration):

    dependencies = [
        ('landing', '0018_video_tagged_athletes_video_tagged_clubs'),
    ]

    operations = [
        migrations.AddField(
            model_name='event',
            name='event_types',
            field=models.JSONField(blank=True, default=landing.models.default_event_types, help_text='Type(s) of event'),
        ),
        migrations.RunPython(populate_event_types, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='event',
            name='event_type',
        ),
    ]
