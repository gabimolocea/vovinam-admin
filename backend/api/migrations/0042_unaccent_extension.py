from django.contrib.postgres.operations import UnaccentExtension
from django.db import migrations


class Migration(migrations.Migration):
    """Enable the PostgreSQL 'unaccent' extension so CityAdmin can perform
    accent-insensitive search directly in the database instead of pulling
    every City row into Python on each keystroke. This is a no-op on
    non-PostgreSQL backends (e.g. the SQLite database used in local
    development/tests)."""

    dependencies = [
        ('api', '0041_rename_api_fightgr_event_i_eb4365_idx_api_fightgr_event_i_be2387_idx_and_more'),
    ]

    operations = [
        UnaccentExtension(),
    ]
