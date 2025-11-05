from django.db import migrations
import datetime
from django.utils import timezone


def create_events_from_competitions(apps, schema_editor):
    Competition = apps.get_model('api', 'Competition')
    Category = apps.get_model('api', 'Category')
    # Import Event model from landing app
    Event = apps.get_model('landing', 'Event')

    for comp in Competition.objects.all():
        # Create corresponding Event
        start_dt = None
        end_dt = None
        if comp.start_date:
            start_dt = timezone.make_aware(datetime.datetime.combine(comp.start_date, datetime.time.min))
        if comp.end_date:
            end_dt = timezone.make_aware(datetime.datetime.combine(comp.end_date, datetime.time.max))

        ev = Event.objects.create(
            title=comp.name,
            slug=f"competition-{comp.id}",
            description=f"Migrated competition: {comp.name}",
            start_date=start_dt or timezone.now(),
            end_date=end_dt,
            address=comp.place or '',
            event_type='competition'
        )

        # Link categories
        for cat in Category.objects.filter(competition=comp):
            cat.event = ev
            cat.save()


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0020_category_event'),
        ('landing', '0007_event_event_type'),
    ]

    operations = [
        migrations.RunPython(create_events_from_competitions, reverse_code=noop),
    ]
