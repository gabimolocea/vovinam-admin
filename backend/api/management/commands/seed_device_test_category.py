"""Creează o categorie de tehnică de test, pentru probarea dispozitivului
de arbitraj (devices/referee-esp32c3) sau a aplicației de pe telefon.

Nu creează sportivi: îi folosește pe cei care există deja pe serverul
local. Sportivii creați pe mașina din sală primesc chei primare care în
cloud aparțin altor persoane - exact motivul pentru care API-ul refuză
crearea lor aici. Categoria în sine e tot o înregistrare nouă, așa că e
făcută ca să fie ștearsă: `--remove` o scoate complet.

    python manage.py seed_device_test_category --event 21
    python manage.py seed_device_test_category --event 21 --fill-referees
    python manage.py seed_device_test_category --event 21 --remove
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.models import (
    Athlete,
    Category,
    CategoryAthlete,
    CategoryFieldAssignment,
    CategoryRefereeAssignment,
    CompetitionField,
    Group,
    RefereeQRLogin,
    SoloCategory,
)
from landing.models import Event


CATEGORY_NAME = 'TEST DISPOZITIV'

# Arbitrii inventati pentru probe poarta numele asta, ca sa se vada in
# orice listă că nu sunt oameni reali și ca `--remove` să îi găsească
# fără să ghicească.
TEST_REFEREE_FIRST_NAME = 'Arbitru'
TEST_REFEREE_LAST_PREFIX = 'Test '


class Command(BaseCommand):
    help = 'Categorie de tehnică de test, cu sportivi înscriși și un arbitru alocat.'

    def add_arguments(self, parser):
        parser.add_argument('--event', type=int, required=True, help='ID-ul competiției.')
        parser.add_argument('--remove', action='store_true', help='Șterge categoria de test și arbitrii inventați.')
        parser.add_argument(
            '--fill-referees', action='store_true',
            help='Completează pozițiile A2–A5 libere cu arbitri de test și le afișează PIN-urile.',
        )
        parser.add_argument(
            '--referee', type=int, default=None,
            help='ID-ul sportivului-arbitru care va nota. Implicit, primul arbitru găsit.',
        )

    def handle(self, *args, **options):
        event_id = options['event']
        try:
            event = Event.objects.get(pk=event_id)
        except Event.DoesNotExist:
            raise CommandError(f'Nu există competiția {event_id}.')

        if options['remove']:
            return self._remove(event)
        if options['fill_referees']:
            return self._fill_referees(event)
        return self._create(event, options['referee'])

    def _remove(self, event):
        categories = Category.objects.filter(event=event, name=CATEGORY_NAME)
        if not categories.exists():
            self.stdout.write(f'Nimic de șters: nu există "{CATEGORY_NAME}" în {event.title}.')
            return
        count = categories.count()
        # Înscrierile și alocarea de arbitri pleacă în cascadă cu categoria.
        categories.delete()
        self.stdout.write(self.style.SUCCESS(f'Șters: {count} categorie/categorii de test din {event.title}.'))

        fake = Athlete.objects.filter(
            first_name=TEST_REFEREE_FIRST_NAME,
            last_name__startswith=TEST_REFEREE_LAST_PREFIX,
        )
        removed = fake.count()
        if removed:
            fake.delete()
            self.stdout.write(self.style.SUCCESS(f'Șterși: {removed} arbitri de test.'))

    def _ensure_pin(self, event, referee):
        qr, _ = RefereeQRLogin.objects.get_or_create(event=event, referee=referee)
        if not qr.pin:
            qr.pin = RefereeQRLogin.generate_pin()
            qr.save(update_fields=['pin', 'updated_at'])
        return qr.pin

    @transaction.atomic
    def _fill_referees(self, event):
        """Pune arbitri de test pe pozitiile libere din categoria de test.

        Sunt sportivi noi pe masina din sala, deci iau chei primare care in
        cloud apartin altor persoane - acelasi motiv pentru care API-ul
        refuza crearea lor aici. E acceptabil doar pentru ca sunt date de
        proba, se vad dupa nume si pleaca odata cu `--remove`.
        """
        category = Category.objects.filter(event=event, name=CATEGORY_NAME).first()
        if not category:
            raise CommandError(
                f'Nu exista "{CATEGORY_NAME}" in {event.title}. '
                f'Ruleaza intai comanda fara --fill-referees.'
            )

        assignment, _ = CategoryRefereeAssignment.objects.get_or_create(category=category)

        filled = []
        for position in range(1, 6):
            field = f'referee_{position}'
            if getattr(assignment, f'{field}_id', None):
                continue

            referee, created = Athlete.objects.get_or_create(
                first_name=TEST_REFEREE_FIRST_NAME,
                last_name=f'{TEST_REFEREE_LAST_PREFIX}{position}',
                defaults={'status': 'approved', 'is_referee': True},
            )
            if not created and not referee.is_referee:
                referee.is_referee = True
                referee.save(update_fields=['is_referee'])

            setattr(assignment, field, referee)
            filled.append((position, referee))

        if not filled:
            self.stdout.write('Toate cele cinci pozitii au deja arbitru - nimic de completat.')
            return
        assignment.save()

        self.stdout.write(self.style.SUCCESS(f'Completat {len(filled)} pozitii in "{CATEGORY_NAME}":'))
        for position, referee in filled:
            pin = self._ensure_pin(event, referee)
            self.stdout.write(f'  A{position}  {referee.first_name} {referee.last_name} (id {referee.pk})  PIN {pin}')

        self.stdout.write('')
        self.stdout.write(self.style.WARNING(
            'Arbitri inventati, pentru probe. Pleaca odata cu categoria: '
            f'manage.py seed_device_test_category --event {event.pk} --remove'
        ))

    @transaction.atomic
    def _create(self, event, referee_id):
        if Category.objects.filter(event=event, name=CATEGORY_NAME).exists():
            raise CommandError(
                f'"{CATEGORY_NAME}" există deja în {event.title}. '
                f'Rulează cu --remove întâi dacă vrei una curată.'
            )

        group = Group.objects.filter(event=event).order_by('display_order', 'id').first()
        if not group:
            raise CommandError(f'{event.title} nu are nicio grupă - creează una întâi.')

        if referee_id:
            referee = Athlete.objects.filter(pk=referee_id).first()
            if not referee:
                raise CommandError(f'Nu există sportivul {referee_id}.')
        else:
            referee = Athlete.objects.filter(is_referee=True).order_by('id').first()
        if not referee:
            raise CommandError('Nu există niciun arbitru pe serverul local.')

        competitors = list(
            Athlete.objects.exclude(pk=referee.pk).order_by('id')[:8]
        )
        if not competitors:
            raise CommandError(
                'Nu există sportivi pe serverul local în afară de arbitru. '
                'Sincronizează întâi competiția din cloud.'
            )

        # Numărul de categorie e doar pentru ordonare în listele de concurs;
        # luăm unul liber ca să nu ne batem cu cele venite din pachet.
        taken = set(
            Category.objects.filter(event=event).values_list('category_number', flat=True)
        )
        number = next(n for n in range(900, 1000) if n not in taken)

        category = SoloCategory.objects.create(
            event=event,
            name=CATEGORY_NAME,
            group=group,
            gender='male',
            category_number=number,
            display_order=number,
        )

        for athlete in competitors:
            CategoryAthlete.objects.create(category=category, athlete=athlete)

        CategoryRefereeAssignment.objects.create(category=category, referee_1=referee)

        # Fără teren, categoria nu apare deloc în ecranul Live - acolo se
        # listează ce e repartizat pe fiecare teren, nu tot ce există. Și
        # dacă nu apare în Live, nu ai de unde să pui un sportiv pe ecran,
        # adică exact ce declanşează dispozitivul arbitrului.
        field = CompetitionField.objects.filter(event=event).order_by('field_number', 'id').first()
        if field:
            CategoryFieldAssignment.objects.update_or_create(
                category=category,
                defaults={'field': field, 'status': 'in_progress', 'order': 1},
            )

        pin = self._ensure_pin(event, referee)

        self.stdout.write(self.style.SUCCESS(f'Creat "{CATEGORY_NAME}" (id {category.pk}) în {event.title}.'))
        self.stdout.write(f'  Grupa:    {group.name}')
        self.stdout.write(f'  Teren:    {field.name if field else "— (niciun teren definit)"}')
        self.stdout.write(f'  Arbitru:  {referee.first_name} {referee.last_name} (id {referee.pk}), pe poziția A1')
        self.stdout.write(f'  PIN:      {pin}')
        self.stdout.write(f'  Sportivi: {len(competitors)}')
        for athlete in competitors:
            self.stdout.write(f'    - {athlete.first_name} {athlete.last_name} (id {athlete.pk})')
        self.stdout.write('')
        self.stdout.write(self.style.WARNING(
            'Date de test. Șterge-le înainte de competiția reală: '
            f'manage.py seed_device_test_category --event {event.pk} --remove'
        ))
