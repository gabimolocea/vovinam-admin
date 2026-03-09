from django.db import transaction

from .models import Grade, GradeHistory


# Master-grade entries are stored as `superior` because the current schema
# only supports `inferior` and `superior`.
DEFAULT_GRADES = [
    # Grade Copii <14 ani
    {'rank_order': 1, 'name': 'CENTURA ALBASTRĂ, 1 CẦP ROŞU', 'grade_type': 'inferior'},
    {'rank_order': 2, 'name': 'CENTURA ALBASTRĂ, 2 CẦP ROŞII', 'grade_type': 'inferior'},
    {'rank_order': 3, 'name': 'CENTURA ALBASTRĂ, 3 CẦP ROŞII', 'grade_type': 'inferior'},
    {'rank_order': 4, 'name': 'CENTURA ALBASTRĂ, 4 CẦP ROŞII', 'grade_type': 'inferior'},
    {'rank_order': 5, 'name': 'CENTURA ALBASTRĂ, 5 CẦP ROŞII', 'grade_type': 'inferior'},
    {'rank_order': 6, 'name': 'CENTURA ALBASTRĂ, 6 CẦP ROŞII', 'grade_type': 'inferior'},
    {'rank_order': 7, 'name': 'CENTURA ALBASTRĂ, 7 CẦP ROŞII', 'grade_type': 'inferior'},
    {'rank_order': 8, 'name': 'CENTURA ALBASTRĂ, 8 CẦP ROŞII', 'grade_type': 'inferior'},
    # Grade Juniori >14 ani si adulti
    {'rank_order': 9, 'name': 'CENTURA ALBASTRĂ', 'grade_type': 'inferior'},
    {'rank_order': 10, 'name': 'CENTURĂ ALBASTRĂ, 1 CẦP GALBEN', 'grade_type': 'inferior'},
    {'rank_order': 11, 'name': 'CENTURĂ ALBASTRĂ, 2 CẦP GALBEN', 'grade_type': 'inferior'},
    {'rank_order': 12, 'name': 'CENTURĂ ALBASTRĂ, 3 CẦP GALBEN', 'grade_type': 'inferior'},
    {'rank_order': 13, 'name': 'CENTURĂ GALBENĂ', 'grade_type': 'superior'},
    {'rank_order': 14, 'name': 'CENTURĂ GALBENĂ, 1 DANG', 'grade_type': 'superior'},
    {'rank_order': 15, 'name': 'CENTURĂ GALBENĂ, 2 DANG', 'grade_type': 'superior'},
    {'rank_order': 16, 'name': 'CENTURĂ GALBENĂ, 3 DANG', 'grade_type': 'superior'},
    {'rank_order': 17, 'name': 'CENTURĂ ROŞIE, MARGINE GALBENĂ', 'grade_type': 'superior'},
    {'rank_order': 18, 'name': 'CENTURĂ ROŞIE, 5 DANG', 'grade_type': 'superior'},
    {'rank_order': 19, 'name': 'CENTURĂ ROŞIE, 6 DANG', 'grade_type': 'superior'},
    {'rank_order': 20, 'name': 'CENTURĂ ROŞIE, 7 DANG', 'grade_type': 'superior'},
]


@transaction.atomic
def sync_default_grades(prune_unused=True):
    """Sync the canonical grade catalog into the database.

    Grades are keyed by `rank_order`. Existing rows for those ranks are updated
    in place to preserve foreign-key references.
    """
    kept_ids = set()

    for entry in DEFAULT_GRADES:
        rank = entry['rank_order']
        grade = Grade.objects.filter(rank_order=rank).order_by('id').first()
        if grade:
            changed = False
            for field in ('name', 'grade_type'):
                if getattr(grade, field) != entry[field]:
                    setattr(grade, field, entry[field])
                    changed = True
            if changed:
                grade.save(update_fields=['name', 'grade_type', 'modified'])
        else:
            grade = Grade.objects.create(**entry)

        kept_ids.add(grade.id)

    if prune_unused:
        extras = Grade.objects.exclude(id__in=kept_ids)
        for extra in extras:
            if extra.current_athletes.exists():
                continue
            if GradeHistory.objects.filter(grade=extra).exists():
                continue
            extra.delete()

    return Grade.objects.filter(id__in=kept_ids).order_by('rank_order')