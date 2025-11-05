from django.db import migrations

class Migration(migrations.Migration):

    dependencies = [
        ('api', '0016_add_examiners_to_gradehistory'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='gradehistory',
            name='technical_director',
        ),
        migrations.RemoveField(
            model_name='gradehistory',
            name='president',
        ),
    ]
