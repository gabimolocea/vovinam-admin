from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0079_match_final_blue_score_match_final_red_score_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='matchround',
            name='is_extra',
            field=models.BooleanField(default=False, help_text='Adăugată în timpul meciului, peste presetul de reprize.', verbose_name='Repriză suplimentară'),
        ),
    ]
