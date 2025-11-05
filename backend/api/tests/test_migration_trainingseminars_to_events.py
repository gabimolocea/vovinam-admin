import importlib
from datetime import date

import pytest


@pytest.mark.django_db
def test_migrate_trainingseminar_to_event_and_reverse():
    """Create a TrainingSeminar + Participation, run the migration forward func,
    assert an Event is created and the participation.event is set, then run the
    reverse func and assert the Event is removed and participation.event cleared.
    """
    from django.apps import apps

    City = apps.get_model('api', 'City')
    Athlete = apps.get_model('api', 'Athlete')
    TrainingSeminar = apps.get_model('api', 'TrainingSeminar')
    Participation = apps.get_model('api', 'TrainingSeminarParticipation')
    Event = apps.get_model('landing', 'Event')

    # Create minimal required records
    City.objects.create(name='TestCity')
    athlete = Athlete.objects.create(first_name='T', last_name='E', date_of_birth=date(2000, 1, 1))

    ts = TrainingSeminar.objects.create(name='TS Test', start_date=date(2025, 1, 1), end_date=date(2025, 1, 2), place='TestCity')
    participation = Participation.objects.create(athlete=athlete, seminar=ts, submitted_by_athlete=False)

    # Import migration module and run forward migration
    mod = importlib.import_module('api.migrations.0022_migrate_trainingseminars_to_events')
    # Run forward
    mod.forwards_func(apps, schema_editor=None)

    # Refresh and assert
    participation.refresh_from_db()
    assert participation.event is not None, "Participation.event should be set after migration"
    ev = participation.event
    assert ev.event_type == 'training_seminar'
    assert f"migrated_from_trainingseminar:{ts.pk}" in (ev.tags or '')

    # Run reverse and assert cleanup
    mod.reverse_func(apps, schema_editor=None)
    participation.refresh_from_db()
    assert participation.event is None, "Participation.event should be cleared after reverse migration"
    # The migrated Event(s) should be deleted
    assert not Event.objects.filter(tags__startswith=f'migrated_from_trainingseminar:{ts.pk}').exists()
