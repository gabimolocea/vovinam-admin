from django.db import migrations, models
from django.utils import timezone

# Cati arbitri cerea regula VECHE ca o faza sa conteze. Meciurile incheiate
# inainte de schimbare au fost anuntate in sala dupa numarul asta.
PRAG_VECHI = 2


def ingheata_meciurile_incheiate(apps, schema_editor):
    """Scrie rezultatul meciurilor deja incheiate, asa cum a fost anuntat.

    Regula s-a schimbat de la doi arbitri pe faza la trei. Scorul se numara de
    fiecare data din apasari, deci fara pasul asta toate meciurile trecute ar
    fi inceput sa arate alt rezultat decat cel anuntat atunci - si nimeni n-ar
    fi stiut de ce.
    """
    from api.views._common import aggregate_validated_point_phases
    Match = apps.get_model('api', 'Match')
    RefereePointEvent = apps.get_model('api', 'RefereePointEvent')
    acum = timezone.now()
    for m in Match.objects.filter(status='completed', scores_frozen_at__isnull=True):
        evenimente = list(RefereePointEvent.objects.filter(match_id=m.pk).order_by('timestamp', 'id'))
        rosu, albastru = aggregate_validated_point_phases(evenimente, prag=PRAG_VECHI)
        m.final_red_score = rosu
        m.final_blue_score = albastru
        m.scores_frozen_at = acum
        m.save(update_fields=['final_red_score', 'final_blue_score', 'scores_frozen_at'])


def dezgheata(apps, schema_editor):
    """Nimic: campurile dispar odata cu migrarea inapoi."""


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0078_refereeqrlogin_expires_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='match',
            name='final_blue_score',
            field=models.IntegerField(blank=True, null=True, verbose_name='Scor final colț albastru'),
        ),
        migrations.AddField(
            model_name='match',
            name='final_red_score',
            field=models.IntegerField(blank=True, null=True, verbose_name='Scor final colț roșu'),
        ),
        migrations.AddField(
            model_name='match',
            name='scores_frozen_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Scor înghețat la'),
        ),
        migrations.RunPython(ingheata_meciurile_incheiate, dezgheata),
    ]
