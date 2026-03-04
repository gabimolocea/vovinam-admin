# Split migration: adds landing.Event FK fields and Event proxy model
# These were extracted from 0001_initial to break circular dependency
# (landing.0001 depends on api for City, api depends on landing for Event)
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0001_initial'),
        ('landing', '0001_initial'),
    ]

    operations = [
        # Event proxy model
        migrations.CreateModel(
            name='Event',
            fields=[],
            options={
                'verbose_name': 'Event',
                'verbose_name_plural': 'Events',
                'proxy': True,
                'indexes': [],
                'constraints': [],
            },
            bases=('landing.event',),
        ),
        # Category.event
        migrations.AddField(
            model_name='category',
            name='event',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='categories',
                to='landing.event',
            ),
        ),
        # AthleteMatch.event
        migrations.AddField(
            model_name='athletematch',
            name='event',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='athlete_matches',
                to='landing.event',
            ),
        ),
        # CompetitionField.event
        migrations.AddField(
            model_name='competitionfield',
            name='event',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='fields',
                to='landing.event',
                help_text='The event this field belongs to',
            ),
        ),
        # GradeHistory.event
        migrations.AddField(
            model_name='gradehistory',
            name='event',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='grade_histories',
                to='landing.event',
                help_text='Optional event associated with this grade exam',
            ),
        ),
        # Group.event
        migrations.AddField(
            model_name='group',
            name='event',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='groups',
                to='landing.event',
            ),
        ),
        # Restore Group ordering now that event field exists
        migrations.AlterModelOptions(
            name='group',
            options={'ordering': ['event', '-birth_year_end', 'name']},
        ),
        # TrainingSeminarParticipation.event
        migrations.AddField(
            model_name='trainingseminarparticipation',
            name='event',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='seminar_participations',
                to='landing.event',
                help_text='Event this athlete participated in',
            ),
        ),
        # TrainingSeminarParticipation.seminar
        migrations.AddField(
            model_name='trainingseminarparticipation',
            name='seminar',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='legacy_participations',
                to='landing.event',
            ),
        ),
        # Constraints & indexes that reference 'event' field
        migrations.AlterUniqueTogether(
            name='competitionfield',
            unique_together={('event', 'field_number')},
        ),
        migrations.AddConstraint(
            model_name='group',
            constraint=models.UniqueConstraint(
                condition=models.Q(('event__isnull', False)),
                fields=('event', 'name'),
                name='unique_group_per_event',
            ),
        ),
        migrations.AddIndex(
            model_name='category',
            index=models.Index(fields=['event'], name='api_categor_event_i_67e574_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='trainingseminarparticipation',
            unique_together={('athlete', 'event')},
        ),
    ]
