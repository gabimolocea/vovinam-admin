"""Seed real videos from the @Vovinam.Romania YouTube channel as Video records.

Populates the ``Video`` records that back the public site's Media page
Video tab (/api/public/videos/) with every video currently posted on the
channel (45 from the /videos tab + 2 from /shorts, 47 total, enumerated via
yt-dlp on 2026-09-13).

Idempotent: matched by ``url`` (the YouTube watch URL); re-running only
creates videos that aren't already present, so it never clobbers title/
description/tagged_athletes/tagged_clubs edits made afterwards in admin.

Usage:
    python manage.py seed_youtube_videos [--dry-run]
"""
import re
import unicodedata
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from landing.models import Video

# (title, YouTube video id), in the channel's own "Latest" order (newest
# first): regular /videos tab (45) then /shorts tab (2, oldest).
VIDEOS = [
    ('🥇 FINALA +92KG! Vlăduț Băcanu vs Ionuț Timofti | MECI EXPLOZIV de Full Contact – Vovinam CN 2026 🇷🇴', 'oxXPi6Qftj8'),
    ('Campionat Național de Vovinam Viet-Vo-Dao 2026 – copii, juniori, seniori', '-XJPwY2LwZs'),
    ('Luptă Full-Contact Seniori -95kg: Vlăduț Băcanu vs Cosmin Ciupu – Vovinam CN 2025 🇷🇴', 'LvA1pPeiJrQ'),
    ('Luptă Full-Contact Seniori -85kg: Razvan Breahna vs George Prisacariu – Vovinam CN 2025 🇷🇴', 'LAiyHSQ-rKs'),
    ('Luptă Full-Contact Seniori -85kg: Razvan Breahna vs Mihai Andrei – Vovinam CN 2025 🇷🇴', 'R4EtQ-h9Fxs'),
    ('Luptă Light-Contact Copii -50kg: Elena Socea vs Pavaluc Denisa – Vovinam CN 2025 🇷🇴', 'WzPUhipWgKA'),
    ('Nhập Môn Quyền: Cezar Niculescu 🥇 – Vovinam CN 2025 🇷🇴', 'r00qJ6JKnS4'),
    ('Luptă Light-Contact Copii -30kg: Patrick Dumitrache vs Ștefan Lupu – Vovinam CN 2025 🇷🇴', 'WKsz0zv0RuQ'),
    ('Tứ tượng côn pháp: Gabriel Popilciuc 🥈 – Vovinam CN 2025 🇷🇴', 'LePa8dA-tLM'),
    ('Song Dao Pháp: Crina Bucuță 🥈 – Vovinam CN 2025 🇷🇴', 'hJ-4kPBwgK8'),
    ('Khởi Quyền: Amalia Lupan 🥉 – Vovinam CN 2025 🇷🇴', 'tsi9tx0Gcqo'),
    ('Long Hổ Quyền: Andrei Mihai 🥈 – Vovinam CN 2025 🇷🇴', 'sRNXCpa29-w'),
    ('Tinh Hoa Lưỡng Nghi Kiếm Pháp: Adrian Teleman 🥈 – Vovinam CN 2025 🇷🇴', 'x_WRuGVLJmw'),
    ('Long Hổ Quyền: Maria Apostol 🥈 – Vovinam CN 2025 🇷🇴', 'ofV0FkExLvg'),
    ('Ngũ Môn Quyền: Gabriel Popilciuc 🥈 – Vovinam CN 2025 🇷🇴', 'ANMATs7lug8'),
    ('Tinh Hoa Lưỡng Nghi Kiếm Pháp: Maria Apostol 🥈 – Vovinam CN 2025 🇷🇴', 'QNiYCUzm1qc'),
    ('Long Hổ Quyền: Ștefan Danschi 🥇 – Vovinam CN 2025 🇷🇴', '_7_Rz6pcQF8'),
    ('Tứ tượng côn pháp: Adrian Teleman 🥇 – Vovinam CN 2025 🇷🇴', '0xf_FMqHUa8'),
    ('Ngũ Môn Quyền: George Prisacariu 🥉 – Vovinam CN 2025 🇷🇴', 'uHe5NNsMg_Y'),
    ('Khởi Quyền: Antonia Zaharia 🥈 – Vovinam CN 2025 🇷🇴', 'MSwnvxgM8mo'),
    ('Long Hổ Quyền: Iulia Pantea 🥉 – Vovinam CN 2025 🇷🇴', 'EqexoAE7NGA'),
    ('Tinh Hoa Lưỡng Nghi Kiếm Pháp: Marian Hriban 🥉 – Vovinam CN 2025 🇷🇴', 'C7W6ZBtVmNc'),
    ('Ngũ Môn Quyền: Gabriel Livadariu 🥇 – Vovinam CN 2025 🇷🇴', 'PBzHHHNlfmM'),
    ('Long Hổ Quyền: Cosmin Ciupu 🥉 – Vovinam CN 2025 🇷🇴', 'UeOvWSEi_eM'),
    ('Tinh Hoa Lưỡng Nghi Kiếm Pháp: Georgiana Ichim 🥇 – Vovinam CN 2025 🇷🇴', 'lsLqN9gD5iE'),
    ('Tinh Hoa Lưỡng Nghi Kiếm Pháp: Crina Bucuță 🥉 – Vovinam CN 2025 🇷🇴', '-6pioq3ryFk'),
    ('Tinh Hoa Lưỡng Nghi Kiếm Pháp: Mihai Livadariu 🥇 – Vovinam CN 2025 🇷🇴', 'tSMvhAw8qv8'),
    ('Long Hổ Quyền: Georgiana Ichim 🥇 – Vovinam CN 2025 🇷🇴', 'Uh15BHex8S8'),
    ('Song Dao Pháp: Georgiana Ichim 🥇 – Vovinam CN 2025 🇷🇴', 'g9hNQ2dG0Vg'),
    ('Khởi Quyền: Anays Rantar 🥇 – Vovinam CN 2025 🇷🇴', 'UpDexHFMQ1M'),
    ('Tứ tượng côn pháp: Marian Hriban 🥉 – Vovinam CN 2025 🇷🇴', 'twlFpaCs0f8'),
    ('Nhập Môn Quyền: Patrick Dumitrache 🥇 – Vovinam CN 2025 🇷🇴', 'eKZYtYw0hoU'),
    ('Nhập Môn Quyền: Theodor Grapinoiu 🥉 – Vovinam CN 2025 🇷🇴', 'pjDXzepVaGc'),
    ('Song Luyện Dao: Gabriel Livadariu & Mihai Livadariu 🥇 – Vovinam CN 2025 🇷🇴', 'ZUi6DEBnSRU'),
    ('Khởi Quyền: David Rusu 🥈 – Vovinam CN 2025 🇷🇴', 'BH3fwLjuDZg'),
    ('Khởi Quyền: Ștefan Davidoaia 🥉 – Vovinam CN 2025 🇷🇴', '8h_i8aTNdRo'),
    ('Khởi Quyền: Bogdan Nastasă 🥇 – Vovinam CN 2025 🇷🇴', '8H1kLxK66KQ'),
    ('Nhập Môn Quyền: Ștefan Lupu 🥈 – Vovinam CN 2025 🇷🇴', '2C3967ujnow'),
    ('Song Luyện Dao: Ștefan Danschi & Mihai Andrei 🥈 – Vovinam CN 2025 🇷🇴', 'kk_dyGFTPS0'),
    ('Song Luyện Ba: Marian Hriban & Răzvan Breahnă 🥉 – Vovinam CN 2025 🇷🇴', '0_Bi6O1B4fI'),
    ('Song Luyện Ba: Ștefan Danschi & Mihai Andrei 🥈 – Vovinam CN 2025 🇷🇴', 'nx9QPCC1YEg'),
    ('Song Luyện Ba: Gabriel Livadariu & Mihai Livadariu 🥇 – Vovinam CN 2025 🇷🇴', 'eDk56jgilQY'),
    ('Luptă Light-Contact Copii -45kg: Ayan Vârghileanu vs Andrei Mititelu', 'jCYzmusq_fs'),
    ('Luptă Full-Contact Seniori -70kg: Marian Hriban vs Stefan Danschi', 'VyjItyKFExM'),
    ('Campionat Național de Vovinam Viet-Vo-Dao, ediția 2025', 'NuUc4q2wQdA'),
    # /shorts tab - older uploads, not on the main /videos tab.
    ('Campionatul Naţional de Vovinam Viet-Vo-Dao, Ariceștii Rahtivani - Prahova 30 Mai 2026', '90T8KyQykyY'),
    ('Vovinam Viet-Vo-Dao Lupta Campionat National 2025 #sports #selfdefense #vovinam #vietvodao', 'ixSEo_TK2Q0'),
]


def make_slug(title, used):
    ascii_title = unicodedata.normalize('NFKD', title).encode('ascii', 'ignore').decode('ascii')
    slug = re.sub(r'[^a-z0-9]+', '-', ascii_title.lower()).strip('-')
    slug = re.sub(r'-{2,}', '-', slug)[:80].strip('-')
    base = slug
    n = 2
    while slug in used:
        slug = f'{base}-{n}'
        n += 1
    used.add(slug)
    return slug


class Command(BaseCommand):
    help = "Seed Video records for every video on the @Vovinam.Romania YouTube channel"

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help="Report what would change without saving")

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        used_slugs = set(Video.objects.values_list('slug', flat=True))
        now = timezone.now()

        created = 0
        skipped = 0
        for i, (title, video_id) in enumerate(VIDEOS):
            url = f'https://www.youtube.com/watch?v={video_id}'
            if Video.objects.filter(url=url).exists():
                skipped += 1
                continue

            slug = make_slug(title, used_slugs)
            created += 1
            if dry_run:
                self.stdout.write(f'Would create: {title} ({url})')
                continue

            Video.objects.create(
                title=title,
                slug=slug,
                url=url,
                published=True,
                featured=(i < 8),
                created_at=now - timedelta(minutes=i),
            )

        verb = 'Would create' if dry_run else 'Created'
        self.stdout.write(self.style.SUCCESS(
            f'{verb} {created} video(s), skipped {skipped} already-present video(s)'
        ))
