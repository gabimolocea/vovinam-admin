from django.db import migrations


def fix_matchrefereescore_schema_sqlite(apps, schema_editor):
    if schema_editor.connection.vendor != "sqlite":
        return

    with schema_editor.connection.cursor() as cursor:
        info = cursor.execute("PRAGMA table_info(api_matchrefereescore)").fetchall()
        cols = [row[1] for row in info]
        # If submitted_date already exists, assume schema is correct
        if "submitted_date" in cols and "notes" in cols:
            return

        cursor.execute("PRAGMA foreign_keys=OFF;")

        cursor.execute(
            "CREATE TABLE api_matchrefereescore_new ("
            "id integer NOT NULL PRIMARY KEY AUTOINCREMENT,"
            "match_id bigint NOT NULL REFERENCES api_match (id) DEFERRABLE INITIALLY DEFERRED,"
            "referee_id bigint NOT NULL REFERENCES api_athlete (id) DEFERRABLE INITIALLY DEFERRED,"
            "red_corner_score decimal(5,2) NOT NULL DEFAULT 0,"
            "blue_corner_score decimal(5,2) NOT NULL DEFAULT 0,"
            "submitted_date datetime NOT NULL,"
            "notes text NULL"
            ");"
        )

        # Copy existing data and set submitted_date to current timestamp
        cursor.execute(
            "INSERT INTO api_matchrefereescore_new ("
            "id, match_id, referee_id, red_corner_score, blue_corner_score, submitted_date, notes"
            ") "
            "SELECT id, match_id, referee_id, red_corner_score, blue_corner_score, CURRENT_TIMESTAMP, NULL "
            "FROM api_matchrefereescore;"
        )

        cursor.execute("DROP TABLE api_matchrefereescore;")
        cursor.execute("ALTER TABLE api_matchrefereescore_new RENAME TO api_matchrefereescore;")

        cursor.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS api_matchrefereescore_match_referee_unique "
            "ON api_matchrefereescore (match_id, referee_id);"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS api_matchrefereescore_match_referee_idx "
            "ON api_matchrefereescore (match_id, referee_id);"
        )

        cursor.execute("PRAGMA foreign_keys=ON;")


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0068_alter_category_options_alter_match_options_and_more"),
    ]

    operations = [
        migrations.RunPython(fix_matchrefereescore_schema_sqlite, migrations.RunPython.noop),
    ]
