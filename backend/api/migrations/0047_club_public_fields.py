from django.db import migrations, models
from django.utils.text import slugify


def backfill_club_slugs(apps, schema_editor):
    Club = apps.get_model('api', 'Club')
    seen = set()
    for club in Club.objects.all().order_by('pk'):
        base_slug = slugify(club.name) or 'club'
        slug = base_slug
        counter = 1
        while slug in seen or Club.objects.filter(slug=slug).exclude(pk=club.pk).exists():
            counter += 1
            slug = f'{base_slug}-{counter}'
        seen.add(slug)
        club.slug = slug
        club.save(update_fields=['slug'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0046_athlete_referee_level'),
    ]

    operations = [
        migrations.AddField(
            model_name='club',
            name='slug',
            field=models.SlugField(blank=True, help_text='Generat automat din nume; folosit în URL-ul public al clubului.', max_length=110, null=True, unique=True, verbose_name='Slug'),
        ),
        migrations.AddField(
            model_name='club',
            name='description',
            field=models.TextField(blank=True, help_text='Text afișat pe tab-ul "Info" al paginii publice a clubului.', null=True, verbose_name='Descriere'),
        ),
        migrations.AddField(
            model_name='club',
            name='facebook_url',
            field=models.URLField(blank=True, max_length=200, null=True, verbose_name='Facebook'),
        ),
        migrations.AddField(
            model_name='club',
            name='instagram_url',
            field=models.URLField(blank=True, max_length=200, null=True, verbose_name='Instagram'),
        ),
        migrations.AddField(
            model_name='club',
            name='tiktok_url',
            field=models.URLField(blank=True, max_length=200, null=True, verbose_name='TikTok'),
        ),
        migrations.RunPython(backfill_club_slugs, noop),
    ]
