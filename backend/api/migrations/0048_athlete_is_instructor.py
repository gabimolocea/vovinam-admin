from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0047_club_public_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='athlete',
            name='is_instructor',
            field=models.BooleanField(default=False, verbose_name='Instructor'),
        ),
    ]
