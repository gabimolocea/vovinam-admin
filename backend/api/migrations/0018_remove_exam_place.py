from django.db import migrations

class Migration(migrations.Migration):

    dependencies = [
        ('api', '0017_remove_technical_director_and_president'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='gradehistory',
            name='exam_place',
        ),
    ]
