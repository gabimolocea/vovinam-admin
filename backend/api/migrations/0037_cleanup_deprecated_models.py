# Manual migration to remove Competition and TrainingSeminar models
# Generated manually after model code cleanup

import django.db.models.deletion
from django.db import migrations, models


def drop_deprecated_tables_and_fields(apps, schema_editor):
    """
    Drop deprecated tables and fields using raw SQL to avoid Django's complex field removal logic
    """
    with schema_editor.connection.cursor() as cursor:
        # Null out seminar FK in TrainingSeminarParticipation
        try:
            cursor.execute("UPDATE api_trainingseminarparticipation SET seminar_id = NULL WHERE seminar_id IS NOT NULL")
            print(f"Nulled out seminar_id for {cursor.rowcount} rows")
        except Exception as e:
            print(f"Could not null seminar_id: {e}")
        
        # Drop the deprecated tables
        for table in ['api_competition', 'api_trainingseminar']:
            try:
                cursor.execute(f"DROP TABLE IF EXISTS {table}")
                print(f"Dropped table {table}")
            except Exception as e:
                print(f"Could not drop {table}: {e}")


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0036_remove_match_winner_remove_team_name_and_more'),
    ]

    operations = [
        # Use raw SQL to clean up without Django's complex field removal logic
        migrations.RunPython(
            drop_deprecated_tables_and_fields,
            reverse_code=migrations.RunPython.noop,
        ),
        
        # Now update Django state to reflect the removed models and fields
        migrations.SeparateDatabaseAndState(
            state_operations=[
                # Remove constraint from state
                migrations.RemoveConstraint(
                    model_name='group',
                    name='unique_group_per_competition',
                ),
                # Remove fields from state
                migrations.RemoveField(
                    model_name='athletematch',
                    name='competition',
                ),
                migrations.RemoveField(
                    model_name='category',
                    name='competition',
                ),
                migrations.RemoveField(
                    model_name='group',
                    name='competition',
                ),
                migrations.RemoveField(
                    model_name='notification',
                    name='related_competition',
                ),
                migrations.RemoveField(
                    model_name='trainingseminarparticipation',
                    name='seminar',
                ),
                migrations.RemoveField(
                    model_name='trainingseminar',
                    name='athletes',
                ),
                # Delete models from state
                migrations.DeleteModel(
                    name='Competition',
                ),
                migrations.DeleteModel(
                    name='TrainingSeminar',
                ),
            ],
            database_operations=[
                # Database operations already done in RunPython above
            ],
        ),
    ]
