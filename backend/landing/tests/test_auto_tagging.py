from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from api.models import Athlete, Club
from landing.auto_tagging import auto_tag_html, auto_tag_post, build_index
from landing.models import NewsPost


class AutoTaggingTests(TestCase):
    """Names in a published article become tags - only when there's no doubt who they are."""

    def setUp(self):
        self.razvan = Athlete.objects.create(first_name='Răzvan', last_name='Niculescu', status='approved')
        self.rares = Athlete.objects.create(first_name='Rareș-Andrei', last_name='Zaharia', status='approved')
        self.club = Club.objects.create(name='Club Sportiv Ho Trang', slug='cs-ho-trang')
        # Two athletes with the same name: neither may be tagged.
        Athlete.objects.create(first_name='Ion', last_name='Popescu', status='approved')
        Athlete.objects.create(first_name='Ion', last_name='Popescu', status='approved')
        Athlete.objects.create(first_name='Ascuns', last_name='Inasteptare', status='pending')
        self.index = build_index()

    def tag(self, content):
        return auto_tag_html(content, self.index)

    def test_full_names_become_mentions_once_diacritics_and_order_ignored(self):
        html, athletes, _ = self.tag(
            '<p>Felicitări lui Razvan Niculescu și lui Zaharia Rareș-Andrei. Niculescu Răzvan a câștigat.</p>'
        )
        self.assertIn(f'href="/sportivi/{self.razvan.pk}">Razvan Niculescu</a>', html)
        self.assertIn(f'href="/sportivi/{self.rares.pk}">Zaharia Rareș-Andrei</a>', html)
        self.assertEqual(html.count(f'/sportivi/{self.razvan.pk}'), 1)  # first appearance only
        self.assertEqual(athletes, {self.razvan.pk, self.rares.pk})

    def test_clubs_are_linked_by_their_full_name(self):
        html, _, clubs = self.tag('<p>Sportivii de la Club Sportiv Ho Trang au fost prezenți.</p>')
        self.assertIn('data-mention-type="club" href="/cluburi/cs-ho-trang">Club Sportiv Ho Trang</a>', html)
        self.assertEqual(clubs, {self.club.pk})

    def test_what_cannot_be_told_apart_is_left_alone(self):
        content = (
            '<p>Ion Popescu a venit, Inasteptare Ascuns nu. Răzvan a câștigat. Niculescule!</p>'
            '<h2>Răzvan Niculescu</h2><p><a href="/x">Răzvan Niculescu</a></p>'
        )
        html, athletes, _ = self.tag(content)
        self.assertEqual(html, content)
        self.assertEqual(athletes, set())

    def test_someone_tagged_by_hand_is_not_linked_again(self):
        manual = (
            f'<p><a class="ck-mention-link" data-mention="@Răzvan Niculescu" data-mention-type="athlete" '
            f'href="/sportivi/{self.razvan.pk}">@Răzvan Niculescu</a> și apoi Răzvan Niculescu.</p>'
        )
        html, athletes, _ = self.tag(manual)
        self.assertEqual(html, manual)
        self.assertEqual(athletes, {self.razvan.pk})

    def test_entities_between_first_and_last_name_still_match(self):
        html, athletes, _ = self.tag('<p>Răzvan&nbsp;Niculescu</p>')
        self.assertIn('>Răzvan&nbsp;Niculescu</a>', html)
        self.assertEqual(athletes, {self.razvan.pk})

    def test_only_published_posts_are_tagged_and_athletes_join_tagged_athletes(self):
        author = get_user_model().objects.create_user(username='a', email='a@example.com', password='x')
        draft = NewsPost.objects.create(title='Ciornă', slug='ciorna', author=author, content='<p>Răzvan Niculescu</p>')
        self.assertEqual(auto_tag_post(draft, self.index), [])

        post = NewsPost.objects.create(title='Știre', slug='stire', author=author, published=True,
                                       content='<p>Răzvan Niculescu</p>')
        self.assertEqual(auto_tag_post(post, self.index), [self.razvan])
        post.refresh_from_db()
        self.assertIn('ck-mention-link', post.content)
        self.assertEqual(list(post.tagged_athletes.all()), [self.razvan])
        self.assertEqual(auto_tag_post(post, self.index), [])  # nothing new the second time

    def test_saving_a_published_post_in_the_admin_tags_it(self):
        admin_user = get_user_model().objects.create_superuser(username='adm', email='adm@example.com', password='x')
        post = NewsPost.objects.create(title='Știre', slug='stire', author=admin_user, published=True,
                                       content='<p>Felicitări lui Răzvan Niculescu.</p>')
        self.client.force_login(admin_user)
        url = reverse('admin:landing_newspost_change', args=[post.pk])
        form = self.client.get(url).context['adminform'].form
        data = {
            name: form[name].value() for name in form.fields
            if name != 'featured_image' and form[name].value() is not None
        }
        data.update({
            'published': 'on', 'tagged_athletes': [],
            'gallery_images-TOTAL_FORMS': '0', 'gallery_images-INITIAL_FORMS': '0',
        })
        response = self.client.post(url, data, follow=True)

        self.assertContains(response, 'Am etichetat automat: Răzvan Niculescu')
        self.assertEqual(list(post.tagged_athletes.all()), [self.razvan])
