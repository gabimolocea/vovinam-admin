"""Creează o categorie de tehnică de test, pentru probarea dispozitivului
de arbitraj (devices/referee-esp32c3) sau a aplicației de pe telefon.

Nu creează sportivi: îi folosește pe cei care există deja pe serverul
local. Sportivii creați pe mașina din sală primesc chei primare care în
cloud aparțin altor persoane - exact motivul pentru care API-ul refuză
crearea lor aici. Categoria în sine e tot o înregistrare nouă, așa că e
făcută ca să fie ștearsă: `--remove` o scoate complet.

    python manage.py seed_device_test_category --event 21
    python manage.py seed_device_test_category --event 21 --fill-referees
    python manage.py seed_device_test_category --event 21 --fight
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
    CompetitionReferee,
    FightCategory,
    Group,
    Match,
    MatchFieldAssignment,
    MatchRefereeAssignment,
    MatchRound,
    RefereeQRLogin,
    SoloCategory,
)
from landing.models import Event


CATEGORY_NAME = 'TEST DISPOZITIV'
FIGHT_CATEGORY_NAME = 'TEST LUPTA'

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
            '--fight', action='store_true',
            help='Creează și o categorie de luptă cu un meci de test, în modul real-time.',
        )
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
        if options['fight']:
            return self._create_fight(event)
        if options['fill_referees']:
            return self._fill_referees(event)
        return self._create(event, options['referee'])

    def _remove(self, event):
        categories = Category.objects.filter(event=event, name__in=[CATEGORY_NAME, FIGHT_CATEGORY_NAME])
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

    def _pick_group(self, event, competitors):
        """Grupa potrivită vârstei sportivilor, nu prima din listă.

        Prima variantă lua pur și simplu prima grupă a competiției, care
        aici e cea de 7-8 ani - iar meciul de test ajungea cu doi adulți
        în grupa copiilor. Nu contează doar pentru cum arată: panoul
        propune durata reprizelor după grupă, deci o grupă greșită dă o
        recomandare greșită.

        Sportivii fără dată de naștere nu pot fi încadrați, așa că dacă
        niciunul nu are una, rămânem la prima grupă - dar spunem asta.
        """
        groups = list(Group.objects.filter(event=event).order_by('display_order', 'id'))
        if not groups:
            return None, 'nicio grupă definită'

        years = [a.date_of_birth.year for a in competitors if a.date_of_birth]
        if not years:
            return groups[0], 'niciun sportiv nu are dată de naștere'

        # Încadrăm după cel mai în vârstă, la fel ca regula de reprize din
        # panou: o grupă trebuie să-l cuprindă pe cel mai mare din meci.
        oldest_year = min(years)
        for group in groups:
            start, end = group.birth_year_start, group.birth_year_end
            if start is None:
                continue
            if oldest_year >= start and (end is None or oldest_year <= end):
                return group, None

        # Nimic nu-l cuprinde: luăm grupa fără limită superioară (seniori),
        # altfel ultima.
        open_ended = next((g for g in groups if g.birth_year_start and g.birth_year_end is None), None)
        return (open_ended or groups[-1]), f'niciun interval nu cuprinde anul {oldest_year}'

    def _register_referee(self, event, referee):
        """Înscrie arbitrul la competiție, nu doar pe o poziție.

        Lista din care alegi un arbitru în panou vine din arbitrii
        *înscriși la eveniment*, nu din toți sportivii marcați ca arbitri.
        Alocat direct pe o poziție fără înscriere, arbitrul apărea în slot
        dar lipsea din dropdown - și nu puteai pune altul în locul lui.
        """
        CompetitionReferee.objects.get_or_create(
            event=event, athlete=referee, defaults={'role': 'corner'},
        )

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

            self._register_referee(event, referee)
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
    def _create_fight(self, event):
        """Un meci de luptă de test, în modul real-time.

        Acolo un punct devine valid doar dacă doi arbitri îl dau în 1500
        ms unul de altul, deci ca să probezi fluxul îți trebuie un meci
        chiar existent, cu doi sportivi în colțuri și cel puțin doi
        arbitri alocați - nu se poate simula dintr-un singur dispozitiv.
        """
        if Category.objects.filter(event=event, name=FIGHT_CATEGORY_NAME).exists():
            raise CommandError(
                f'"{FIGHT_CATEGORY_NAME}" există deja în {event.title}. '
                f'Rulează cu --remove întâi.'
            )

        # Preferăm sportivii cu dată de naștere: fără ea nu pot fi
        # încadrați într-o grupă, iar meciul ar ajunge iar aiurea.
        fighters = list(Athlete.objects.filter(is_referee=False).exclude(date_of_birth=None).order_by('id')[:2])
        if len(fighters) < 2:
            fighters += [a for a in Athlete.objects.exclude(date_of_birth=None).order_by('id')
                         if a not in fighters][:2 - len(fighters)]
        if len(fighters) < 2:
            fighters += [a for a in Athlete.objects.order_by('id') if a not in fighters][:2 - len(fighters)]
        if len(fighters) < 2:
            raise CommandError('E nevoie de cel puțin doi sportivi pe serverul local.')

        group, group_note = self._pick_group(event, fighters)
        if not group:
            raise CommandError(f'{event.title} nu are nicio grupă.')

        taken = set(Category.objects.filter(event=event).values_list('category_number', flat=True))
        number = next(n for n in range(900, 1000) if n not in taken)

        category = FightCategory.objects.create(
            event=event, name=FIGHT_CATEGORY_NAME, group=group,
            gender='male', category_number=number, display_order=number,
        )
        for athlete in fighters:
            CategoryAthlete.objects.create(category=category, athlete=athlete)

        field = CompetitionField.objects.filter(event=event).order_by('field_number', 'id').first()
        if field:
            CategoryFieldAssignment.objects.update_or_create(
                category=category,
                defaults={'field': field, 'status': 'not_started', 'order': 2},
            )

        match = Match.objects.create(
            category=category, field=field, match_number=1, match_type='finals',
            round_number=1, status='scheduled',
            red_corner=fighters[0], blue_corner=fighters[1],
            display_mode='real_time',   # fara asta punctele nu trec prin validare
        )
        if field:
            MatchFieldAssignment.objects.update_or_create(
                match=match, defaults={'field': field, 'status': 'not_started', 'order': 1},
            )
        # Reprizele se creeaza singure la salvarea meciului, printr-un
        # semnal - daca le mai cream si aici, se loveste de constrangerea
        # de unicitate pe (meci, numar repriza).
        for number in (1, 2):
            MatchRound.objects.get_or_create(
                match=match, round_number=number,
                defaults={'duration_seconds': 120, 'status': 'scheduled'},
            )

        # Doi arbitri, minimul la care validarea pe majoritate are sens.
        referees = []
        for position in (1, 2):
            referee, created = Athlete.objects.get_or_create(
                first_name=TEST_REFEREE_FIRST_NAME,
                last_name=f'{TEST_REFEREE_LAST_PREFIX}{position}',
                defaults={'status': 'approved', 'is_referee': True},
            )
            if not created and not referee.is_referee:
                referee.is_referee = True
                referee.save(update_fields=['is_referee'])
            referees.append(referee)

        for referee in referees:
            self._register_referee(event, referee)
        MatchRefereeAssignment.objects.create(
            match=match, referee_1=referees[0], referee_2=referees[1],
        )

        self.stdout.write(self.style.SUCCESS(f'Creat "{FIGHT_CATEGORY_NAME}" (id {category.pk}) în {event.title}.'))
        self.stdout.write(f'  Grupa:  {group.name}' + (f'  (aleasă implicit: {group_note})' if group_note else '  (potrivită vârstei)'))
        self.stdout.write(f'  Teren:  {field.name if field else "—"}')
        self.stdout.write(f'  Meci:   #{match.pk}, {fighters[0].first_name} {fighters[0].last_name} (roșu) vs {fighters[1].first_name} {fighters[1].last_name} (albastru)')
        self.stdout.write(f'  Mod:    {match.display_mode} - punctele se validează când doi arbitri dau la fel în 1500 ms')
        self.stdout.write(f'  Reprize: {MatchRound.objects.filter(match=match).count()}')
        for position, referee in enumerate(referees, start=1):
            pin = self._ensure_pin(event, referee)
            self.stdout.write(f'  A{position}     {referee.first_name} {referee.last_name} (id {referee.pk})  PIN {pin}')
        self.stdout.write('')
        self.stdout.write(self.style.WARNING(
            'Date de test. Pleacă cu: '
            f'manage.py seed_device_test_category --event {event.pk} --remove'
        ))

    @transaction.atomic
    def _create(self, event, referee_id):
        if Category.objects.filter(event=event, name=CATEGORY_NAME).exists():
            raise CommandError(
                f'"{CATEGORY_NAME}" există deja în {event.title}. '
                f'Rulează cu --remove întâi dacă vrei una curată.'
            )

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

        group, group_note = self._pick_group(event, competitors)
        if not group:
            raise CommandError(f'{event.title} nu are nicio grupă - creează una întâi.')

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

        self._register_referee(event, referee)
        CategoryRefereeAssignment.objects.create(category=category, referee_1=referee)

        # Fără teren, categoria nu apare deloc în ecranul Live - acolo se
        # listează ce e repartizat pe fiecare teren, nu tot ce există. Și
        # dacă nu apare în Live, nu ai de unde să pui un sportiv pe ecran,
        # adică exact ce declanşează dispozitivul arbitrului.
        # 'not_started', nu 'in_progress': un teren rulează o singură probă
        # la un moment dat, iar trecerea în desfășurare o face operatorul
        # apăsând AFIȘEAZĂ PE TV. Marcată în desfășurare de la creare,
        # proba de test apărea activă lângă alta care chiar era.
        field = CompetitionField.objects.filter(event=event).order_by('field_number', 'id').first()
        if field:
            CategoryFieldAssignment.objects.update_or_create(
                category=category,
                defaults={'field': field, 'status': 'not_started', 'order': 1},
            )

        pin = self._ensure_pin(event, referee)

        self.stdout.write(self.style.SUCCESS(f'Creat "{CATEGORY_NAME}" (id {category.pk}) în {event.title}.'))
        self.stdout.write(f'  Grupa:    {group.name}' + (f'  (aleasă implicit: {group_note})' if group_note else '  (potrivită vârstei)'))
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
