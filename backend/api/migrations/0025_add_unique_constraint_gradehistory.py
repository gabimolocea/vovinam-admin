from django.db import migrations, models


def forwards_dedupe(apps, schema_editor):
    GradeHistory = apps.get_model('api', 'GradeHistory')
    from django.db import transaction

    # For each (athlete, grade) pair, prefer any approved submission; otherwise
    # keep the oldest submission (by submitted_date or pk). Delete the rest.
    with transaction.atomic():
        qs = GradeHistory.objects.values('athlete_id', 'grade_id')
        seen = set()
        # Collect duplicates by grouping
        pairs = set((r['athlete_id'], r['grade_id']) for r in qs)
        for athlete_id, grade_id in pairs:
            entries = list(GradeHistory.objects.filter(athlete_id=athlete_id, grade_id=grade_id).order_by('submitted_date', 'pk'))
            if len(entries) > 1:
                # Try to find approved entries first
                approved = [e for e in entries if getattr(e, 'status', None) == 'approved']
                if approved:
                    # keep the earliest approved, delete all others
                    keep = approved[0]
                else:
                    # no approved entries, keep the earliest overall
                    keep = entries[0]
                for e in entries:
                    if e.pk != keep.pk:
                        e.delete()


def reverse_noop(apps, schema_editor):
    # Removing the uniqueness constraint is reversible; we don't restore deleted rows here.
    return


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0024_remove_trainingseminar_and_seminar_field'),
    ]

    operations = [
        migrations.RunPython(forwards_dedupe, reverse_noop),
        migrations.AddConstraint(
            model_name='gradehistory',
            constraint=models.UniqueConstraint(fields=['athlete', 'grade'], name='unique_athlete_grade'),
        ),
    ]
