from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("news", "0002_delete_newspostgalleryproxy_delete_newspostproxy"),
        ("news", "0002_rename_proxy_models"),
    ]

    operations = [
        # Merge migration: no runtime operations required. This resolves the
        # two conflicting 0002 branches (one that deleted proxy models and
        # another that renamed them). Keeping a merge record so the
        # migration graph is consistent.
    ]
