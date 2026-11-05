from django.core.management.base import BaseCommand

from landing.auto_tagging import auto_tag_post, build_index
from landing.models import NewsPost


class Command(BaseCommand):
    help = 'Tags the athletes and clubs named in published articles (see landing/auto_tagging.py).'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Only report what would be tagged.')

    def handle(self, *args, **options):
        from landing.auto_tagging import auto_tag_html

        index = build_index()
        total = 0
        for post in NewsPost.objects.filter(published=True).order_by('-created_at'):
            if options['dry_run']:
                new_content, athlete_ids, club_ids = auto_tag_html(post.content, index)
                already = set(post.tagged_athletes.values_list('id', flat=True))
                added = sorted(set(athlete_ids) - already)
                changed = new_content != post.content
                if added or changed:
                    self.stdout.write(f'{post.slug}: sportivi noi {added}, cluburi legate {sorted(club_ids)}, text modificat {changed}')
                    total += 1
                continue
            tagged = auto_tag_post(post, index)
            if tagged:
                total += 1
                names = ', '.join(f'{a.first_name} {a.last_name}' for a in tagged)
                self.stdout.write(f'{post.slug}: {names}')
        self.stdout.write(self.style.SUCCESS(f'Articole cu etichete noi: {total}'))
