from django.db import migrations


def seed_titles_and_roles(apps, schema_editor):
    Title = apps.get_model("api", "Title")
    FederationRole = apps.get_model("api", "FederationRole")

    federation_roles = [
        "Președinte F.R.V.V.",
        "Vicepreședinte F.R.V.V.",
        "Șef Comisie Națională Arbitraj",
        "Secretar General",
        "Membru (consiliu)",
    ]

    honorary_titles = [
        "Maestru al Sportului",
        "Maestru Emerit al Sportului",
        "Antrenor emerit",
    ]

    for name in federation_roles:
        FederationRole.objects.get_or_create(name=name)

    for name in honorary_titles:
        Title.objects.get_or_create(name=name)


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0063_seed_default_grades"),
    ]

    operations = [
        migrations.RunPython(seed_titles_and_roles, migrations.RunPython.noop),
    ]
