"""Seed the real F.R.V.V. referee directory as Athlete records.

Populates the ``Athlete`` records that back the public site's "Arbitri" page
(/api/public/referees/) with the real people listed on the live vovinam.ro
"Federație > Arbitri" page: international referees and national referees.
Sets grade (current_grade, matched against the official FRVV grade catalog),
is_referee=True, referee_level ('international'/'national'), and a real
profile photo downloaded from vovinam.ro where available.

Several people (e.g. Florin Macovei, Angel Mititelu) are shared with the
Staff seed (``seed_federation_staff``) - this command only touches the
referee-specific fields and does not overwrite federation_role/title set by
that command, so run order between the two doesn't matter.

Idempotent: matched by (first_name, last_name); re-running updates rather
than duplicates.

Usage:
    python manage.py seed_federation_referees [--dry-run] [--skip-images]
"""
import time

import requests
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand

from api.models import Athlete, Grade

# (first_name, last_name, grade_rank_order, referee_level, photo URL or None)
REFEREES = [
    # Arbitri internaționali
    ("Florin", "Macovei", 20, "international",
     "https://vovinam.ro/wp-content/uploads/2024/01/6490bed007537fa44d93fbf6_264885364_1168033580769952_8172522807096897632_n-p-500.jpg"),
    ("Angel", "Mititelu", 18, "international",
     "https://vovinam.ro/wp-content/uploads/2024/01/6490c33b8eb4ec20ff42ecc7_Screenshot-2023-06-20-000540-p-500.png"),
    ("Răzvan", "Rusov", 15, "international",
     "https://vovinam.ro/wp-content/uploads/2024/01/6490c0d7cdcb7bd17ac73afc_Screenshot-2023-06-19-235536.png"),
    ("Vasile", "Ichim", 17, "international",
     "https://vovinam.ro/wp-content/uploads/2024/01/13725002_941052162672589_6861178785701860810_o.jpg"),
    ("Geluța", "Ciobotaru", 17, "international",
     "https://vovinam.ro/wp-content/uploads/2024/01/unnamed.jpg"),
    ("Lăcrămioara", "Ciobotaru", 17, "international",
     "https://vovinam.ro/wp-content/uploads/2024/01/unnamed-1.jpg"),
    ("Adrian", "Teleman", 17, "international",
     "https://vovinam.ro/wp-content/uploads/2024/01/41622073-92dc-4cef-bdaf-1455b91ce0ec.jpg"),
    ("Sinodor", "Socea", 17, "international",
     "https://vovinam.ro/wp-content/uploads/2024/01/37e57c5f-3b94-42af-a4af-e7c9e5382058.jpg"),
    # Arbitri naționali
    ("Răzvan", "Niculescu", 17, "national",
     "https://vovinam.ro/wp-content/uploads/2024/01/4a10b210-2b29-4b8b-96f7-490150990d2e.jpg"),
    ("Gabriel", "Molocea", 16, "national",
     "https://vovinam.ro/wp-content/uploads/2024/01/6496230d6cd6457baf9bf924_Layer-1.png"),
    ("Gabriel", "Popilciuc", 16, "national",
     "https://vovinam.ro/wp-content/uploads/2024/01/Screenshot-2024-01-18-223744.png"),
    ("Marian", "Hriban", 14, "national", None),
    ("George", "Prisacariu", 14, "national",
     "https://vovinam.ro/wp-content/uploads/2024/03/60360be0-e94b-4da9-adb7-3cfc8d5cd9f5.jpg"),
    ("Robert", "Tomulescu", 14, "national",
     "https://vovinam.ro/wp-content/uploads/2024/03/IMG-20240302-WA0015.jpg"),
    ("Vlăduț", "Băcanu", 13, "national",
     "https://vovinam.ro/wp-content/uploads/2024/01/06bdfd40-c546-4c5a-98ed-dc9b1070fad6.jpg"),
    ("Ștefan", "Zaharescu", 13, "national",
     "https://vovinam.ro/wp-content/uploads/2024/03/IMG-20240302-WA0019.jpg"),
]


class Command(BaseCommand):
    help = "Populează Athlete cu arbitrii reali F.R.V.V. (internaționali/naționali), poze și grade."

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
        for first_name, last_name, grade_rank, referee_level, photo_url in REFEREES:
            grade = Grade.objects.filter(rank_order=grade_rank).first()
            if grade is None:
                self.stderr.write(self.style.WARNING(
                    f"  ! Grad cu rank_order={grade_rank} nu există (rulează sync_default_grades întâi) - sar peste {first_name} {last_name}"
                ))
                continue

            athlete = Athlete.objects.filter(first_name=first_name, last_name=last_name).first()
            action = "actualizat" if athlete else "creat"
            if athlete is None:
                athlete = Athlete(first_name=first_name, last_name=last_name)
                created += 1
            else:
                updated += 1

            athlete.current_grade = grade
            athlete.is_referee = True
            athlete.referee_level = referee_level
            athlete.status = "approved"

            self.stdout.write(f"  - {first_name} {last_name}: grad={grade.name}, nivel={referee_level} ({action})")

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
