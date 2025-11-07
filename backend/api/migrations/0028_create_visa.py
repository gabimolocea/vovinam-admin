from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0027_rename_eventproxy'),
    ]

    operations = [
        migrations.CreateModel(
            name='Visa',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('visa_type', models.CharField(choices=[('medical', 'Medical'), ('annual', 'Annual')], max_length=10)),
                ('issued_date', models.DateField(blank=True, null=True)),
                ('document', models.FileField(blank=True, null=True, upload_to='visa_documents/')),
                ('image', models.ImageField(blank=True, null=True, upload_to='visa_images/')),
                ('notes', models.TextField(blank=True, null=True)),
                ('health_status', models.CharField(blank=True, null=True, choices=[('approved', 'Approved'), ('denied', 'Denied')], max_length=10)),
                ('visa_status', models.CharField(blank=True, null=True, max_length=15)),
                ('status', models.CharField(choices=[('pending', 'Pending Approval'), ('approved', 'Approved'), ('rejected', 'Rejected'), ('revision_required', 'Revision Required')], default='approved', max_length=20)),
                ('submitted_date', models.DateTimeField(auto_now_add=True)),
                ('reviewed_date', models.DateTimeField(blank=True, null=True)),
                ('admin_notes', models.TextField(blank=True, null=True)),
                ('athlete', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='visas', to='api.athlete')),
                ('reviewed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reviewed_visas', to='api.user')),
            ],
            options={
                'verbose_name': 'Visa',
                'verbose_name_plural': 'Visas',
            },
        ),
    ]
