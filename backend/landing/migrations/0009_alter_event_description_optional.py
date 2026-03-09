from django.db import migrations
import django_ckeditor_5.fields


class Migration(migrations.Migration):

    dependencies = [
        ('landing', '0008_alter_newscomment_options_alter_newspost_options_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='event',
            name='description',
            field=django_ckeditor_5.fields.CKEditor5Field(blank=True, config_name='extends', verbose_name='Description'),
        ),
    ]
