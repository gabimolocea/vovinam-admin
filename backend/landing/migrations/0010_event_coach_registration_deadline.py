from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('landing', '0009_alter_event_description_optional'),
    ]

    operations = [
        migrations.AddField(
            model_name='event',
            name='coach_registration_deadline',
            field=models.DateTimeField(
                blank=True,
                null=True,
                help_text='Deadline until coaches can complete competition centralizer data. Defaults to the event start date when left empty.',
            ),
        ),
    ]
