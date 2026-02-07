from django.db import migrations


def fix_athletematch_event_column_sqlite(apps, schema_editor):
    if schema_editor.connection.vendor != "sqlite":
        return

    with schema_editor.connection.cursor() as cursor:
        cols = [row[1] for row in cursor.execute("PRAGMA table_info(api_athletematch)").fetchall()]
        if "event_id" in cols:
            return

        cursor.execute("ALTER TABLE api_athletematch ADD COLUMN event_id bigint NULL REFERENCES landing_event (id) DEFERRABLE INITIALLY DEFERRED;")
        cursor.execute("CREATE INDEX IF NOT EXISTS api_athletematch_event_id_idx ON api_athletematch (event_id);")


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0068_fix_matchrefereescore_schema_sqlite"),
    ]

    operations = [
        migrations.RunPython(fix_athletematch_event_column_sqlite, migrations.RunPython.noop),
    ]
