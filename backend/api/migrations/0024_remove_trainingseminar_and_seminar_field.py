from django.db import migrations, models
import django.db.models.deletion


def forwards_func(apps, schema_editor):
    TrainingSeminar = apps.get_model('api', 'TrainingSeminar')
    Participation = apps.get_model('api', 'TrainingSeminarParticipation')
    Event = apps.get_model('landing', 'Event')
    Backup = apps.get_model('api', 'TrainingSeminarBackup')

    from django.utils import timezone
    from django.utils.text import slugify
    import datetime

    for ts in TrainingSeminar.objects.all():
        # ensure there is an Event for this seminar
        ev = Event.objects.filter(tags__startswith=f'migrated_from_trainingseminar:{ts.pk}').first()
        if not ev:
            title = ts.name or f"Training Seminar {ts.pk}"
            slug = slugify(f"training-seminar-{ts.pk}-{title}")[:200]
            start_dt = None
            end_dt = None
            if ts.start_date:
                naive_start = datetime.datetime.combine(ts.start_date, datetime.time.min)
                start_dt = timezone.make_aware(naive_start)
            if ts.end_date:
                naive_end = datetime.datetime.combine(ts.end_date, datetime.time.max)
                end_dt = timezone.make_aware(naive_end)

            ev = Event.objects.create(
                title=title,
                slug=slug,
                description="Migrated from TrainingSeminar (destructive cleanup)",
                start_date=start_dt or timezone.now(),
                end_date=end_dt,
                address=ts.place or "",
                city=None,
                event_type='training_seminar',
                tags=f"migrated_from_trainingseminar:{ts.pk}",
                created_at=timezone.now(),
            )

        # link participations
        Participation.objects.filter(seminar=ts).update(event=ev)

        # create backup row
        athlete_ids = list(ts.athletes.values_list('pk', flat=True))
        Backup.objects.create(
            id=ts.pk,
            name=ts.name,
            start_date=ts.start_date,
            end_date=ts.end_date,
            place=ts.place,
            athletes_csv=','.join(str(i) for i in athlete_ids),
        )


def reverse_func(apps, schema_editor):
    Backup = apps.get_model('api', 'TrainingSeminarBackup')
    TrainingSeminar = apps.get_model('api', 'TrainingSeminar')
    Participation = apps.get_model('api', 'TrainingSeminarParticipation')

    # recreate TrainingSeminar rows from backup and re-link participations
    for b in Backup.objects.all():
        ts, created = TrainingSeminar.objects.get_or_create(
            pk=b.id,
            defaults={
                'name': b.name,
                'start_date': b.start_date,
                'end_date': b.end_date,
                'place': b.place,
            }
        )
        if b.athletes_csv:
            ids = [int(x) for x in b.athletes_csv.split(',') if x]
            # set M2M after save
            ts.athletes.set(ids)

        # re-link participations with event tags pointing to this seminar id
        Participation.objects.filter(event__tags__startswith=f'migrated_from_trainingseminar:{b.id}').update(seminar_id=b.id)


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0023_migrate_trainingseminars_to_events'),
        ('landing', '0007_event_event_type'),
    ]

    operations = [
        # Backup model to store TrainingSeminar data for reversible restore
        migrations.CreateModel(
            name='TrainingSeminarBackup',
            fields=[
                ('id', models.IntegerField(primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=100)),
                ('start_date', models.DateField(blank=True, null=True)),
                ('end_date', models.DateField(blank=True, null=True)),
                ('place', models.CharField(max_length=100, blank=True, null=True)),
                ('athletes_csv', models.TextField(blank=True, null=True)),
            ],
        ),
        migrations.RunPython(forwards_func, reverse_func),
        # NOTE: This migration only creates a backup and ensures participations
        # are linked to Events. The actual destructive removal of the
        # `TrainingSeminar` model and the `seminar` FK should be performed in a
        # follow-up migration after verification and a release window. Doing the
        # destructive removal here caused test-time migration issues, so we
        # intentionally stop after creating the backup.
    ]
