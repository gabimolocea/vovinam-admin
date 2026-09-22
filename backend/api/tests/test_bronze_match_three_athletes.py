"""A 3-athlete single-elimination bracket always creates 2 "semi-finals"
Match rows (1 real match + 1 bye that auto-advances its lone athlete
straight to the final) - not 1, as add_bronze_match/generate_brackets'
consolation branch used to assume. Without treating the bye as "not a
real semi", add_bronze_match always fell into the >=2-semis branch and
demanded a loser out of a bye that was never actually played, permanently
blocking "Adaugă meci de bronz" for every 3-athlete category."""

from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from api.models import Athlete, Category, CategoryAthlete, Match, MatchRefereeScore, User


def _auth_client(user):
    client = APIClient()
    token = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
    return client


class ThreeAthleteBronzeMatchTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username='admin1', email='admin1@example.com', password='pass12345', role='admin', is_staff=True
        )
        self.client = _auth_client(self.admin)

        self.popilciuc = Athlete.objects.create(first_name='Gabriel', last_name='Popilciuc')
        self.molocea = Athlete.objects.create(first_name='Gabriel', last_name='Molocea')
        self.prisacariu = Athlete.objects.create(first_name='George-Marian', last_name='Prisacariu')

        self.category = Category.objects.create(name='Seniori -100kg', gender='male')
        for athlete in (self.popilciuc, self.molocea, self.prisacariu):
            CategoryAthlete.objects.create(category=self.category, athlete=athlete)

    def _generate(self, bracket_type='single_elimination'):
        # generate_brackets shuffles athlete seeding order randomly, which
        # would make it random each run which athlete gets the bye - patch
        # it to a no-op so seeding always follows enrollment order
        # (popilciuc, molocea, prisacariu), matching the fixed scenario
        # these tests assert on.
        with patch('random.shuffle', lambda seq: None):
            resp = self.client.post(
                f'/api/categories/{self.category.id}/generate-brackets/',
                {'bracket_type': bracket_type},
                format='json',
            )
        self.assertEqual(resp.status_code, 201, resp.content)

    def _decide(self, match, winner_is_red):
        referee = Athlete.objects.create(first_name='Ref', last_name=f'For{match.id}', is_referee=True)
        MatchRefereeScore.objects.create(
            match=match, referee=referee, round=None,
            red_corner_score=1 if winner_is_red else 0,
            blue_corner_score=0 if winner_is_red else 1,
        )

    def test_single_elimination_creates_one_real_semi_and_one_bye(self):
        self._generate('single_elimination')
        semis = list(Match.objects.filter(category=self.category, match_type='semi-finals'))
        self.assertEqual(len(semis), 2)
        real = [m for m in semis if m.red_corner_id and m.blue_corner_id]
        byes = [m for m in semis if not (m.red_corner_id and m.blue_corner_id)]
        self.assertEqual(len(real), 1)
        self.assertEqual(len(byes), 1)
        # The bye's lone athlete is auto-advanced straight into the final.
        final = Match.objects.get(category=self.category, match_type='finals')
        bye_athlete_id = byes[0].red_corner_id or byes[0].blue_corner_id
        self.assertIn(bye_athlete_id, (final.red_corner_id, final.blue_corner_id))

    def test_add_bronze_match_after_playing_semi_and_final(self):
        self._generate('single_elimination')
        real_semi = Match.objects.get(
            category=self.category, match_type='semi-finals', red_corner__isnull=False, blue_corner__isnull=False,
        )
        # Molocea beats Prisacariu in the one real semi-final.
        red_is_molocea = real_semi.red_corner_id == self.molocea.id
        self._decide(real_semi, winner_is_red=red_is_molocea)
        real_semi.status = 'completed'
        real_semi.save(update_fields=['status'])

        final = Match.objects.get(category=self.category, match_type='finals')
        # The final already has Popilciuc (auto-advanced from the bye) in
        # one corner; fill in Molocea (the semi's winner) in the other -
        # mirrors what advance_match_winner would have done.
        if final.red_corner_id:
            final.blue_corner = self.molocea
        else:
            final.red_corner = self.molocea
        final.save(update_fields=['red_corner', 'blue_corner'])

        # Popilciuc beats Molocea in the final.
        red_is_popilciuc = final.red_corner_id == self.popilciuc.id
        self._decide(final, winner_is_red=red_is_popilciuc)
        final.status = 'completed'
        final.save(update_fields=['status'])

        resp = self.client.post(f'/api/categories/{self.category.id}/add-bronze-match/')
        self.assertEqual(resp.status_code, 201, resp.content)

        bronze = Match.objects.get(category=self.category, match_type='bronze')
        corners = {bronze.red_corner_id, bronze.blue_corner_id}
        self.assertEqual(corners, {self.prisacariu.id, self.molocea.id})
        self.assertEqual(bronze.round_number, final.round_number + 1)

    def test_consolation_bracket_type_wires_bronze_at_generation_for_three_athletes(self):
        self._generate('consolation')
        bronze = Match.objects.filter(category=self.category, match_type='bronze').first()
        self.assertIsNotNone(bronze)
        real_semi = Match.objects.get(
            category=self.category, match_type='semi-finals', red_corner__isnull=False, blue_corner__isnull=False,
        )
        final = Match.objects.get(category=self.category, match_type='finals')
        self.assertEqual(real_semi.loser_next_match_id, bronze.id)
        self.assertEqual(final.loser_next_match_id, bronze.id)
