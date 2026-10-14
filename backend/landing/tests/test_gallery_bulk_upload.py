import io
import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from PIL import Image

from landing.models import NewsPost, NewsPostGallery

TEMP_MEDIA = tempfile.mkdtemp()


def an_image(name='poza.jpg', size=(900, 700)):
    buffer = io.BytesIO()
    Image.new('RGB', size, (30, 90, 160)).save(buffer, 'JPEG')
    return SimpleUploadedFile(name, buffer.getvalue(), content_type='image/jpeg')


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class GalleryBulkUploadTests(TestCase):
    """Încărcarea în masă a imaginilor de galerie.

    Motivul pentru care nu se trimit toate deodată: serverul are un vCPU
    și o jumătate de gigabyte, iar fiecare imagine se deschide, se
    micșorează și se recodează înainte de răspuns. O sută într-o singură
    cerere depășesc și timpul, și memoria - de acolo a venit 503-ul.
    Browserul le trimite în transe mici, iar serverul refuză transele
    prea mari, ca regula să nu se poată ocoli.
    """

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(TEMP_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='redactor', email='redactor@example.com', password='parola12345',
        )
        self.client.force_login(self.admin)
        self.post = NewsPost.objects.create(title='Campionat', slug='campionat', author=self.admin)
        self.url = reverse('admin:landing_newspost_gallery_upload', args=[self.post.pk])

    def test_a_batch_lands_in_the_gallery(self):
        response = self.client.post(self.url, {'images': [an_image('a.jpg'), an_image('b.jpg')]})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()['created']), 2)
        self.assertEqual(NewsPostGallery.objects.filter(news_post=self.post).count(), 2)

    def test_new_images_go_after_the_existing_ones(self):
        """Numerotarea continuă, altfel imaginile adăugate acum ar sări
        în fața celor puse cu grijă mai devreme."""
        NewsPostGallery.objects.create(news_post=self.post, image='news/gallery/veche.jpg', order=7)

        self.client.post(self.url, {'images': [an_image('noua.jpg')]})

        added = NewsPostGallery.objects.filter(news_post=self.post).order_by('-order').first()
        self.assertEqual(added.order, 8)

    def test_a_batch_that_is_too_large_is_refused(self):
        """Limita trăiește pe server, nu doar în browser - altfel s-ar
        putea ocoli, și exact asta a doborât aplicația."""
        images = [an_image(f'{i}.jpg') for i in range(20)]

        response = self.client.post(self.url, {'images': images})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(NewsPostGallery.objects.filter(news_post=self.post).count(), 0)

    def test_an_empty_upload_says_so(self):
        response = self.client.post(self.url, {})
        self.assertEqual(response.status_code, 400)

    def test_a_visitor_cannot_add_images(self):
        self.client.logout()
        response = self.client.post(self.url, {'images': [an_image()]})

        self.assertNotEqual(response.status_code, 200)
        self.assertEqual(NewsPostGallery.objects.filter(news_post=self.post).count(), 0)

    def test_gallery_images_are_optimized_on_the_way_in(self):
        """Ajung prin aceeași stocare ca restul, deci se micșorează."""
        self.client.post(self.url, {'images': [an_image('mare.jpg', size=(3000, 2000))]})

        item = NewsPostGallery.objects.get(news_post=self.post)
        with Image.open(item.image.path) as stored:
            self.assertLessEqual(max(stored.size), 1280)


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class EventGalleryTests(TestCase):
    """Evenimentele au galerie la fel ca articolele: aceleași poze, etichete și reacții."""

    def setUp(self):
        from datetime import timedelta
        from django.utils import timezone
        from landing.models import Event

        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='organizator', email='organizator@example.com', password='parola12345',
        )
        self.client.force_login(self.admin)
        now = timezone.now()
        self.event = Event.objects.create(
            title='Cupa României', slug='cupa-romaniei', start_date=now, end_date=now + timedelta(days=1),
            event_type='competition', is_publicly_visible=True,
        )
        self.url = reverse('admin:api_event_gallery_upload', args=[self.event.pk])

    def test_bulk_upload_lands_in_the_event_gallery(self):
        response = self.client.post(self.url, {'images': [an_image('a.jpg'), an_image('b.jpg')]})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.event.gallery_images.count(), 2)
        self.assertFalse(NewsPostGallery.objects.filter(news_post__isnull=False).exists())

    def test_event_change_form_offers_bulk_upload(self):
        response = self.client.get(reverse('admin:api_event_change', args=[self.event.pk]))
        self.assertContains(response, self.url)

    def test_public_event_page_and_photo_carry_the_gallery(self):
        self.client.post(self.url, {'images': [an_image('a.jpg')]})
        photo = self.event.gallery_images.get()

        detail = self.client.get(f'/api/public/events/{self.event.slug}/', HTTP_HOST='localhost').json()
        self.assertEqual([image['id'] for image in detail['gallery_images']], [photo.pk])

        single = self.client.get(f'/api/public/gallery/{photo.pk}/', HTTP_HOST='localhost').json()
        self.assertEqual(single['event_slug'], self.event.slug)
        self.assertIsNone(single['news_post_slug'])

    def test_a_photo_belongs_to_exactly_one_post_or_event(self):
        from django.db import IntegrityError, transaction

        post = NewsPost.objects.create(title='Știre', slug='stire', author=self.admin)
        with self.assertRaises(IntegrityError), transaction.atomic():
            NewsPostGallery.objects.create(news_post=post, event=self.event, image='x.jpg')
        with self.assertRaises(IntegrityError), transaction.atomic():
            NewsPostGallery.objects.create(image='x.jpg')
