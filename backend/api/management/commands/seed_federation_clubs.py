"""Seed the real F.R.V.V. club directory as Club records.

Populates the ``Club`` records that back the public site's "Cluburi" page
(/api/public/clubs/) with the real clubs listed on the live vovinam.ro
"Federație > Cluburi" page: name, city, address, phone, website, logo, and
(where the coach already exists as an ``Athlete``, e.g. seeded by
``seed_federation_staff``/``seed_federation_referees``) links them via the
``coaches`` M2M field.

Idempotent: matched by ``name`` (unique); re-running updates rather than
duplicates. City is get_or_create'd by name.

Usage:
    python manage.py seed_federation_clubs [--dry-run] [--skip-images]
"""
import time
import unicodedata

import requests
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand

from api.models import Athlete, City, Club

# (name, city, address, phone, website, coach_full_name, logo URL or None)
CLUBS = [
    ("Club Sportiv Phuong", "Iași", "Bulevardul Tudor Vladimirescu 57, Iasi, Romania",
     "0745902759", "https://phuong.ro", "Angel Mititelu",
     "https://vovinam.ro/wp-content/uploads/2024/01/6.png"),
    ("Club Sportiv Ronin Ryu", "Bragadiru, Ilfov", "str. Obaie",
     "", "", "Eduard Sersea",
     "https://vovinam.ro/wp-content/uploads/2024/01/4a0342c0-e1e9-41fe-b571-799f8ba3ffe2.jpg"),
    ("Club Sportiv Activ Vo", "Iași", "Bulevardul Tudor Vladimirescu 57, Iasi, Romania",
     "0742214915", "https://activvo.ro", "Vasile Ichim",
     "https://vovinam.ro/wp-content/uploads/2024/01/7.png"),
    ("Club Sportiv Yin", "Ploiești", "Str. Cezar Bolliac",
     "0720297225", "", "Răzvan Niculescu",
     "https://vovinam.ro/wp-content/uploads/2024/01/2.png"),
    ("Club Sportiv Yang", "Ploiești", "",
     "0720297225", "", "Răzvan Niculescu",
     "https://vovinam.ro/wp-content/uploads/2024/01/3.png"),
    ("Club Sportiv Dicomes", "Bacău", "Mihai Viteazul nr.2",
     "40755388085", "", "Marian Hriban",
     "https://vovinam.ro/wp-content/uploads/2024/01/8.png"),
    ("Academia de Arte Marțiale Socea", "Bacău", "Str. Mihai Viteazul nr. 2",
     "0743218499", "", "Sinodor Socea",
     "https://vovinam.ro/wp-content/uploads/2024/01/9.png"),
    ("Club Sportiv Blue Kiem", "Iași", "Bulevardul Tudor Vladimirescu 57, Iasi, Romania",
     "0770312724", "", "Adrian Teleman",
     "https://vovinam.ro/wp-content/uploads/2024/01/4.png"),
    ("Club Sportiv Best", "Iași", "Bulevardul Tudor Vladimirescu 57, Iasi, Romania",
     "0770312724", "", "Răzvan Rusov",
     "https://vovinam.ro/wp-content/uploads/2024/03/descarcare.jpg"),
    ("Club Sportiv Ho Trang", "Iași", "Scoala Petru Poni, Pacurari, Iasi, Romania",
     "0748503619", "", "Gabriel Popilciuc",
     "https://vovinam.ro/wp-content/uploads/2026/05/011d8675-d7d3-4284-bb60-c749552a7d6c.jpeg"),
    ("Club Sportiv Regnum", "Ploiești", "Strada Tudor Vladimirescu, nr.7, Aricestii Rahtivani, Prahova",
     "0720390209", "https://www.csregnum.ro/", "Vlăduț Băcanu",
     "https://vovinam.ro/wp-content/uploads/2024/01/1.png"),
    ("Club Sportiv Thieu Lam", "Iași", 'Sala de sport a scolii gimnaziale "Profesor Mihai Dumitriu" - Valea Lupului',
     "0743765257", "", "Geluța Ciobotaru",
     "https://vovinam.ro/wp-content/uploads/2024/01/5.png"),
]


def _strip_diacritics(text):
    normalized = unicodedata.normalize("NFKD", text)
    return "".join(c for c in normalized if not unicodedata.combining(c)).lower()


class Command(BaseCommand):
    help = "Populează Club cu cluburile reale F.R.V.V. (nume, oraș, adresă, siglă, antrenor)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Nu salvează nimic, doar afișează ce s-ar face.")
        parser.add_argument("--skip-images", action="store_true", help="Nu descarcă siglele.")

    def _download(self, url, retries=2):
        for attempt in range(retries + 1):
            try:
                resp = requests.get(url, timeout=30)
                if resp.status_code == 200:
                    return resp.content
            except requests.RequestException as exc:
                if attempt == retries:
                    self.stderr.write(self.style.WARNING(f"    ! Nu am putut descărca {url}: {exc}"))
                    return None
            time.sleep(1)
        return None

    def _find_coach(self, full_name):
        target = _strip_diacritics(full_name)
        for athlete in Athlete.objects.all():
            candidate = _strip_diacritics(f"{athlete.first_name} {athlete.last_name}")
            if candidate == target:
                return athlete
        return None

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        skip_images = options["skip_images"]

        created, updated = 0, 0
        for name, city_name, address, phone, website, coach_name, logo_url in CLUBS:
            club = Club.objects.filter(name=name).first()
            action = "actualizat" if club else "creat"
            if club is None:
                club = Club(name=name)
                created += 1
            else:
                updated += 1

            city = None
            if city_name and not dry_run:
                city, _ = City.objects.get_or_create(name=city_name)

            club.address = address
            club.mobile_number = phone
            club.website = website

            coach = self._find_coach(coach_name)
            coach_note = coach.__str__() if coach else f"NEGĂSIT ({coach_name})"
            self.stdout.write(f"  - {name}: oraș={city_name}, antrenor={coach_note} ({action})")

            if dry_run:
                continue

            club.city = city
            club.save()

            if coach:
                club.coaches.set([coach])

            has_real_logo = bool(club.logo) and club.logo.name
            if not skip_images and logo_url and not has_real_logo:
                content = self._download(logo_url)
                if content:
                    filename = logo_url.rsplit("/", 1)[-1]
                    club.logo.save(filename, ContentFile(content), save=True)

        if dry_run:
            self.stdout.write(self.style.WARNING("Dry-run: nimic nu a fost salvat."))
        else:
            self.stdout.write(self.style.SUCCESS(f"Gata: {created} cluburi create, {updated} actualizate."))
