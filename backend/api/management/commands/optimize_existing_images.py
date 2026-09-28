"""Trece imaginile deja incarcate prin aceleasi reguli ca cele noi.

Stocarea optimizeaza de acum incolo, dar nu si ce e deja in Space.
Comanda asta recupereaza diferenta.

Implicit doar RAPORTEAZA. Rescrie fisiere si schimba randuri in baza de
date, iar asta nu e ceva ce vrei sa se intample pentru ca ai apasat sageata
sus in terminal.
"""

from django.apps import apps
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import models

from api.image_optimization import already_optimal, optimize, rule_for


class Command(BaseCommand):
    help = 'Redimensioneaza si recodeaza imaginile deja incarcate.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true',
                            help='Chiar scrie. Fara el, doar raporteaza.')
        parser.add_argument('--limit', type=int, default=0,
                            help='Opreste-te dupa atatea fisiere (pentru o proba).')
        parser.add_argument('--prefix', default='',
                            help='Doar fisierele din folderul asta, ex. club_logos/.')

    def handle(self, *args, **opts):
        apply_changes = opts['apply']
        limit = opts['limit']
        prefix = opts['prefix']

        fields = [
            (model, field)
            for model in apps.get_models()
            for field in model._meta.get_fields()
            if isinstance(field, (models.ImageField, models.FileField))
        ]

        seen = saved_before = saved_after = 0
        skipped = failed = 0

        for model, field in fields:
            for obj in model.objects.exclude(**{field.name: ''}).exclude(**{f'{field.name}__isnull': True}).iterator():
                file = getattr(obj, field.name)
                if not file:
                    continue
                name = file.name
                if prefix and not name.startswith(prefix):
                    continue
                if rule_for(name) is None:
                    continue
                if limit and seen >= limit:
                    break

                seen += 1
                try:
                    file.open('rb')
                    raw = file.read()
                    file.close()
                except Exception as exc:
                    failed += 1
                    self.stderr.write(f'  nu pot citi {name}: {exc}')
                    continue

                original = ContentFile(raw, name=name.rsplit('/', 1)[-1])
                if already_optimal(name, original):
                    skipped += 1
                    continue

                new_name, new_content = optimize(name, original)
                new_bytes = len(new_content.read())
                new_content.seek(0)

                if new_bytes >= len(raw) and new_name == name:
                    skipped += 1
                    continue

                saved_before += len(raw)
                saved_after += new_bytes
                pct = 100 - new_bytes * 100 // max(1, len(raw))
                self.stdout.write(
                    f'  {name}  {len(raw)//1024} KB -> {new_bytes//1024} KB  (-{pct}%)'
                    + ('' if new_name == name else f'  [{new_name.rsplit(".",1)[-1]}]')
                )

                if apply_changes:
                    try:
                        # Salvam sub numele nou si lasam vechiul fisier pe
                        # loc: daca ceva a mers prost, originalul e inca
                        # acolo si randul se poate intoarce.
                        getattr(obj, field.name).save(
                            new_name.rsplit('/', 1)[-1], new_content, save=True,
                        )
                    except Exception as exc:
                        failed += 1
                        self.stderr.write(f'  nu pot salva {name}: {exc}')

        self.stdout.write('')
        self.stdout.write(f'  fisiere examinate: {seen}')
        self.stdout.write(f'  deja optimizate:   {skipped}')
        if failed:
            self.stdout.write(self.style.WARNING(f'  esuate:            {failed}'))
        if saved_before:
            pct = 100 - saved_after * 100 // saved_before
            self.stdout.write(
                f'  de la {saved_before//1024} KB la {saved_after//1024} KB  (-{pct}%)'
            )
        if not apply_changes and saved_before:
            self.stdout.write('')
            self.stdout.write(self.style.WARNING('  Nimic nu a fost scris. Adauga --apply.'))
