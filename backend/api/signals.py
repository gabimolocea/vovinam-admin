from django.apps import apps as django_apps
from django.db.models import Q
from django.db.models.signals import m2m_changed, post_save, pre_delete, pre_save, post_delete, post_migrate
from django.dispatch import receiver
from django.core.exceptions import ValidationError
from django.contrib.admin.models import LogEntry
from django.core.management import call_command
from .models import *
from .competition_defaults import ensure_standard_competition_groups_and_categories
from .grade_catalog import sync_default_grades
from .history_utils import log_addition, log_change, log_deletion
from .request_context import get_current_user, is_admin_request
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


@receiver(pre_delete, sender=Club)
def capture_club_coaches_before_delete(sender, instance, **kwargs):
    """
    Deleting a Club cascades the Club<->Athlete coaches M2M rows at the DB
    level without firing m2m_changed, so `update_is_coach` never runs and
    former coaches would be left permanently stuck with is_coach=True and no
    club. Capture the affected athlete ids here so post_delete can recompute
    their is_coach flag once the club (and its M2M rows) are actually gone.
    """
    instance._coach_ids_before_delete = list(instance.coaches.values_list('pk', flat=True))


@receiver(post_delete, sender=Club)
def reset_is_coach_after_club_delete(sender, instance, **kwargs):
    athlete_ids = getattr(instance, '_coach_ids_before_delete', [])
    if not athlete_ids:
        return
    for athlete in Athlete.objects.filter(pk__in=athlete_ids, is_coach=True):
        if not athlete.coached_clubs.exists():
            athlete.is_coach = False
            athlete.save(update_fields=['is_coach'])

@receiver(post_save, sender=GradeHistory)
def update_current_grade(sender, instance, **kwargs):
    """
    Signal to keep Athlete.current_grade in sync whenever a GradeHistory row
    is saved (created, edited, or transitioned via approve/reject/
    request_revision). Delegates to Athlete.update_current_grade(), the single
    canonical rule: current_grade is always the highest-ranked *approved*
    GradeHistory entry, so pending/rejected entries never overwrite it.
    """
    instance.athlete.update_current_grade()

@receiver(post_delete, sender=GradeHistory)
def update_current_grade_on_delete(sender, instance, **kwargs):
    """
    Keep Athlete.current_grade in sync when a GradeHistory row is deleted
    (e.g. an admin removes a wrongly-approved entry). Without this, deleting
    the highest-ranked approved GradeHistory would leave a stale
    current_grade pointing at a record that no longer exists.
    """
    try:
        instance.athlete.update_current_grade()
    except Athlete.DoesNotExist:
        pass

@receiver(post_save, sender=Athlete)
def sync_athlete_name_to_user(sender, instance, **kwargs):
    """
    Sync first_name/last_name from Athlete to linked User account.
    """
    if not instance.user_id:
        return
    try:
        user = instance.user
        changed = False
        if user.first_name != instance.first_name:
            user.first_name = instance.first_name
            changed = True
        if user.last_name != instance.last_name:
            user.last_name = instance.last_name
            changed = True
        if changed:
            User.objects.filter(pk=user.pk).update(
                first_name=instance.first_name,
                last_name=instance.last_name,
            )
    except Exception:
        pass

@receiver(post_save, sender=User)
def sync_user_name_to_athlete(sender, instance, **kwargs):
    """
    Sync first_name/last_name from User to linked Athlete profile.
    """
    try:
        athlete = instance.athlete
    except Exception:
        return
    if not athlete:
        return
    changed = False
    if athlete.first_name != instance.first_name:
        athlete.first_name = instance.first_name
        changed = True
    if athlete.last_name != instance.last_name:
        athlete.last_name = instance.last_name
        changed = True
    if changed:
        Athlete.objects.filter(pk=athlete.pk).update(
            first_name=instance.first_name,
            last_name=instance.last_name,
        )

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


def _get_history_user(instance):
    user = getattr(instance, '_current_user', None)
    if user and not getattr(user, 'is_anonymous', True):
        return user
    return get_current_user()


def _should_log_history(instance):
    user = _get_history_user(instance)
    if not user:
        return False
    if is_admin_request():
        return False
    return True


def _serialize_history_value(value):
    if value is None:
        return ''
    if hasattr(value, 'isoformat'):
        try:
            return value.isoformat()
        except Exception:
            pass
    return str(value)


def _get_changed_fields(instance):
    original = getattr(instance, '_history_original_values', None) or {}
    changed_fields = {}

    for field in instance._meta.concrete_fields:
        old_value = original.get(field.attname)
        new_value = getattr(instance, field.attname, None)
        if old_value != new_value:
            changed_fields[field.name] = [
                _serialize_history_value(old_value),
                _serialize_history_value(new_value),
            ]

    return changed_fields


def capture_original_values(sender, instance, **kwargs):
    if not getattr(instance, 'pk', None):
        return
    try:
        current = sender.objects.filter(pk=instance.pk).values().first() or {}
    except Exception:
        current = {}
    instance._history_original_values = current


def log_model_creation(sender, instance, created, **kwargs):
    if not created or not _should_log_history(instance):
        return
    user = _get_history_user(instance)
    log_addition(instance, user, 'Added via API')


def log_model_change(sender, instance, created, update_fields=None, **kwargs):
    if created or not _should_log_history(instance):
        return
    user = _get_history_user(instance)
    changes = _get_changed_fields(instance)
    log_change(instance, user, changes)


def log_model_deletion(sender, instance, **kwargs):
    if not _should_log_history(instance):
        return
    user = _get_history_user(instance)
    log_deletion(instance, user, 'Deleted via API')


def _models_to_log():
    tracked_models = []
    for model in django_apps.get_app_config('api').get_models():
        opts = model._meta
        if opts.abstract or opts.proxy or opts.auto_created:
            continue
        tracked_models.append(model)
    try:
        tracked_models.append(LandingEvent)
    except Exception:
        pass
    return tracked_models


for model in _models_to_log():
    if model is LogEntry:
        continue
    pre_save.connect(capture_original_values, sender=model, dispatch_uid=f'{model.__name__}_capture_original_values')
    post_save.connect(log_model_creation, sender=model, dispatch_uid=f'{model.__name__}_log_addition')
    post_save.connect(log_model_change, sender=model, dispatch_uid=f'{model.__name__}_log_change')
    post_delete.connect(log_model_deletion, sender=model, dispatch_uid=f'{model.__name__}_log_deletion')


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


def _ensure_event_participation_for_category(athlete, category):
    event = getattr(category, 'event', None)
    if not athlete or not event:
        return

    participation = (
        TrainingSeminarParticipation.objects
        .filter(athlete=athlete)
        .filter(Q(event=event) | Q(seminar=event))
        .order_by('-event_id', 'id')
        .first()
    )

    if participation is None:
        TrainingSeminarParticipation.objects.create(
            athlete=athlete,
            event=event,
            seminar=event,
            submitted_by_athlete=False,
            status='approved',
        )
        return

    update_fields = []
    if participation.event_id is None:
        participation.event = event
        update_fields.append('event')
    if participation.seminar_id is None:
        participation.seminar = event
        update_fields.append('seminar')
    if update_fields:
        participation.save(update_fields=update_fields)


def _ensure_event_participations_for_team(category, team):
    if not category or not team:
        return
    for member in team.members.select_related('athlete'):
        if member.athlete_id:
            _ensure_event_participation_for_category(member.athlete, category)


@receiver(post_save, sender=CategoryAthlete)
def sync_category_athlete_to_event_participation(sender, instance, **kwargs):
    _ensure_event_participation_for_category(instance.athlete, instance.category)


@receiver(post_save, sender=CategoryTeam)
def sync_category_team_to_event_participations(sender, instance, **kwargs):
    _ensure_event_participations_for_team(instance.category, instance.team)


@receiver(post_save, sender=TeamMember)
def sync_team_member_to_event_participations(sender, instance, **kwargs):
    for category_team in instance.team.enrolled_categories.select_related('category'):
        _ensure_event_participation_for_category(instance.athlete, category_team.category)


@receiver(post_save, sender=CategoryAthleteScore)
def sync_category_score_to_event_participation(sender, instance, **kwargs):
    if instance.athlete_id:
        _ensure_event_participation_for_category(instance.athlete, instance.category)


@receiver(m2m_changed, sender=CategoryAthleteScore.team_members.through)
def sync_category_score_team_members_to_event_participations(sender, instance, action, pk_set, **kwargs):
    if action not in {'post_add', 'post_set'} or not pk_set:
        return
    if instance.type != 'teams':
        return
    for athlete in Athlete.objects.filter(pk__in=pk_set):
        _ensure_event_participation_for_category(athlete, instance.category)


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


@receiver(post_save, sender=CategoryTeam)
def sync_admin_scores_to_referee_scores(sender, instance, **kwargs):
    """
    When admin enters ref1_score...ref5_score on CategoryTeam (Echipe Inscrise inline),
    sync them to CategoryRefereeScore so they appear on the public display screen.
    Maps each score slot to the actual assigned referee for that slot
    (CategoryRefereeAssignment.referee_1...referee_5).
    If a slot has no assigned referee, creates/reuses a placeholder athlete
    'Arbitru Admin N' and assigns it to the slot so the score appears in the correct column.
    """
    if getattr(instance, '_syncing_ref_scores', False):
        return

    ref_scores = [
        instance.ref1_score,
        instance.ref2_score,
        instance.ref3_score,
        instance.ref4_score,
        instance.ref5_score,
    ]

    # Only run if at least one score is set
    if not any(s is not None for s in ref_scores):
        return

    # Get the athletes in this team
    team_athletes = [
        m.athlete for m in instance.team.members.select_related('athlete').all()
        if m.athlete_id
    ]
    if not team_athletes:
        return

    # Find or create a CategoryAthleteScore for this team+category
    cas = (
        CategoryAthleteScore.objects
        .filter(category_id=instance.category_id, type='teams', team_members__in=team_athletes)
        .distinct()
        .first()
    )
    if not cas:
        cas = CategoryAthleteScore.objects.create(
            category_id=instance.category_id,
            athlete=team_athletes[0],
            type='teams',
            status='approved',
        )
        cas.team_members.set(team_athletes)

    # Get or create CategoryRefereeAssignment for this category
    assignment, _ = CategoryRefereeAssignment.objects.get_or_create(
        category_id=instance.category_id
    )

    # For each slot, resolve referee: use assigned one or create placeholder
    resolved_refs = []
    assignment_changed = False
    for i, score in enumerate(ref_scores, start=1):
        assigned_ref_id = getattr(assignment, f'referee_{i}_id', None)
        if assigned_ref_id:
            try:
                resolved_refs.append(Athlete.objects.get(pk=assigned_ref_id))
            except Athlete.DoesNotExist:
                assigned_ref_id = None

        if not assigned_ref_id:
            # Create or reuse placeholder and assign to slot
            placeholder, created = Athlete.objects.get_or_create(
                first_name='Arbitru',
                last_name=f'Admin {i}',
                defaults={'is_referee': True, 'status': 'approved'},
            )
            if not placeholder.is_referee:
                placeholder.is_referee = True
                placeholder._syncing_ref_scores = True
                placeholder.save(update_fields=['is_referee'])
            setattr(assignment, f'referee_{i}', placeholder)
            assignment_changed = True
            resolved_refs.append(placeholder)

    if assignment_changed:
        assignment._syncing_ref_scores = True
        assignment.save()

    # Admin override: clear all existing referee scores for this CAS, then recreate
    CategoryRefereeScore.objects.filter(athlete_score=cas).delete()

    for ref, score in zip(resolved_refs, ref_scores):
        if score is not None:
            CategoryRefereeScore.objects.create(
                athlete_score=cas,
                referee=ref,
                score=score,
            )
