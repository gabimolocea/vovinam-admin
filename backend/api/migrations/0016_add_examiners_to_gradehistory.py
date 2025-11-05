from django.db import migrations, models
import django.db.models.deletion


def copy_technical_director_to_examiner1(apps, schema_editor):
    GradeHistory = apps.get_model('api', 'GradeHistory')
    for gh in GradeHistory.objects.all():
        td_id = getattr(gh, 'technical_director_id', None)
        if td_id:
            # set examiner_1 to the previous technical_director value
            gh.examiner_1_id = td_id
            gh.save(update_fields=['examiner_1'])


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0015_alter_gradehistory_technical_director'),
    ]

    operations = [
        migrations.AddField(
            model_name='gradehistory',
            name='examiner_1',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='grades_as_examiner1', to='api.athlete'),
        ),
        migrations.AddField(
            model_name='gradehistory',
            name='examiner_2',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='grades_as_examiner2', to='api.athlete'),
        ),
        migrations.RunPython(copy_technical_director_to_examiner1, reverse_code=migrations.RunPython.noop),
    ]
