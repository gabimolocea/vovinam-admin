"""Seed the real F.R.V.V. staff/council members as Athlete records.

Populates the ``Athlete`` records that back the public site's "Staff" page
(/api/public/staff/) with the real people listed on the live vovinam.ro
"Federație > Staff" page: current council members and holders of the
"Maestru al Sportului" title awarded by the Ministry of Sport. Sets grade
(current_grade, matched against the official FRVV grade catalog), federation
role, title, and a real profile photo downloaded from vovinam.ro.

Idempotent: matched by (first_name, last_name); re-running updates rather
than duplicates. Safe to run again after ``sync_default_grades`` if the
grade catalog changes.

Usage:
    python manage.py seed_federation_staff [--dry-run] [--skip-images]
"""
import time

import requests
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand

from api.models import Athlete, Grade
from api.models.titles_roles import FederationRole, Title

# (first_name, last_name, grade_rank_order, federation_role name or None,
#  title name or None, photo URL)
STAFF = [
    (
        "Florin", "Macovei", 20,
        "Președinte F.R.V.V.",
        "Maestru al Sportului, Antrenor emerit",
        "https://vovinam.ro/wp-content/uploads/2024/01/6490bed007537fa44d93fbf6_264885364_1168033580769952_8172522807096897632_n-p-500.jpg",
    ),
    (
        "Angel", "Mititelu", 18,
        "Vicepreședinte F.R.V.V.",
        "Maestru Emerit al Sportului",
        "https://vovinam.ro/wp-content/uploads/2024/01/6490c33b8eb4ec20ff42ecc7_Screenshot-2023-06-20-000540-p-500.png",
    ),
    (
        "Răzvan", "Rusov", 15,
        "Șef Comisie Națională Arbitraj",
        None,
        "https://vovinam.ro/wp-content/uploads/2024/01/6490c0d7cdcb7bd17ac73afc_Screenshot-2023-06-19-235536.png",
    ),
    (
        "Răzvan", "Niculescu", 17,
        "Secretar General",
        "Antrenor emerit",
        "https://vovinam.ro/wp-content/uploads/2024/01/4a10b210-2b29-4b8b-96f7-490150990d2e.jpg",
    ),
    (
        "Lăcrămioara", "Ciobotaru", 17,
        "Membru",
        "Maestru Emerit al Sportului",
        "https://vovinam.ro/wp-content/uploads/2024/01/unnamed-1.jpg",
    ),
    (
        "Vasile", "Ichim", 17,
        None,
        "Maestru Emerit al Sportului",
        "https://vovinam.ro/wp-content/uploads/2024/01/13725002_941052162672589_6861178785701860810_o.jpg",
    ),
    (
        "Geluța", "Ciobotaru", 17,
        None,
        "Maestru Emerit al Sportului",
        "https://vovinam.ro/wp-content/uploads/2024/01/unnamed.jpg",
    ),
    (
        "Adrian", "Teleman", 17,
        None,
        "Maestru Emerit al Sportului",
        "https://vovinam.ro/wp-content/uploads/2024/01/41622073-92dc-4cef-bdaf-1455b91ce0ec.jpg",
    ),
    (
        "Sinodor", "Socea", 17,
        None,
        "Maestru Emerit al Sportului",
        "https://vovinam.ro/wp-content/uploads/2024/01/37e57c5f-3b94-42af-a4af-e7c9e5382058.jpg",
    ),
]


class Command(BaseCommand):
    help = "Populează Athlete cu membrii reali de Staff F.R.V.V. (poze, grade, roluri, titluri)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Nu salvează nimic, doar afișează ce s-ar face.")
        parser.add_argument("--skip-images", action="store_true", help="Nu descarcă pozele de profil.")

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

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        skip_images = options["skip_images"]

        created, updated = 0, 0
        for first_name, last_name, grade_rank, role_name, title_name, photo_url in STAFF:
            grade = Grade.objects.filter(rank_order=grade_rank).first()
            if grade is None:
                self.stderr.write(self.style.WARNING(
                    f"  ! Grad cu rank_order={grade_rank} nu există (rulează sync_default_grades întâi) - sar peste {first_name} {last_name}"
                ))
                continue

            role = None
            if role_name:
                if dry_run:
                    role = FederationRole.objects.filter(name=role_name).first()
                else:
                    role, _ = FederationRole.objects.get_or_create(name=role_name)

            title = None
            if title_name:
                if dry_run:
                    title = Title.objects.filter(name=title_name).first()
                else:
                    title, _ = Title.objects.get_or_create(name=title_name)

            athlete = Athlete.objects.filter(first_name=first_name, last_name=last_name).first()
            action = "actualizat" if athlete else "creat"
            if athlete is None:
                athlete = Athlete(first_name=first_name, last_name=last_name)
                created += 1
            else:
                updated += 1

            athlete.current_grade = grade
            athlete.federation_role = role
            athlete.title = title
            athlete.status = "approved"

            self.stdout.write(f"  - {first_name} {last_name}: grad={grade.name}, rol={role_name}, titlu={title_name} ({action})")

            if dry_run:
                continue

            has_real_photo = bool(athlete.profile_image) and athlete.profile_image.name != "profile_images/default.png"
            if not skip_images and photo_url and not has_real_photo:
                content = self._download(photo_url)
                if content:
                    filename = photo_url.rsplit("/", 1)[-1]
                    athlete.profile_image.save(filename, ContentFile(content), save=False)

            athlete.save()

        if dry_run:
            self.stdout.write(self.style.WARNING("Dry-run: nimic nu a fost salvat."))
        else:
            self.stdout.write(self.style.SUCCESS(f"Gata: {created} sportivi creați, {updated} actualizați."))
