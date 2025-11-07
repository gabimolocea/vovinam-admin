from django.conf import settings
from django.db import models

from landing.models import NewsPost, NewsPostGallery, NewsComment


class Post(NewsPost):
    class Meta:
        proxy = True
        app_label = 'news'
        verbose_name = 'Post'
        verbose_name_plural = 'Posts'


class GalleryImage(NewsPostGallery):
    class Meta:
        proxy = True
        app_label = 'news'
        verbose_name = 'Gallery Image'
        verbose_name_plural = 'Gallery Images'


class Comment(NewsComment):
    class Meta:
        proxy = True
        app_label = 'news'
        verbose_name = 'Comment'
        verbose_name_plural = 'Comments'
from django.db import models

from landing.models import NewsComment


class NewsCommentProxy(NewsComment):
    """Proxy model to present NewsComment under the `news` app label in the admin URL.

    Having this proxy registered in a separate installed app (`news`) results in
    admin URLs like /admin/news/newscomment/ instead of /admin/landing/newscomment/.
    """

    class Meta:
        proxy = True
        app_label = 'news'
        verbose_name = 'Comment'
        verbose_name_plural = 'Comments'
