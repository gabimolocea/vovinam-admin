# Generated migration for test compatibility fixes

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0033_alter_refereepointevent_metadata'),
    ]

    operations = [
        migrations.AlterField(
            model_name='athlete',
            name='date_of_birth',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='category',
            name='competition',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='categories', to='api.competition'),
        ),
    ]
