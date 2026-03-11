from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('landing', '0012_event_sync_history_fields'),
        ('api', '0023_refereepresence'),
    ]

    operations = [
        migrations.CreateModel(
            name='DiplomaTemplate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=120)),
                ('template_kind', models.CharField(choices=[('first_place', 'Locul 1'), ('second_place', 'Locul 2'), ('third_place', 'Locul 3'), ('participation', 'Participare')], max_length=20)),
                ('pdf_file', models.FileField(upload_to='diploma_templates/')),
                ('preview_orientation', models.CharField(choices=[('landscape', 'Landscape'), ('portrait', 'Portrait')], default='landscape', max_length=12)),
                ('placements', models.JSONField(blank=True, default=list, help_text='Listă de câmpuri poziționate pe diploma PDF.')),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('event', models.ForeignKey(on_delete=models.CASCADE, related_name='diploma_templates', to='landing.event')),
            ],
            options={
                'ordering': ['event_id', 'template_kind', 'id'],
                'unique_together': {('event', 'template_kind')},
            },
        ),
    ]