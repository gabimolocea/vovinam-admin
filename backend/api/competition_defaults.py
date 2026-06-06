from django.utils.dateparse import parse_date, parse_datetime

from .models import FightCategory, Group, SoloCategory, TeamCategory


def _extract_event_year(event):
    start_date = getattr(event, 'start_date', None)
    if hasattr(start_date, 'year'):
        return start_date.year
    if isinstance(start_date, str):
        parsed = parse_datetime(start_date) or parse_date(start_date)
        if parsed and hasattr(parsed, 'year'):
            return parsed.year
    raise ValueError('Event start_date is missing or invalid.')


DEFAULT_GROUPS = [
    ('Grupa 0', 8, 7, False, 'all'),
    ('Grupa 1', 12, 9, False, 'all'),
    ('Grupa 2', 14, 13, False, 'all'),
    ('Grupa 3', 17, 15, False, 'all'),
    ('Sen. Gr. Mici', 18, None, True, 'inferior'),
    ('Sen. Gr. Mari', 18, None, True, 'superior'),
]


TYPE_MODEL = {
    'solo': SoloCategory,
    'team': TeamCategory,
    'fight': FightCategory,
}


def build_default_category_definitions(group_map):
    g1 = group_map.get('Grupa 1')
    if g1 and g1.birth_year_start and g1.birth_year_end:
        span = g1.birth_year_end - g1.birth_year_start
        mid = g1.birth_year_start + span // 2
        g1_older = (g1.birth_year_start, mid)
        g1_younger = (mid + 1, g1.birth_year_end)
    else:
        g1_older = (None, None)
        g1_younger = (None, None)

    cats = []

    cats += [
        ('Grupa 0', 'KHOI QUYEN', 'male', 'solo', None, None),
        ('Grupa 0', 'NHAP MON QUYEN', 'male', 'solo', None, None),
        ('Grupa 0', 'KHOI QUYEN', 'female', 'solo', None, None),
        ('Grupa 0', 'NHAP MON QUYEN', 'female', 'solo', None, None),
    ]

    cats += [
        ('Grupa 1', 'NHAP MON QUYEN', 'male', 'solo', None, None),
        ('Grupa 1', 'THAP TU QUYEN', 'male', 'solo', None, None),
        ('Grupa 1', 'NHAP MON QUYEN', 'female', 'solo', None, None),
        ('Grupa 1', 'THAP TU QUYEN', 'female', 'solo', None, None),
        ('Grupa 1', 'Sincron KHOI QUYEN', 'male', 'team', None, None),
        ('Grupa 1', 'Sincron KHOI QUYEN', 'female', 'team', None, None),
        ('Grupa 1', 'Lupta -30kg', 'male', 'fight', *g1_younger),
        ('Grupa 1', 'Lupta -36kg', 'male', 'fight', *g1_younger),
        ('Grupa 1', 'Lupta -40kg', 'male', 'fight', *g1_older),
        ('Grupa 1', 'Lupta -44kg', 'male', 'fight', *g1_older),
        ('Grupa 1', 'Lupta -48kg', 'male', 'fight', *g1_older),
        ('Grupa 1', 'Lupta -52kg', 'male', 'fight', *g1_older),
        ('Grupa 1', 'Lupta -56kg', 'male', 'fight', *g1_older),
        ('Grupa 1', 'Lupta -60kg', 'male', 'fight', *g1_older),
    ]

    cats += [
        ('Grupa 2', 'THAP TU QUYEN', 'male', 'solo', None, None),
        ('Grupa 2', 'LONG HO QUYEN', 'male', 'solo', None, None),
        ('Grupa 2', 'THLN KIEM PHAP', 'male', 'solo', None, None),
        ('Grupa 2', 'SONG LUYEN MOT', 'male', 'team', None, None),
        ('Grupa 2', 'THAP TU QUYEN', 'female', 'solo', None, None),
        ('Grupa 2', 'LONG HO QUYEN', 'female', 'solo', None, None),
        ('Grupa 2', 'THLN KIEM PHAP', 'female', 'solo', None, None),
        ('Grupa 2', 'SONG LUYEN MOT', 'female', 'team', None, None),
        ('Grupa 2', 'Sincron THAP TU QUYEN', 'male', 'team', None, None),
        ('Grupa 2', 'Sincron THAP TU QUYEN', 'female', 'team', None, None),
        ('Grupa 2', 'Lupta -48kg', 'male', 'fight', None, None),
        ('Grupa 2', 'Lupta -52kg', 'male', 'fight', None, None),
        ('Grupa 2', 'Lupta -56kg', 'male', 'fight', None, None),
        ('Grupa 2', 'Lupta -60kg', 'male', 'fight', None, None),
        ('Grupa 2', 'Lupta -64kg', 'male', 'fight', None, None),
        ('Grupa 2', 'Lupta -72kg', 'male', 'fight', None, None),
        ('Grupa 2', 'Lupta +72kg', 'male', 'fight', None, None),
        ('Grupa 2', 'Lupta -40kg', 'female', 'fight', None, None),
        ('Grupa 2', 'Lupta -44kg', 'female', 'fight', None, None),
        ('Grupa 2', 'Lupta -48kg', 'female', 'fight', None, None),
        ('Grupa 2', 'Lupta -52kg', 'female', 'fight', None, None),
        ('Grupa 2', 'Lupta -56kg', 'female', 'fight', None, None),
        ('Grupa 2', 'Lupta +56kg', 'female', 'fight', None, None),
    ]

    cats += [
        ('Grupa 3', 'THAP TU QUYEN', 'male', 'solo', None, None),
        ('Grupa 3', 'LONG HO QUYEN', 'male', 'solo', None, None),
        ('Grupa 3', 'THLN KIEM PHAP', 'male', 'solo', None, None),
        ('Grupa 3', 'SONG LUYEN MOT', 'male', 'team', None, None),
        ('Grupa 3', 'SONG LUYEN DAO', 'male', 'team', None, None),
        ('Grupa 3', 'THAP TU QUYEN', 'female', 'solo', None, None),
        ('Grupa 3', 'LONG HO QUYEN', 'female', 'solo', None, None),
        ('Grupa 3', 'THLN KIEM PHAP', 'female', 'solo', None, None),
        ('Grupa 3', 'SONG LUYEN MOT', 'female', 'team', None, None),
        ('Grupa 3', 'SONG LUYEN DAO', 'female', 'team', None, None),
        ('Grupa 3', 'Sincron THAP TU QUYEN', 'mixt', 'team', None, None),
        ('Grupa 3', 'TU VE NU GIOI', 'mixt', 'team', None, None),
        ('Grupa 3', 'Lupta -56kg', 'male', 'fight', None, None),
        ('Grupa 3', 'Lupta -60kg', 'male', 'fight', None, None),
        ('Grupa 3', 'Lupta -64kg', 'male', 'fight', None, None),
        ('Grupa 3', 'Lupta -72kg', 'male', 'fight', None, None),
        ('Grupa 3', 'Lupta -80kg', 'male', 'fight', None, None),
        ('Grupa 3', 'Lupta +80kg', 'male', 'fight', None, None),
        ('Grupa 3', 'Lupta -46kg', 'female', 'fight', None, None),
        ('Grupa 3', 'Lupta -56kg', 'female', 'fight', None, None),
        ('Grupa 3', 'Lupta -60kg', 'female', 'fight', None, None),
        ('Grupa 3', 'Lupta -64kg', 'female', 'fight', None, None),
        ('Grupa 3', 'Lupta -68kg', 'female', 'fight', None, None),
        ('Grupa 3', 'Lupta +68kg', 'female', 'fight', None, None),
    ]

    cats += [
        ('Sen. Gr. Mici', 'LONG HO QUYEN', 'male', 'solo', None, None),
        ('Sen. Gr. Mici', 'THLN KIEM PHAP', 'male', 'solo', None, None),
        ('Sen. Gr. Mici', 'SONG LUYEN MOT', 'male', 'team', None, None),
        ('Sen. Gr. Mici', 'LONG HO QUYEN', 'female', 'solo', None, None),
        ('Sen. Gr. Mici', 'THLN KIEM PHAP', 'female', 'solo', None, None),
        ('Sen. Gr. Mici', 'SONG LUYEN MOT', 'female', 'team', None, None),
    ]

    cats += [
        ('Sen. Gr. Mari', 'NGU MON QUYEN', 'male', 'solo', None, None),
        ('Sen. Gr. Mari', 'TTB THUC QUYEN', 'male', 'solo', None, None),
        ('Sen. Gr. Mari', 'THLN KIEM PHAP', 'male', 'solo', None, None),
        ('Sen. Gr. Mari', 'TT CON PHAP', 'male', 'solo', None, None),
        ('Sen. Gr. Mari', 'DAI DAO PHAP', 'male', 'solo', None, None),
        ('Sen. Gr. Mari', 'DCTCONG (3,4 ATH)', 'male', 'team', None, None),
        ('Sen. Gr. Mari', 'SONG LUYEN KIEM', 'male', 'team', None, None),
        ('Sen. Gr. Mari', 'SONG LUYEN MA TAU', 'male', 'team', None, None),
        ('Sen. Gr. Mari', 'SONG LUYEN BA', 'male', 'team', None, None),
        ('Sen. Gr. Mari', 'SONG LUYEN DAO', 'male', 'team', None, None),
        ('Sen. Gr. Mari', 'LONG HO QUYEN', 'female', 'solo', None, None),
        ('Sen. Gr. Mari', 'SONG DAO PHAP', 'female', 'solo', None, None),
        ('Sen. Gr. Mari', 'THLN KIEM PHAP', 'female', 'solo', None, None),
        ('Sen. Gr. Mari', 'THAI CUC DON DAO PHAP', 'female', 'solo', None, None),
        ('Sen. Gr. Mari', 'SONG LUYEN KIEM', 'female', 'team', None, None),
        ('Sen. Gr. Mari', 'SONG LUYEN MOT', 'female', 'team', None, None),
        ('Sen. Gr. Mari', 'Sincron LONG HO QUYEN', 'mixt', 'team', None, None),
        ('Sen. Gr. Mari', 'TU VE NU GIOI', 'mixt', 'team', None, None),
        ('Sen. Gr. Mari', 'DA LUYEN', 'mixt', 'team', None, None),
        ('Sen. Gr. Mari', 'Lupta -65kg', 'male', 'fight', None, None),
        ('Sen. Gr. Mari', 'Lupta -70kg', 'male', 'fight', None, None),
        ('Sen. Gr. Mari', 'Lupta -75kg', 'male', 'fight', None, None),
        ('Sen. Gr. Mari', 'Lupta -80kg', 'male', 'fight', None, None),
        ('Sen. Gr. Mari', 'Lupta -85kg', 'male', 'fight', None, None),
        ('Sen. Gr. Mari', 'Lupta -90kg', 'male', 'fight', None, None),
        ('Sen. Gr. Mari', 'Lupta -95kg', 'male', 'fight', None, None),
        ('Sen. Gr. Mari', 'Lupta +95kg', 'male', 'fight', None, None),
    ]

    return cats


def ensure_standard_competition_groups_and_categories(event):
    if not event or getattr(event, 'event_type', None) != 'competition':
        return {'groups_created': 0, 'groups_updated': 0, 'categories_created': 0, 'categories_updated': 0}

    year = _extract_event_year(event)
    groups_created = 0
    groups_updated = 0

    for order, (name, oldest_age, youngest_age, allow_younger, allowed_grade_type) in enumerate(DEFAULT_GROUPS, start=1):
        birth_year_start = year - oldest_age
        birth_year_end = (year - youngest_age) if youngest_age is not None else None
        group, created = Group.objects.get_or_create(
            event=event,
            name=name,
            defaults={
                'birth_year_start': birth_year_start,
                'birth_year_end': birth_year_end,
                'allow_younger': allow_younger,
                'allowed_grade_type': allowed_grade_type,
                'display_order': order,
            },
        )
        if created:
            groups_created += 1
            continue

        updated_fields = []
        if group.birth_year_start != birth_year_start:
            group.birth_year_start = birth_year_start
            updated_fields.append('birth_year_start')
        if group.birth_year_end != birth_year_end:
            group.birth_year_end = birth_year_end
            updated_fields.append('birth_year_end')
        if group.allow_younger != allow_younger:
            group.allow_younger = allow_younger
            updated_fields.append('allow_younger')
        if group.allowed_grade_type != allowed_grade_type:
            group.allowed_grade_type = allowed_grade_type
            updated_fields.append('allowed_grade_type')
        if group.display_order != order:
            group.display_order = order
            updated_fields.append('display_order')
        if updated_fields:
            group.save(update_fields=updated_fields)
            groups_updated += 1

    group_map = {g.name: g for g in Group.objects.filter(event=event)}
    category_defs = build_default_category_definitions(group_map)
    categories_created = 0
    categories_updated = 0

    for order, (group_name, name, gender, cat_type, birth_year_start, birth_year_end) in enumerate(category_defs, start=1):
        group = group_map.get(group_name)
        if not group:
            continue
        model = TYPE_MODEL[cat_type]
        category = model.objects.filter(
            event=event,
            group=group,
            name=name,
            gender=gender,
            birth_year_start=birth_year_start,
            birth_year_end=birth_year_end,
        ).order_by('id').first()
        if category is None:
            model.objects.create(
                name=name,
                event=event,
                group=group,
                gender=gender,
                birth_year_start=birth_year_start,
                birth_year_end=birth_year_end,
                display_order=order,
            )
            categories_created += 1
            continue
        if category.display_order != order:
            category.display_order = order
            category.save(update_fields=['display_order'])
            categories_updated += 1

    return {
        'groups_created': groups_created,
        'groups_updated': groups_updated,
        'categories_created': categories_created,
        'categories_updated': categories_updated,
    }
