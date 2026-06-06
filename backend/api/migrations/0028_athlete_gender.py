from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0027_alter_diplomatemplate_options_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='athlete',
            name='gender',
            field=models.CharField(blank=True, choices=[('male', 'Male'), ('female', 'Female')], max_length=20, null=True),
        ),
    ]