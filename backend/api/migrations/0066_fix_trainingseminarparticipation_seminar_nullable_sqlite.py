from django.db import migrations


def make_seminar_nullable_sqlite(apps, schema_editor):
    if schema_editor.connection.vendor != "sqlite":
        return

    with schema_editor.connection.cursor() as cursor:
        info = cursor.execute(
            "PRAGMA table_info(api_trainingseminarparticipation)"
        ).fetchall()
        notnull_map = {row[1]: row[3] for row in info}
        if notnull_map.get("seminar_id") == 0:
            return  # already nullable

        cursor.execute("PRAGMA foreign_keys=OFF;")

        cursor.execute(
            "CREATE TABLE api_trainingseminarparticipation_new ("
            "id integer NOT NULL PRIMARY KEY AUTOINCREMENT,"
            "submitted_by_athlete bool NOT NULL,"
            "participation_certificate varchar(100) NULL,"
            "participation_document varchar(100) NULL,"
            "notes text NULL,"
            "status varchar(20) NOT NULL,"
            "submitted_date datetime NOT NULL,"
            "reviewed_date datetime NULL,"
            "admin_notes text NULL,"
            "athlete_id bigint NOT NULL REFERENCES api_athlete (id) DEFERRABLE INITIALLY DEFERRED,"
            "reviewed_by_id bigint NULL REFERENCES api_user (id) DEFERRABLE INITIALLY DEFERRED,"
            "seminar_id bigint NULL REFERENCES api_trainingseminar (id) DEFERRABLE INITIALLY DEFERRED,"
            "event_id bigint NULL REFERENCES landing_event (id) DEFERRABLE INITIALLY DEFERRED"
            ");"
        )

        cursor.execute(
            "INSERT INTO api_trainingseminarparticipation_new ("
            "id, submitted_by_athlete, participation_certificate, participation_document, notes, status, submitted_date, "
            "reviewed_date, admin_notes, athlete_id, reviewed_by_id, seminar_id, event_id"
            ") "
            "SELECT id, submitted_by_athlete, participation_certificate, participation_document, notes, status, submitted_date, "
            "reviewed_date, admin_notes, athlete_id, reviewed_by_id, seminar_id, event_id "
            "FROM api_trainingseminarparticipation;"
        )

        cursor.execute("DROP TABLE api_trainingseminarparticipation;")
        cursor.execute("ALTER TABLE api_trainingseminarparticipation_new RENAME TO api_trainingseminarparticipation;")

        cursor.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS "
            "api_trainingseminarparticipation_athlete_event_unique "
            "ON api_trainingseminarparticipation (athlete_id, event_id);"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS api_trainingseminarparticipation_athlete_status_idx "
            "ON api_trainingseminarparticipation (athlete_id, status);"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS api_trainingseminarparticipation_status_submitted_idx "
            "ON api_trainingseminarparticipation (status, submitted_date);"
        )

        cursor.execute("PRAGMA foreign_keys=ON;")


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0065_alter_trainingseminarparticipation_seminar_nullable"),
    ]

    operations = [
        migrations.RunPython(make_seminar_nullable_sqlite, migrations.RunPython.noop),
    ]
