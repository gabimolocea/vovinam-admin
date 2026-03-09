from django.db.models.signals import m2m_changed, post_save, pre_delete, post_delete, post_migrate
from django.dispatch import receiver
from django.core.exceptions import ValidationError
from django.contrib.admin.models import ADDITION, CHANGE, DELETION
from django.core.management import call_command
from .models import *
from .competition_defaults import ensure_standard_competition_groups_and_categories
from .grade_catalog import sync_default_grades
from .history_utils import log_addition, log_change
from landing.models import Event as LandingEvent


@receiver(post_migrate)
def ensure_default_grades(sender, **kwargs):
    if getattr(sender, 'name', None) != 'api':
        return
    try:
        sync_default_grades(prune_unused=True)
    except Exception:
        # Keep migrations resilient if tables are not fully ready yet.
        pass

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
            auto_generated_name = build_team_display_name(
                instance.team_members.select_related('club').all()
            )
            
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
    """Create 2 default terenuri for competition events when created."""
    if not created:
        return
    if getattr(instance, 'event_type', None) != 'competition':
        return
    if CompetitionField.objects.filter(event=instance).exists():
        return

    CompetitionField.objects.bulk_create([
        CompetitionField(event=instance, name='Teren 1', field_number=1, is_active=True),
        CompetitionField(event=instance, name='Teren 2', field_number=2, is_active=True),
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
    ensure_standard_competition_groups_and_categories(instance)


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
                CompetitionField(event=ev, name='Teren 1', field_number=1, is_active=True),
                CompetitionField(event=ev, name='Teren 2', field_number=2, is_active=True),
            ])
    except Exception:
        pass


@receiver(post_save, sender=TeamMember)
def update_team_name_on_member_add(sender, instance, created, **kwargs):
    """
    Team name is computed dynamically from members.
    No database write is needed when members change.
    """
    return


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
