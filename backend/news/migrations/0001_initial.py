from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("landing", "0007_event_event_type"),
    ]

    operations = [
        migrations.CreateModel(
            name="NewsCommentProxy",
            fields=[],
            options={
                "proxy": True,
                "verbose_name": "Comment",
                "verbose_name_plural": "Comments",
            },
            bases=("landing.NewsComment",),
        ),
        migrations.CreateModel(
            name="NewsPostProxy",
            fields=[],
            options={
                "proxy": True,
                "verbose_name": "Post",
                "verbose_name_plural": "Posts",
            },
            bases=("landing.NewsPost",),
        ),
        migrations.CreateModel(
            name="NewsPostGalleryProxy",
            fields=[],
            options={
                "proxy": True,
                "verbose_name": "Gallery Image",
                "verbose_name_plural": "Gallery Images",
            },
            bases=("landing.NewsPostGallery",),
        ),
    ]
