from django.db import migrations


def seed_default_grades(apps, schema_editor):
    Grade = apps.get_model("api", "Grade")
    if Grade.objects.exists():
        return

    grades = [
        ("Centura Albastră", "inferior"),
        ("Centura Albastră – 1 Tresa roșie", "inferior"),
        ("Centura Albastră – 2 Trese roșii", "inferior"),
        ("Centura Albastră – 3 Trese roșii", "inferior"),
        ("Centura Albastră – 4 Trese roșii", "inferior"),
        ("Centura Albastră – 5 Trese roșii", "inferior"),
        ("Centura Albastră – 6 Trese roșii", "inferior"),
        ("Centura Albastră – 7 Trese roșii", "inferior"),
        ("Centura Albastră – 8 Trese roșii", "inferior"),
        ("Centura Albastră – 1 Tresa galbenă", "inferior"),
        ("Centura Albastră – 2 Trese galbene", "inferior"),
        ("Centura Albastră – 3 Trese galbene", "inferior"),
        ("Centura Galbenă – Dang 1", "superior"),
        ("Centura Galbenă – Dang 2", "superior"),
        ("Centura Galbenă – Dang 3", "superior"),
        ("Centura Roșie – Dang 4", "superior"),
        ("Centura Roșie – Dang 5", "superior"),
        ("Centura Roșie – Dang 6", "superior"),
    ]

    for index, (name, grade_type) in enumerate(grades, start=1):
        Grade.objects.create(name=name, grade_type=grade_type, rank_order=index)


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0062_create_trainingseminar_table"),
    ]

    operations = [
        migrations.RunPython(seed_default_grades, migrations.RunPython.noop),
    ]
