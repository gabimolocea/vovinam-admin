from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0039_merge_20260606_2216'),
    ]

    operations = [
        migrations.CreateModel(
            name='FightGroupEnrollment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('registered_weight_kg', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('notes', models.CharField(blank=True, max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('athlete', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='fight_group_enrollments', to='api.athlete')),
                ('event', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='fight_group_enrollments', to='api.competition')),
                ('group', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='fight_group_enrollments', to='api.group')),
            ],
            options={
                'verbose_name': 'Fight Group Enrollment',
                'verbose_name_plural': 'Fight Group Enrollments',
                'indexes': [models.Index(fields=['event', 'group'], name='api_fightgr_event_i_eb4365_idx'), models.Index(fields=['athlete'], name='api_fightgr_athlete_8e4255_idx')],
                'unique_together': {('event', 'group', 'athlete')},
            },
        ),
    ]
