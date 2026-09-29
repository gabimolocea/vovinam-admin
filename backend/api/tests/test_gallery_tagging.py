from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Athlete, Club, User
from landing.models import NewsPost, NewsPostGallery


class GalleryTaggingTests(TestCase):
    """Cine poate eticheta pe cine într-o poză de galerie.

    Etichetarea e deschisă: oricine autentificat poate pune o etichetă,
    pe sine sau pe altcineva. Tocmai de aceea scoaterea trebuie să existe
    și să fie a celui etichetat - altfel o etichetă pusă greșit rămâne
    acolo pentru totdeauna, iar persoana pe care o privește n-are ce
    face.

    Dar nici scoaterea nu poate fi deschisă: dacă oricine ar putea
    șterge etichetele altora, am fi mutat abuzul de pe un picior pe
    celălalt.
    """

    def setUp(self):
        self.client = APIClient()
        self.club = Club.objects.create(name='CS Foto')
        self.other_club = Club.objects.create(name='CS Străin')

        self.author = User.objects.create_user(
            username='autor', email='autor@example.com', password='parola12345',
            role='admin', is_staff=True,
        )
        post = NewsPost.objects.create(title='Cupa', slug='cupa', author=self.author)
        self.photo = NewsPostGallery.objects.create(
            news_post=post, image='news/gallery/1.jpg', order=1,
        )

        def member(username, club, coach=False):
            user = User.objects.create_user(
                username=username, email=f'{username}@example.com',
                password='parola12345', role='athlete',
            )
            athlete = Athlete.objects.create(
                first_name=username.capitalize(), last_name='Popescu', club=club,
                status='approved', user=user, is_coach=coach,
            )
            return user, athlete

        self.user, self.me = member('ion', self.club)
        self.mate_user, self.mate = member('vasile', self.club)
        self.coach_user, self.coach = member('antrenor', self.club, coach=True)
        self.club.coaches.add(self.coach)
        self.stranger_user, self.stranger = member('strain', self.other_club)

        self.url = f'/api/public/gallery/{self.photo.id}/tags/'

    def tag(self, athlete):
        return self.client.post(self.url, {'athlete': athlete.id}, format='json')

    def untag(self, athlete):
        return self.client.delete(self.url, {'athlete': athlete.id}, format='json')

    # ── adăugarea ──

    def test_you_can_tag_yourself(self):
        self.client.force_authenticate(user=self.user)
        self.assertEqual(self.tag(self.me).status_code, 200)
        self.assertIn(self.me, self.photo.tagged_athletes.all())

    def test_you_can_tag_someone_else(self):
        self.client.force_authenticate(user=self.user)
        self.assertEqual(self.tag(self.mate).status_code, 200)
        self.assertIn(self.mate, self.photo.tagged_athletes.all())

    def test_tagging_twice_leaves_one_tag(self):
        self.client.force_authenticate(user=self.user)
        self.tag(self.me)
        self.tag(self.me)
        self.assertEqual(self.photo.tagged_athletes.filter(pk=self.me.pk).count(), 1)

    def test_a_visitor_cannot_tag(self):
        response = self.tag(self.me)
        self.assertIn(response.status_code, (401, 403))
        self.assertEqual(self.photo.tagged_athletes.count(), 0)

    # ── scoaterea ──

    def test_you_can_untag_yourself(self):
        self.photo.tagged_athletes.add(self.me)
        self.client.force_authenticate(user=self.user)

        self.assertEqual(self.untag(self.me).status_code, 200)
        self.assertEqual(self.photo.tagged_athletes.count(), 0)

    def test_you_cannot_untag_a_stranger(self):
        """Altfel am muta abuzul, nu l-am opri."""
        self.photo.tagged_athletes.add(self.stranger)
        self.client.force_authenticate(user=self.user)

        self.assertEqual(self.untag(self.stranger).status_code, 403)
        self.assertIn(self.stranger, self.photo.tagged_athletes.all())

    def test_a_coach_can_untag_an_athlete_of_their_club(self):
        """Un copil de 9 ani nu-și administrează singur etichetele."""
        self.photo.tagged_athletes.add(self.mate)
        self.client.force_authenticate(user=self.coach_user)

        self.assertEqual(self.untag(self.mate).status_code, 200)
        self.assertEqual(self.photo.tagged_athletes.count(), 0)

    def test_a_coach_cannot_untag_another_club(self):
        self.photo.tagged_athletes.add(self.stranger)
        self.client.force_authenticate(user=self.coach_user)

        self.assertEqual(self.untag(self.stranger).status_code, 403)

    def test_an_admin_can_untag_anyone(self):
        self.photo.tagged_athletes.add(self.stranger)
        self.client.force_authenticate(user=self.author)

        self.assertEqual(self.untag(self.stranger).status_code, 200)

    # ── ce vede interfața ──

    def test_the_response_says_which_tags_you_may_remove(self):
        """Interfața nu trebuie să arate un buton care va fi refuzat."""
        self.photo.tagged_athletes.add(self.me, self.stranger)
        self.client.force_authenticate(user=self.user)

        response = self.client.get(f'/api/public/gallery/{self.photo.id}/')
        by_id = {t['id']: t for t in response.data['tagged_athletes']}

        self.assertTrue(by_id[self.me.id]['can_remove'])
        self.assertFalse(by_id[self.stranger.id]['can_remove'])

    def test_a_visitor_is_offered_no_removals(self):
        self.photo.tagged_athletes.add(self.me)
        response = self.client.get(f'/api/public/gallery/{self.photo.id}/')
        self.assertFalse(response.data['tagged_athletes'][0]['can_remove'])


class GalleryTagSearchTests(TestCase):
    """Căutarea celor de etichetat.

    Endpoint separat și îngust: întoarce nume, club și atât. Lista
    completă de sportivi nu trebuie să fie răsfoibilă de oricine e
    autentificat, doar pentru că vrea să pună o etichetă.
    """

    def setUp(self):
        self.client = APIClient()
        club = Club.objects.create(name='CS Căutare')
        self.user = User.objects.create_user(
            username='cautator', email='c@example.com', password='parola12345', role='athlete',
        )
        Athlete.objects.create(first_name='Andrei', last_name='Ionescu', club=club, status='approved')
        Athlete.objects.create(first_name='Andreea', last_name='Marin', club=club, status='approved')
        Athlete.objects.create(first_name='Andrei', last_name='Pop', club=club, status='pending')
        self.url = '/api/public/gallery/tag-search/'

    def test_a_visitor_cannot_search(self):
        response = self.client.get(self.url, {'q': 'andrei'})
        self.assertIn(response.status_code, (401, 403))

    def test_a_short_query_returns_nothing(self):
        """O literă ar întoarce jumătate din federație."""
        self.client.force_authenticate(user=self.user)
        self.assertEqual(self.client.get(self.url, {'q': 'a'}).data, [])

    def test_it_matches_on_either_name(self):
        self.client.force_authenticate(user=self.user)
        names = [row['name'] for row in self.client.get(self.url, {'q': 'ionescu'}).data]
        self.assertEqual(names, ['Andrei Ionescu'])

    def test_both_words_must_match(self):
        self.client.force_authenticate(user=self.user)
        names = [row['name'] for row in self.client.get(self.url, {'q': 'andreea marin'}).data]
        self.assertEqual(names, ['Andreea Marin'])

    def test_unapproved_athletes_are_not_offered(self):
        self.client.force_authenticate(user=self.user)
        names = [row['name'] for row in self.client.get(self.url, {'q': 'pop'}).data]
        self.assertEqual(names, [])
