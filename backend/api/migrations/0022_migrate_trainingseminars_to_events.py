from django.db import migrations, models
import django.db.models.deletion


def forwards_func(apps, schema_editor):
    TrainingSeminar = apps.get_model('api', 'TrainingSeminar')
    Participation = apps.get_model('api', 'TrainingSeminarParticipation')
    Event = apps.get_model('landing', 'Event')
    City = apps.get_model('api', 'City')
    from django.utils import timezone
    from django.utils.text import slugify
    import datetime

    for ts in TrainingSeminar.objects.all():
        # create an Event corresponding to this TrainingSeminar
        title = ts.name or f"Training Seminar {ts.pk}"
        # ensure unique slug using id
        slug = slugify(f"training-seminar-{ts.pk}-{title}")[:200]
        start_dt = None
        end_dt = None
        if ts.start_date:
            # create a timezone-aware datetime at the start of the day
            naive_start = datetime.datetime.combine(ts.start_date, datetime.time.min)
            try:
                start_dt = timezone.make_aware(naive_start)
            except Exception:
                # fallback: use timezone-aware now as a safe default
                start_dt = timezone.make_aware(naive_start, timezone.get_current_timezone())
        if ts.end_date:
            # create a timezone-aware datetime at the end of the day
            naive_end = datetime.datetime.combine(ts.end_date, datetime.time.max)
            try:
                end_dt = timezone.make_aware(naive_end)
            except Exception:
                end_dt = timezone.make_aware(naive_end, timezone.get_current_timezone())

        # try to match a City by place name (best-effort)
        city = None
        if ts.place:
            city = City.objects.filter(name__iexact=ts.place).first()

        ev = Event.objects.create(
            title=title,
            slug=slug,
            description="Migrated from TrainingSeminar",
            start_date=start_dt or timezone.now(),
            end_date=end_dt,
            address=ts.place or "",
            city=city,
            event_type='training_seminar',
            tags=f"migrated_from_trainingseminar:{ts.pk}",
            created_at=timezone.now(),
        )

        # Link participations
        Participation.objects.filter(seminar=ts).update(event=ev)


def reverse_func(apps, schema_editor):
    Participation = apps.get_model('api', 'TrainingSeminarParticipation')
    Event = apps.get_model('landing', 'Event')

    # For safety, only remove events that were created by this migration (tagged)
    migrated_events = Event.objects.filter(tags__startswith='migrated_from_trainingseminar:')
    # Nullify participation.event before deleting events
    for ev in migrated_events:
        Participation.objects.filter(event=ev).update(event=None)
    # Delete migrated events
    migrated_events.delete()


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0021_migrate_competitions_to_events'),
        ('landing', '0007_event_event_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='trainingseminarparticipation',
            name='event',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='seminar_participations', to='landing.event'),
        ),
        migrations.RunPython(forwards_func, reverse_func),
    ]
