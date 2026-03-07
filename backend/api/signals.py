from django.db.models.signals import m2m_changed, post_save, pre_delete, post_delete, post_migrate
from django.dispatch import receiver
from django.core.exceptions import ValidationError
from django.contrib.admin.models import ADDITION, CHANGE, DELETION
from django.core.management import call_command
from .models import *
from .history_utils import log_addition, log_change
from landing.models import Event as LandingEvent

@receiver(m2m_changed, sender=Club.coaches.through)
def update_is_coach(sender, instance, action, pk_set, **kwargs):
    """
    Signal to update the is_coach field in Athlete when the coaches field in Club is modified.
    """
    if action in ['post_add', 'post_remove']:
        for athlete_id in pk_set:
            athlete = Athlete.objects.get(pk=athlete_id)
            if action == 'post_add':
                if not athlete.is_coach:  # Prevent unnecessary updates
                    athlete.is_coach = True
                    athlete.save()
            elif action == 'post_remove':
                # Check if the athlete is still a coach for other clubs
                if not athlete.coached_clubs.exists() and athlete.is_coach:
                    athlete.is_coach = False
                    athlete.save()

@receiver(post_save, sender=Athlete)
def update_club_coaches(sender, instance, **kwargs):
    """
    Signal to update the coaches field in Club when the is_coach field in Athlete is modified.
    """
    # Prevent recursion by checking if the athlete is already in the club's coaches
    if instance.is_coach:
        if instance.club and not instance.club.coaches.filter(pk=instance.pk).exists():
            instance.club.coaches.add(instance)
    else:
        if instance.club and instance.club.coaches.filter(pk=instance.pk).exists():
            instance.club.coaches.remove(instance)

@receiver(post_save, sender=GradeHistory)
def update_current_grade(sender, instance, **kwargs):
    """
    Signal to update the current_grade field in Athlete when a new GradeHistory is created.
    """
    athlete = instance.athlete
    athlete.current_grade = instance.grade
    athlete.save()

@receiver(m2m_changed, sender=CategoryAthleteScore.team_members.through)
def auto_generate_team_name(sender, instance, action, **kwargs):
    """
    Auto-generate team name when team members are added/changed for CategoryAthleteScore.
    """
    if action in ['post_add', 'post_remove', 'post_clear'] and instance.type == 'teams':
        # Auto-generate team name based on current team members
        if instance.team_members.exists():
            member_names = [f"{m.first_name} {m.last_name}" for m in instance.team_members.all()[:3]]
            auto_generated_name = f"{', '.join(member_names)}"
            if instance.team_members.count() > 3:
                auto_generated_name += f" (+{instance.team_members.count() - 3} more)"
            
            # Update team name if it's different
            if instance.team_name != auto_generated_name:
                instance.team_name = auto_generated_name
                instance.save(update_fields=['team_name'])

@receiver(post_save, sender=Team)
def validate_and_assign_places(sender, instance, **kwargs):
    """
    Validate team members and assign places after the team is saved.
    """
    # Validate that no team with the same set of athletes already exists
    team_members = instance.members.all()
    # Allow multiple teams with the same members - teams can compete in different categories/competitions
    # existing_teams = Team.objects.exclude(pk=instance.pk)
    # for team in existing_teams:
    #     if set(team.members.values_list('athlete', flat=True)) == set(team_members.values_list('athlete', flat=True)):
    #         raise ValueError("A team with the same members already exists.")

    # Team placement is now handled through the CategoryAthleteScore system
    # with team_members relationships, so no additional processing needed here


@receiver(post_save, sender=LandingEvent)
@receiver(post_save, sender=Event)
def create_default_competition_fields(sender, instance, created, **kwargs):
    """Create default Field 1-3 for competition events when created."""
    if not created:
        return
    if getattr(instance, 'event_type', None) != 'competition':
        return
    if CompetitionField.objects.filter(event=instance).exists():
        return

    CompetitionField.objects.bulk_create([
        CompetitionField(event=instance, name='Field 1', field_number=1, is_active=True),
        CompetitionField(event=instance, name='Field 2', field_number=2, is_active=True),
        CompetitionField(event=instance, name='Field 3', field_number=3, is_active=True),
    ])


@receiver(post_save, sender=LandingEvent)
@receiver(post_save, sender=Event)
def create_default_competition_groups(sender, instance, created, **kwargs):
    """
    Auto-create default age groups for competition events when created.
    Groups follow the Romanian Vovinam federation standard:
      Grupa 0  – ages 7-8   (2-year span)
      Grupa 1  – ages 9-12  (4-year span)
      Grupa 2  – ages 13-14 (2-year span)
      Grupa 3  – ages 15-17 (3-year span)
      Sen. Gr. Mici – 18+
      Sen. Gr. Mari – 18+
    Birth year ranges are computed from the competition start_date year.
    """
    if not created:
        return
    if getattr(instance, 'event_type', None) != 'competition':
        return
    if Group.objects.filter(event=instance).exists():
        return

    Y = instance.start_date.year

    # (name, oldest_age, youngest_age_or_None, allow_younger, allowed_grade_type)
    DEFAULT_GROUPS = [
        ('Grupa 0',       8,  7,    False, 'all'),
        ('Grupa 1',      12,  9,    False, 'all'),
        ('Grupa 2',      14, 13,    False, 'all'),
        ('Grupa 3',      17, 15,    False, 'all'),
        ('Sen. Gr. Mici', 18, None, True,  'inferior'),
        ('Sen. Gr. Mari', 18, None, True,  'superior'),
    ]

    groups = []
    for order, (name, oldest_age, youngest_age, allow_younger, allowed_grade_type) in enumerate(DEFAULT_GROUPS, start=1):
        birth_year_start = Y - oldest_age   # oldest athletes (lower year)
        birth_year_end = (Y - youngest_age) if youngest_age is not None else None
        groups.append(Group(
            event=instance,
            name=name,
            birth_year_start=birth_year_start,
            birth_year_end=birth_year_end,
            allow_younger=allow_younger,
            allowed_grade_type=allowed_grade_type,
            display_order=order,
        ))

    Group.objects.bulk_create(groups)

    # ── Auto-create default categories for each group ──
    _create_default_categories(instance, groups)


def _create_default_categories(event, groups):
    """
    Create the standard Vovinam competition categories for each group.
    Called after groups are created for a new competition event.
    """
    group_map = {g.name: g for g in Group.objects.filter(event=event)}

    # Helper: for Grupa 1 fight sub-ranges, split the group's 4-year span
    # into two halves: younger 2 years and older 2 years.
    g1 = group_map.get('Grupa 1')
    if g1 and g1.birth_year_start and g1.birth_year_end:
        span = g1.birth_year_end - g1.birth_year_start  # e.g. 2017-2014 = 3
        mid = g1.birth_year_start + span // 2            # e.g. 2014+1 = 2015
        g1_older = (g1.birth_year_start, mid)            # 2014-2015
        g1_younger = (mid + 1, g1.birth_year_end)        # 2016-2017
    else:
        g1_older = (None, None)
        g1_younger = (None, None)

    # Category definitions per group
    # Format: (group_name, name, gender, cat_type, birth_year_start, birth_year_end)
    # cat_type: 'solo', 'team', 'fight'
    CATS = []

    # ═══ Grupa 0 ═══
    CATS += [
        ('Grupa 0', 'KHOI QUYEN',     'male',   'solo', None, None),
        ('Grupa 0', 'NHAP MON QUYEN', 'male',   'solo', None, None),
        ('Grupa 0', 'KHOI QUYEN',     'female', 'solo', None, None),
        ('Grupa 0', 'NHAP MON QUYEN', 'female', 'solo', None, None),
    ]

    # ═══ Grupa 1 ═══
    CATS += [
        ('Grupa 1', 'NHAP MON QUYEN',          'male',   'solo', None, None),
        ('Grupa 1', 'THAP TU QUYEN',           'male',   'solo', None, None),
        ('Grupa 1', 'NHAP MON QUYEN',          'female', 'solo', None, None),
        ('Grupa 1', 'THAP TU QUYEN',           'female', 'solo', None, None),
        ('Grupa 1', 'Sincron KHOI QUYEN',      'male',   'team', None, None),
        ('Grupa 1', 'Sincron KHOI QUYEN',      'female', 'team', None, None),
        # Fight categories — younger sub-range
        ('Grupa 1', 'Lupta -30kg', 'male', 'fight', *g1_younger),
        ('Grupa 1', 'Lupta -36kg', 'male', 'fight', *g1_younger),
        # Fight categories — older sub-range
        ('Grupa 1', 'Lupta -40kg', 'male', 'fight', *g1_older),
        ('Grupa 1', 'Lupta -44kg', 'male', 'fight', *g1_older),
        ('Grupa 1', 'Lupta -48kg', 'male', 'fight', *g1_older),
        ('Grupa 1', 'Lupta -52kg', 'male', 'fight', *g1_older),
        ('Grupa 1', 'Lupta -56kg', 'male', 'fight', *g1_older),
        ('Grupa 1', 'Lupta -60kg', 'male', 'fight', *g1_older),
    ]

    # ═══ Grupa 2 ═══
    CATS += [
        ('Grupa 2', 'THAP TU QUYEN',           'male',   'solo', None, None),
        ('Grupa 2', 'LONG HO QUYEN',           'male',   'solo', None, None),
        ('Grupa 2', 'THLN KIEM PHAP',           'male',   'solo', None, None),
        ('Grupa 2', 'SONG LUYEN MOT',           'male',   'team', None, None),
        ('Grupa 2', 'THAP TU QUYEN',           'female', 'solo', None, None),
        ('Grupa 2', 'LONG HO QUYEN',           'female', 'solo', None, None),
        ('Grupa 2', 'THLN KIEM PHAP',           'female', 'solo', None, None),
        ('Grupa 2', 'SONG LUYEN MOT',           'female', 'team', None, None),
        ('Grupa 2', 'Sincron THAP TU QUYEN',   'male',   'team', None, None),
        ('Grupa 2', 'Sincron THAP TU QUYEN',   'female', 'team', None, None),
        # Fight — Male
        ('Grupa 2', 'Lupta -48kg',             'male',   'fight', None, None),
        ('Grupa 2', 'Lupta -52kg',             'male',   'fight', None, None),
        ('Grupa 2', 'Lupta -56kg',             'male',   'fight', None, None),
        ('Grupa 2', 'Lupta -60kg',             'male',   'fight', None, None),
        ('Grupa 2', 'Lupta -64kg',             'male',   'fight', None, None),
        ('Grupa 2', 'Lupta -72kg',             'male',   'fight', None, None),
        ('Grupa 2', 'Lupta +72kg',             'male',   'fight', None, None),
        # Fight — Female
        ('Grupa 2', 'Lupta -40kg',             'female', 'fight', None, None),
        ('Grupa 2', 'Lupta -44kg',             'female', 'fight', None, None),
        ('Grupa 2', 'Lupta -48kg',             'female', 'fight', None, None),
        ('Grupa 2', 'Lupta -52kg',             'female', 'fight', None, None),
        ('Grupa 2', 'Lupta -56kg',             'female', 'fight', None, None),
        ('Grupa 2', 'Lupta +56kg',             'female', 'fight', None, None),
    ]

    # ═══ Grupa 3 ═══
    CATS += [
        ('Grupa 3', 'THAP TU QUYEN',           'male',   'solo', None, None),
        ('Grupa 3', 'LONG HO QUYEN',           'male',   'solo', None, None),
        ('Grupa 3', 'THLN KIEM PHAP',           'male',   'solo', None, None),
        ('Grupa 3', 'SONG LUYEN MOT',           'male',   'team', None, None),
        ('Grupa 3', 'SONG LUYEN DAO',           'male',   'team', None, None),
        ('Grupa 3', 'THAP TU QUYEN',           'female', 'solo', None, None),
        ('Grupa 3', 'LONG HO QUYEN',           'female', 'solo', None, None),
        ('Grupa 3', 'THLN KIEM PHAP',           'female', 'solo', None, None),
        ('Grupa 3', 'SONG LUYEN MOT',           'female', 'team', None, None),
        ('Grupa 3', 'SONG LUYEN DAO',           'female', 'team', None, None),
        ('Grupa 3', 'Sincron THAP TU QUYEN',   'mixt',   'team', None, None),
        ('Grupa 3', 'TU VE NU GIOI',           'mixt',   'team', None, None),
        # Fight — Male
        ('Grupa 3', 'Lupta -56kg',             'male',   'fight', None, None),
        ('Grupa 3', 'Lupta -60kg',             'male',   'fight', None, None),
        ('Grupa 3', 'Lupta -64kg',             'male',   'fight', None, None),
        ('Grupa 3', 'Lupta -72kg',             'male',   'fight', None, None),
        ('Grupa 3', 'Lupta -80kg',             'male',   'fight', None, None),
        ('Grupa 3', 'Lupta +80kg',             'male',   'fight', None, None),
        # Fight — Female
        ('Grupa 3', 'Lupta -46kg',             'female', 'fight', None, None),
        ('Grupa 3', 'Lupta -56kg',             'female', 'fight', None, None),
        ('Grupa 3', 'Lupta -60kg',             'female', 'fight', None, None),
        ('Grupa 3', 'Lupta -64kg',             'female', 'fight', None, None),
        ('Grupa 3', 'Lupta -68kg',             'female', 'fight', None, None),
        ('Grupa 3', 'Lupta +68kg',             'female', 'fight', None, None),
    ]

    # ═══ Sen. Gr. Mici ═══
    CATS += [
        ('Sen. Gr. Mici', 'LONG HO QUYEN',     'male',   'solo', None, None),
        ('Sen. Gr. Mici', 'THLN KIEM PHAP',     'male',   'solo', None, None),
        ('Sen. Gr. Mici', 'SONG LUYEN MOT',     'male',   'team', None, None),
        ('Sen. Gr. Mici', 'LONG HO QUYEN',     'female', 'solo', None, None),
        ('Sen. Gr. Mici', 'THLN KIEM PHAP',     'female', 'solo', None, None),
        ('Sen. Gr. Mici', 'SONG LUYEN MOT',     'female', 'team', None, None),
    ]

    # ═══ Sen. Gr. Mari ═══
    CATS += [
        ('Sen. Gr. Mari', 'NGU MON QUYEN',          'male',   'solo', None, None),
        ('Sen. Gr. Mari', 'TTB THUC QUYEN',          'male',   'solo', None, None),
        ('Sen. Gr. Mari', 'THLN KIEM PHAP',          'male',   'solo', None, None),
        ('Sen. Gr. Mari', 'TT CON PHAP',             'male',   'solo', None, None),
        ('Sen. Gr. Mari', 'DAI DAO PHAP',             'male',   'solo', None, None),
        ('Sen. Gr. Mari', 'DCTCONG (3,4 ATH)',       'male',   'team', None, None),
        ('Sen. Gr. Mari', 'SONG LUYEN KIEM',         'male',   'team', None, None),
        ('Sen. Gr. Mari', 'SONG LUYEN MA TAU',       'male',   'team', None, None),
        ('Sen. Gr. Mari', 'SONG LUYEN BA',           'male',   'team', None, None),
        ('Sen. Gr. Mari', 'SONG LUYEN DAO',          'male',   'team', None, None),
        ('Sen. Gr. Mari', 'LONG HO QUYEN',          'female', 'solo', None, None),
        ('Sen. Gr. Mari', 'SONG DAO PHAP',           'female', 'solo', None, None),
        ('Sen. Gr. Mari', 'THLN KIEM PHAP',          'female', 'solo', None, None),
        ('Sen. Gr. Mari', 'THAI CUC DON DAO PHAP',  'female', 'solo', None, None),
        ('Sen. Gr. Mari', 'SONG LUYEN KIEM',         'female', 'team', None, None),
        ('Sen. Gr. Mari', 'SONG LUYEN MOT',          'female', 'team', None, None),
        ('Sen. Gr. Mari', 'Sincron LONG HO QUYEN',  'mixt',   'team', None, None),
        ('Sen. Gr. Mari', 'TU VE NU GIOI',          'mixt',   'team', None, None),
        ('Sen. Gr. Mari', 'DA LUYEN',                'mixt',   'team', None, None),
        # Fight — Male
        ('Sen. Gr. Mari', 'Lupta -65kg',             'male',   'fight', None, None),
        ('Sen. Gr. Mari', 'Lupta -70kg',             'male',   'fight', None, None),
        ('Sen. Gr. Mari', 'Lupta -75kg',             'male',   'fight', None, None),
        ('Sen. Gr. Mari', 'Lupta -80kg',             'male',   'fight', None, None),
        ('Sen. Gr. Mari', 'Lupta -85kg',             'male',   'fight', None, None),
        ('Sen. Gr. Mari', 'Lupta -90kg',             'male',   'fight', None, None),
        ('Sen. Gr. Mari', 'Lupta -95kg',             'male',   'fight', None, None),
        ('Sen. Gr. Mari', 'Lupta +95kg',             'male',   'fight', None, None),
    ]

    # Build category objects using the correct subclass
    TYPE_MODEL = {
        'solo': SoloCategory,
        'team': TeamCategory,
        'fight': FightCategory,
    }

    order = 0
    for grp_name, name, gender, cat_type, by_start, by_end in CATS:
        grp = group_map.get(grp_name)
        if not grp:
            continue
        order += 1
        Model = TYPE_MODEL[cat_type]
        Model.objects.create(
            name=name,
            event=event,
            group=grp,
            gender=gender,
            birth_year_start=by_start,
            birth_year_end=by_end,
            display_order=order,
        )


# Signal removed - team.name is now a computed property that auto-generates from members
# No need to manually update it when TeamMember is saved


# Change history tracking signals
# These signals create LogEntry records for objects created/modified via API
# so they show up in Django admin history views

MODELS_TO_LOG = [
    Athlete, Event, Category, Team, Match, 
    GradeHistory, CategoryAthleteScore, CategoryTeamScore,
    TrainingSeminarParticipation, Visa, FederationRole
]


def log_model_creation(sender, instance, created, **kwargs):
    """
    Create a LogEntry when a tracked model instance is created.
    Only logs if the user is available from the request context.
    """
    if created:
        # Try to get user from request if available
        user = getattr(instance, '_current_user', None)
        if user and not user.is_anonymous:
            log_addition(instance, user, f"Added via API")


def log_model_change(sender, instance, created, update_fields=None, **kwargs):
    """
    Create a LogEntry when a tracked model instance is modified.
    """
    if not created:
        user = getattr(instance, '_current_user', None)
        if user and not user.is_anonymous:
            log_change(instance, user, {})


# Register change logging for tracked models
for model in MODELS_TO_LOG:
    post_save.connect(log_model_creation, sender=model, dispatch_uid=f'{model.__name__}_log_addition')
    post_save.connect(log_model_change, sender=model, dispatch_uid=f'{model.__name__}_log_change')


@receiver(post_migrate)
def seed_default_cities(sender, **kwargs):
    if getattr(sender, "name", None) != "api":
        return
    if City.objects.exists():
        return
    try:
        call_command("import_ro_cities")
    except Exception:
        call_command("loaddata", "ro_cities_fallback")


@receiver(post_migrate)
def seed_default_competition_fields(sender, **kwargs):
    if getattr(sender, "name", None) != "api":
        return

    try:
        from landing.models import Event
        competitions = Event.objects.filter(event_type='competition')
        for ev in competitions:
            if CompetitionField.objects.filter(event=ev).exists():
                continue
            CompetitionField.objects.bulk_create([
                CompetitionField(event=ev, name='Field 1', field_number=1, is_active=True),
                CompetitionField(event=ev, name='Field 2', field_number=2, is_active=True),
                CompetitionField(event=ev, name='Field 3', field_number=3, is_active=True),
            ])
    except Exception:
        pass


@receiver(post_save, sender=TeamMember)
def update_team_name_on_member_add(sender, instance, created, **kwargs):
    """
    Update team name when a member is added.
    This refreshes the name from the @property method.
    """
    if created:
        team = instance.team
        members = team.members.select_related('athlete', 'athlete__club').all()[:3]
        if members:
            names = [f"{m.athlete.first_name} {m.athlete.last_name}" for m in members]
            base = " & ".join(names)
            total_members = team.members.count()
            
            # Add club name of first athlete if available
            first_member = team.members.select_related('athlete', 'athlete__club').first()
            club_suffix = ""
            if first_member and first_member.athlete.club:
                club_suffix = f" ({first_member.athlete.club.name})"
            
            if total_members > 3:
                generated_name = f"{base} (+{total_members - 3} more){club_suffix}"
            else:
                generated_name = f"{base}{club_suffix}"
            
            # Update the team name in database
            if team.name != generated_name:
                team.name = generated_name
                team.save(update_fields=['name'])


# ═══════════════════════════════════════════════════════════════════
# SYNC CategoryAthlete ↔ FightAthleteWeight for fight categories
# ═══════════════════════════════════════════════════════════════════

@receiver(post_save, sender=CategoryAthlete)
def sync_category_athlete_to_fight_weight(sender, instance, created, **kwargs):
    """
    When a CategoryAthlete is created/updated for a fight category,
    auto-create or update the corresponding FightAthleteWeight record.
    Copies enrollment weight → pre_weight_kg so it appears in the admin.
    """
    try:
        # Check if this category is a FightCategory
        fight_cat = FightCategory.objects.get(pk=instance.category_id)
    except FightCategory.DoesNotExist:
        return
    # Create or update FightAthleteWeight
    fw, fw_created = FightAthleteWeight.objects.get_or_create(
        category=fight_cat,
        athlete=instance.athlete,
    )
    # Sync enrollment weight → pre_weight_kg (only if enrollment has a weight)
    if instance.weight and (fw_created or not fw.pre_weight_kg):
        fw.pre_weight_kg = instance.weight
        fw.save(update_fields=['pre_weight_kg'])


@receiver(post_save, sender=FightAthleteWeight)
def sync_fight_weight_to_category_athlete(sender, instance, created, **kwargs):
    """
    When a FightAthleteWeight is created (e.g. from admin inline),
    auto-create the corresponding CategoryAthlete enrollment record.
    """
    if not created:
        return
    # category FK points to FightCategory which inherits from Category
    CategoryAthlete.objects.get_or_create(
        category_id=instance.category_id,
        athlete=instance.athlete,
    )


@receiver(post_delete, sender=CategoryAthlete)
def delete_fight_weight_on_unenroll(sender, instance, **kwargs):
    """
    When a CategoryAthlete is deleted (unenrolled) from a fight category,
    also remove the FightAthleteWeight record.
    """
    if getattr(instance, '_syncing', False):
        return
    for fw in FightAthleteWeight.objects.filter(category_id=instance.category_id, athlete=instance.athlete):
        fw._syncing = True
        fw.delete()


@receiver(post_delete, sender=FightAthleteWeight)
def delete_category_athlete_on_fight_weight_remove(sender, instance, **kwargs):
    """
    When a FightAthleteWeight is removed from admin,
    also remove the CategoryAthlete enrollment.
    """
    if getattr(instance, '_syncing', False):
        return
    for ca in CategoryAthlete.objects.filter(category_id=instance.category_id, athlete=instance.athlete):
        ca._syncing = True
        ca.delete()
