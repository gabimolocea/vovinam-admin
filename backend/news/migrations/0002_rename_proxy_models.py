from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("news", "0001_initial"),
    ]

    operations = [
        migrations.RenameModel(
            old_name='NewsPostProxy',
            new_name='Post',
        ),
        migrations.RenameModel(
            old_name='NewsPostGalleryProxy',
            new_name='GalleryImage',
        ),
        migrations.RenameModel(
            old_name='NewsCommentProxy',
            new_name='Comment',
        ),
    ]
