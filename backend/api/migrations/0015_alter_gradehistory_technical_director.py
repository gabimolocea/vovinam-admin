from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0014_remove_frontendtheme'),
    ]

    operations = [
        # Some existing rows have free-text technical_director values (e.g. 'Florin').
        # Clear those values before converting the column to a ForeignKey to avoid
        # integrity errors. We intentionally set them to NULL; data can be reconciled
        # manually or via a separate migration if desired.
        migrations.RunSQL(
            sql="UPDATE api_gradehistory SET technical_director = NULL WHERE technical_director IS NOT NULL;",
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.AlterField(
            model_name='gradehistory',
            name='technical_director',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='grades_as_technical_director', to='api.athlete'),
        ),
    ]
