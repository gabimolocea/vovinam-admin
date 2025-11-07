from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0029_migrate_visas_data'),
    ]

    operations = [
        migrations.DeleteModel(
            name='MedicalVisa',
        ),
        migrations.DeleteModel(
            name='AnnualVisa',
        ),
    ]
