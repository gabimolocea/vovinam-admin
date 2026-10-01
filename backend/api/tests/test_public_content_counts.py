"""Cifrele de langa o stire sau o poza: aprecieri, nemultumiri, comentarii.

Se calculeaza prin anotari pe interogare (vezi `_with_reaction_counts`),
nu element cu element. E rapid, dar e si genul de lucru care se strica in
liniste: doua relatii numarate in acelasi `annotate` isi inmultesc
JOIN-urile, iar rezultatul nu e o eroare, e un numar greșit. De aceea
testele de aici pun date in asa fel incat o inmultire sa iasa la iveala:
o stire cu 2 aprecieri *si* 3 comentarii, unde 2 si 3 se confunda usor cu 6.
"""

from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.db import connection
from rest_framework.test import APIClient

from landing.models import (
    NewsPost, NewsPostGallery, NewsComment, NewsReaction,
    GalleryComment, GalleryReaction,
)
from ..models import User
from ..public_cache import invalidate_public_cache


class PublicContentCountTests(TestCase):
    def setUp(self):
        invalidate_public_cache()
        self.client = APIClient()
        self.author = User.objects.create_user('autor', email='autor@example.com', password='x')
        self.readers = [
            User.objects.create_user(f'cititor{i}', email=f'c{i}@example.com', password='x')
            for i in range(5)
        ]
        self.post = NewsPost.objects.create(
            title='Stire', slug='stire', author=self.author, content='x', published=True,
        )

    def _news(self):
        response = self.client.get('/api/public/news/', HTTP_HOST='localhost')
        self.assertEqual(response.status_code, 200)
        return response.data['results'][0]

    def test_counts_are_right_when_reactions_and_comments_coexist(self):
        # 2 aprecieri, 1 nemultumire, 3 comentarii - numere care, inmultite
        # intre ele, dau altceva decat suma lor.
        for reader in self.readers[:2]:
            NewsReaction.objects.create(news_post=self.post, user=reader, reaction_type='like')
        NewsReaction.objects.create(news_post=self.post, user=self.readers[2], reaction_type='dislike')
        for i in range(3):
            NewsComment.objects.create(
                news_post=self.post, author=self.readers[i], content=f'c{i}', is_approved=True)

        item = self._news()
        self.assertEqual(item['like_count'], 2)
        self.assertEqual(item['dislike_count'], 1)
        self.assertEqual(item['comment_count'], 3)

    def test_unapproved_comments_are_not_counted(self):
        NewsComment.objects.create(
            news_post=self.post, author=self.readers[0], content='aprobat', is_approved=True)
        NewsComment.objects.create(
            news_post=self.post, author=self.readers[1], content='in asteptare', is_approved=False)

        self.assertEqual(self._news()['comment_count'], 1)

    def test_a_post_with_nothing_shows_zeros(self):
        item = self._news()
        self.assertEqual((item['like_count'], item['dislike_count'], item['comment_count']), (0, 0, 0))

    def test_listing_more_posts_does_not_cost_more_queries(self):
        """Pragul pentru care exista anotarile: numarul de interogari nu
        trebuie sa creasca cu numarul de stiri."""
        def queries_for(n):
            NewsPost.objects.exclude(pk=self.post.pk).delete()
            for i in range(n - 1):
                post = NewsPost.objects.create(
                    title=f'S{i}', slug=f's-{i}', author=self.author, content='x', published=True)
                NewsReaction.objects.create(
                    news_post=post, user=self.readers[i % 5], reaction_type='like')
                NewsComment.objects.create(
                    news_post=post, author=self.readers[i % 5], content='c', is_approved=True)
            invalidate_public_cache()
            with CaptureQueriesContext(connection) as ctx:
                self.client.get('/api/public/news/', HTTP_HOST='localhost')
            return len(ctx)

        self.assertEqual(queries_for(2), queries_for(12))

    def test_newest_news_comes_first(self):
        """Anotarile fac interogarea un GROUP BY, iar pe acelea Django nu
        mai aplica `Meta.ordering` - ordinea trebuie ceruta explicit, altfel
        lista de stiri iese amestecata si nimeni nu observa imediat."""
        from django.utils import timezone
        from datetime import timedelta
        now = timezone.now()
        for i, zile in enumerate([5, 1, 10]):
            NewsPost.objects.create(
                title=f'Mai veche cu {zile} zile', slug=f'v-{i}', author=self.author,
                content='x', published=True, created_at=now - timedelta(days=zile))

        response = self.client.get('/api/public/news/', HTTP_HOST='localhost')
        datele = [item['created_at'] for item in response.data['results']]
        self.assertEqual(datele, sorted(datele, reverse=True))

    def test_gallery_counts_are_right_too(self):
        photo = NewsPostGallery.objects.create(news_post=self.post, image='news/gallery/x.jpg')
        for reader in self.readers[:3]:
            GalleryReaction.objects.create(gallery_image=photo, user=reader, reaction_type='like')
        GalleryReaction.objects.create(
            gallery_image=photo, user=self.readers[3], reaction_type='dislike')
        for i in range(2):
            GalleryComment.objects.create(
                gallery_image=photo, author=self.readers[i], content=f'c{i}', is_approved=True)

        response = self.client.get('/api/public/gallery/', HTTP_HOST='localhost')
        self.assertEqual(response.status_code, 200)
        item = response.data['results'][0]
        self.assertEqual(item['like_count'], 3)
        self.assertEqual(item['dislike_count'], 1)
        self.assertEqual(item['comment_count'], 2)
