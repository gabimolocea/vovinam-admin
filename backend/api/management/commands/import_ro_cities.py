from django.core.management.base import BaseCommand
from django.db import transaction
from api.models import City
import urllib.request
import csv
import ssl
import zipfile
from io import BytesIO


GEONAMES_RO_URL = "https://download.geonames.org/export/dump/RO.zip"
GEONAMES_ADMIN1_URL = "https://download.geonames.org/export/dump/admin1CodesASCII.txt"


class Command(BaseCommand):
    help = "Import Romania cities/localities from GeoNames (RO.txt)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Limit number of rows for testing (0 = no limit).",
        )

    def handle(self, *args, **options):
        limit = options.get("limit") or 0
        self.stdout.write("Downloading GeoNames RO.txt...")

        try:
            try:
                with urllib.request.urlopen(GEONAMES_RO_URL) as response:
                    data = response.read()
            except Exception:
                context = ssl._create_unverified_context()
                with urllib.request.urlopen(GEONAMES_RO_URL, context=context) as response:
                    data = response.read()
        except Exception as exc:
            self.stderr.write(self.style.ERROR(f"Failed to download: {exc}"))
            return

        try:
            with zipfile.ZipFile(BytesIO(data)) as zf:
                with zf.open("RO.txt") as fh:
                    text = fh.read().decode("utf-8")
        except Exception as exc:
            self.stderr.write(self.style.ERROR(f"Failed to read RO.txt: {exc}"))
            return

        # Load admin1 (county) codes for Romania
        self.stdout.write("Downloading admin1 codes...")
        try:
            try:
                with urllib.request.urlopen(GEONAMES_ADMIN1_URL) as response:
                    admin1_text = response.read().decode("utf-8")
            except Exception:
                context = ssl._create_unverified_context()
                with urllib.request.urlopen(GEONAMES_ADMIN1_URL, context=context) as response:
                    admin1_text = response.read().decode("utf-8")
        except Exception as exc:
            self.stderr.write(self.style.ERROR(f"Failed to download admin1 codes: {exc}"))
            return

        admin1_map = {}
        for row in csv.reader(admin1_text.splitlines(), delimiter="\t"):
            if not row or len(row) < 2:
                continue
            code = row[0].strip()  # e.g. RO.10
            name = row[1].strip()
            if code.startswith("RO."):
                admin1_map[code] = name

        reader = csv.reader(text.splitlines(), delimiter="\t")
        cities_to_create = []
        updated = 0
        seen = set()
        count = 0

        for row in reader:
            if not row or len(row) < 8:
                continue
            name = row[1].strip()
            feature_class = row[6].strip()
            country_code = row[8].strip() if len(row) > 8 else ""
            admin1_code = row[10].strip() if len(row) > 10 else ""

            if country_code != "RO":
                continue
            # Keep populated places only
            if feature_class != "P":
                continue
            if not name or name in seen:
                continue

            admin1_name = admin1_map.get(f"RO.{admin1_code}") if admin1_code else None
            display_name = name
            if admin1_name and admin1_name.lower() != name.lower():
                display_name = f"{name}, {admin1_name}"

            seen.add(name)
            # Update existing entries (by original name) if needed, otherwise create
            existing = City.objects.filter(name=name).first()
            if existing:
                if existing.name != display_name and not City.objects.filter(name=display_name).exists():
                    existing.name = display_name
                    existing.save(update_fields=["name"])
                    updated += 1
            else:
                if not City.objects.filter(name=display_name).exists():
                    cities_to_create.append(City(name=display_name))
            count += 1
            if limit and count >= limit:
                break

        if not cities_to_create and not updated:
            self.stdout.write(self.style.WARNING("No cities to import or update."))
            return

        with transaction.atomic():
            City.objects.bulk_create(cities_to_create, ignore_conflicts=True)

        self.stdout.write(self.style.SUCCESS(f"Imported {len(cities_to_create)} cities; updated {updated}."))
