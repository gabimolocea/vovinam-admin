from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0045_add_age_range_to_groups'),
    ]

    operations = [
        migrations.RunSQL(
            sql=[
                "PRAGMA foreign_keys=off;",
                "CREATE TABLE \"api_group_new\" (\"id\" integer NOT NULL PRIMARY KEY AUTOINCREMENT, \"name\" varchar(100) NOT NULL, \"event_id\" BIGINT NULL REFERENCES \"landing_event\" (\"id\") DEFERRABLE INITIALLY DEFERRED, \"birth_year_end\" integer NULL, \"birth_year_start\" integer NULL);",
                "INSERT INTO \"api_group_new\" (\"id\", \"name\", \"event_id\", \"birth_year_end\", \"birth_year_start\") SELECT \"id\", \"name\", \"event_id\", \"birth_year_end\", \"birth_year_start\" FROM \"api_group\";",
                "DROP TABLE \"api_group\";",
                "ALTER TABLE \"api_group_new\" RENAME TO \"api_group\";",
                "CREATE UNIQUE INDEX \"unique_group_per_event\" ON \"api_group\" (\"event_id\", \"name\") WHERE \"event_id\" IS NOT NULL;",
                "PRAGMA foreign_keys=on;",
            ],
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
