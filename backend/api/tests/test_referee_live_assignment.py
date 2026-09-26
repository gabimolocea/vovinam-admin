from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import (
    Athlete, CategoryFieldAssignment, CategoryRefereeAssignment, Club,
    CompetitionField, DisplayMonitorSession, FightCategory, Match,
    MatchFieldAssignment, MatchRefereeAssignment, SoloCategory, User,
)
from landing.models import Event


class RefereeLiveAssignmentTests(TestCase):
    """Ce înseamnă „e pe teren acum" pentru un arbitru.

    Starea vine din două surse care pot să nu fie de acord: sesiunea de
    monitor și alocarea de teren. Când masa centrală trece de la un meci
    la o probă tehnică pe același tatami, alocarea meciului rămâne „în
    desfășurare" deși monitorul arată deja altceva.

    Contează pentru că aplicația de arbitri intră direct în singurul
    lucru activ. Cu două lucruri active, arbitrul primește o listă și
    trebuie să aleagă - exact pasul pe care încercăm să-l scoatem, și
    tocmai când e pe saltea.
    """

    def setUp(self):
        now = timezone.now()
        self.client = APIClient()
        self.event = Event.objects.create(
            title='CN Teren', slug='cn-teren', start_date=now,
            end_date=now + timedelta(days=1), event_type='competition',
        )
        self.field = CompetitionField.objects.create(
            event=self.event, name='Teren test', field_number=97,
        )
        club = Club.objects.create(name='CS Teren')
        user = User.objects.create_user(
            username='arb', email='arb@example.com', password='pass12345', role='athlete',
        )
        self.referee = Athlete.objects.create(
            first_name='Arbitru', last_name='Unu', club=club,
            status='approved', is_referee=True, user=user,
        )
        self.client.force_authenticate(user=user)

        # Aceeași saltea: un meci și o probă tehnică, ambele ale acestui arbitru.
        self.category = SoloCategory.objects.create(
            name='TEHNICA', event=self.event, display_order=1,
        )
        CategoryRefereeAssignment.objects.create(category=self.category, referee_1=self.referee)
        self.cat_assignment = CategoryFieldAssignment.objects.create(
            category=self.category, field=self.field, status='not_started',
        )

        fight = FightCategory.objects.create(name='LUPTA', event=self.event, display_order=2)
        self.match = Match.objects.create(category=fight, match_number='M1', display_mode='real_time')
        MatchRefereeAssignment.objects.create(match=self.match, referee_1=self.referee)
        self.match_assignment = MatchFieldAssignment.objects.create(
            match=self.match, field=self.field, status='in_progress',
        )

        self.session = DisplayMonitorSession.objects.create(field=self.field, status='idle')

    def live_matches(self):
        res = self.client.get('/api/referees/me/assigned-matches/')
        return [m['id'] for m in res.data if m.get('field_status') == 'in_progress']

    def live_categories(self):
        res = self.client.get('/api/referees/me/assigned-categories/')
        return [c['id'] for c in res.data if c.get('field_status') == 'in_progress']

    def test_an_idle_monitor_leaves_the_assignment_in_charge(self):
        """Cât timp monitorul nu arată nimic, alocarea decide - altfel
        n-ar mai fi nimic activ înainte ca operatorul să pună ceva pe ecran."""
        self.assertEqual(self.live_matches(), [self.match.id])
        self.assertEqual(self.live_categories(), [])

    def test_the_monitor_decides_when_it_is_showing_something(self):
        self.session.current_match = self.match
        self.session.status = 'displaying'
        self.session.save()

        self.assertEqual(self.live_matches(), [self.match.id])

    def test_moving_the_monitor_to_the_category_takes_the_match_off_the_mat(self):
        """Cazul real. Alocarea meciului rămâne 'in_progress' - nimeni
        n-o închide când trece la proba următoare - dar salteaua e
        ocupată cu altceva, deci meciul așteaptă la rând."""
        self.session.current_category = self.category
        self.session.status = 'displaying'
        self.session.save()

        self.assertEqual(self.live_categories(), [self.category.id])
        self.assertEqual(
            self.live_matches(), [],
            'meciul nu mai e pe saltea: monitorul arată proba tehnică',
        )

    def test_the_referee_is_left_with_exactly_one_thing_to_do(self):
        """Consecința care contează: aplicația intră direct, fără să-i
        ceară arbitrului să aleagă."""
        self.session.current_category = self.category
        self.session.status = 'displaying'
        self.session.save()

        self.assertEqual(len(self.live_matches()) + len(self.live_categories()), 1)

    def test_a_category_assignment_does_not_override_a_busy_monitor_either(self):
        """Simetric: dacă monitorul arată meciul, proba tehnică lăsată
        'in_progress' în alocare nu mai e activă."""
        self.cat_assignment.status = 'in_progress'
        self.cat_assignment.save()
        self.session.current_match = self.match
        self.session.status = 'displaying'
        self.session.save()

        self.assertEqual(self.live_matches(), [self.match.id])
        self.assertEqual(self.live_categories(), [])
