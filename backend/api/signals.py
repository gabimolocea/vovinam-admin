from django.db.models.signals import m2m_changed, post_save, pre_delete, post_migrate
from django.dispatch import receiver
from django.core.exceptions import ValidationError
from django.contrib.admin.models import ADDITION, CHANGE, DELETION
from django.core.management import call_command
from .models import *
from .history_utils import log_addition, log_change

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
