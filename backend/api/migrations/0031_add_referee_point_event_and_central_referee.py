from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0030_delete_legacy_visas'),
    ]

    operations = [
        migrations.AddField(
            model_name='match',
            name='central_referee',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='central_for_matches', to='api.athlete'),
        ),
        migrations.CreateModel(
            name='RefereePointEvent',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('timestamp', models.DateTimeField(auto_now_add=True)),
                ('side', models.CharField(choices=[('red', 'Red Corner'), ('blue', 'Blue Corner')], max_length=10)),
                ('points', models.IntegerField(default=0)),
                ('event_type', models.CharField(choices=[('score', 'Score'), ('penalty', 'Penalty'), ('deduction', 'Deduction'), ('other', 'Other')], default='score', max_length=20)),
                ('processed', models.BooleanField(db_index=True, default=False)),
                ('external_id', models.CharField(blank=True, max_length=200, null=True)),
                ('metadata', models.JSONField(blank=True, null=True)),
                ('match', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='point_events', to='api.match')),
                ('referee', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='api.athlete')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='api.user')),
            ],
            options={
                'ordering': ['timestamp'],
            },
        ),
    ]
