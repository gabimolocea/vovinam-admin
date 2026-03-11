from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0024_diplomatemplate'),
    ]

    operations = [
        migrations.AddField(
            model_name='diplomatemplate',
            name='category_scope',
            field=models.CharField(
                choices=[
                    ('all', 'Toate categoriile'),
                    ('solo', 'Solo'),
                    ('team', 'Echipă'),
                    ('fight', 'Luptă'),
                ],
                default='all',
                max_length=12,
            ),
        ),
        migrations.AlterUniqueTogether(
            name='diplomatemplate',
            unique_together={('event', 'template_kind', 'category_scope')},
        ),
    ]