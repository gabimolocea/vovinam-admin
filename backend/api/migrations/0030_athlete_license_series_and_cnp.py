from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0029_externalapiclient'),
    ]

    operations = [
        migrations.AddField(
            model_name='athlete',
            name='cnp',
            field=models.CharField(blank=True, max_length=13, null=True),
        ),
        migrations.AddField(
            model_name='athlete',
            name='license_series',
            field=models.CharField(blank=True, max_length=50, null=True),
        ),
    ]