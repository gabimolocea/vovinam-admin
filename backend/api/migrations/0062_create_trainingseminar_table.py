from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0061_remove_video_title_notes'),
    ]

    operations = [
        migrations.RunSQL(
            sql=(
                "CREATE TABLE IF NOT EXISTS api_trainingseminar ("
                "id INTEGER PRIMARY KEY AUTOINCREMENT,"
                "name VARCHAR(100) NOT NULL,"
                "start_date DATE NULL,"
                "end_date DATE NULL,"
                "place VARCHAR(100) NOT NULL"
                ");"
                "CREATE TABLE IF NOT EXISTS api_trainingseminar_athletes ("
                "id INTEGER PRIMARY KEY AUTOINCREMENT,"
                "trainingseminar_id INTEGER NOT NULL,"
                "athlete_id INTEGER NOT NULL,"
                "UNIQUE(trainingseminar_id, athlete_id)"
                ");"
            ),
            reverse_sql=(
                "DROP TABLE IF EXISTS api_trainingseminar_athletes;"
                "DROP TABLE IF EXISTS api_trainingseminar;"
            ),
        ),
    ]
