from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("landing", "0007_event_event_type"),
    ]

    operations = [
        migrations.CreateModel(
            name="ContactInfoProxy",
            fields=[],
            options={
                "proxy": True,
                "verbose_name": "Contact Information",
                "verbose_name_plural": "Contact Information",
            },
            bases=("landing.ContactInfo",),
        ),
        migrations.CreateModel(
            name="ContactMessageProxy",
            fields=[],
            options={
                "proxy": True,
                "verbose_name": "Contact Message",
                "verbose_name_plural": "Contact Messages",
            },
            bases=("landing.ContactMessage",),
        ),
    ]
