from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0066_fix_trainingseminarparticipation_seminar_nullable_sqlite"),
    ]

    operations = [
        migrations.AlterField(
            model_name="category",
            name="event",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="categories",
                to="landing.event",
            ),
        ),
        migrations.AlterField(
            model_name="trainingseminarparticipation",
            name="event",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="seminar_participations",
                to="landing.event",
            ),
        ),
    ]
