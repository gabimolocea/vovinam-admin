"""Record "Participare" for athletes who competed without reaching the podium.

Everyone enrolled in a competition category gets a result once the
competition's results are in: their place if they reached the podium, or
"Participare" otherwise - so an athlete's "Rezultate" tab shows every
competition they took part in, not only the ones they won something at.

Run by record_participations(event): after a venue's results are imported
(api.sync.import_event_results), from the event's admin page, and by the
`record_participations` management command for events that have ended.
It is safe to run again and again: it never touches anyone with a podium
place, and never creates a second result for the same athlete or team.
"""
from django.db import transaction

from .models import CategoryAthlete, CategoryAthleteScore, CategoryTeam

PARTICIPATION = 'participation'


def _result_type(category):
    kind = category.type
    return 'teams' if kind == 'team' else (kind if kind in ('solo', 'fight') else 'solo')


def _record(rows, create):
    """Mark `rows` (this holder's non-rejected results in the category) as a
    participation, or create one if there are none. Returns 1 if a result
    was created or changed, else 0. Skips anyone already holding a placement
    - a podium place, or a participation recorded before."""
    if any(row.placement_claimed for row in rows):
        return 0
    if rows:
        # update(), not save(): save() re-derives status and award fields,
        # none of which apply to a participation.
        CategoryAthleteScore.objects.filter(pk__in=[row.pk for row in rows]).update(placement_claimed=PARTICIPATION)
        return 1
    create()
    return 1


def record_participations(event):
    """Give a "Participare" result to every athlete and team enrolled in this
    event's categories that didn't place. Returns how many were recorded."""
    recorded = 0
    with transaction.atomic():
        enrollments = (
            CategoryAthlete.objects
            .filter(category__event=event, place__isnull=True)
            .select_related('category')
        )
        for enrollment in enrollments:
            category, athlete_id = enrollment.category, enrollment.athlete_id
            rows = list(
                CategoryAthleteScore.objects
                .filter(category=category, athlete_id=athlete_id, referee__isnull=True)
                .exclude(status='rejected')
            )
            recorded += _record(rows, lambda: CategoryAthleteScore.objects.create(
                category=category, athlete_id=athlete_id, type=_result_type(category),
                placement_claimed=PARTICIPATION,
            ))

        team_enrollments = (
            CategoryTeam.objects
            .filter(category__event=event, place__isnull=True)
            .select_related('category', 'team')
            .prefetch_related('team__members')
        )
        for enrollment in team_enrollments:
            category = enrollment.category
            member_ids = {member.athlete_id for member in enrollment.team.members.all() if member.athlete_id}
            if not member_ids:
                continue
            # A team's result is the one whose members are exactly this team -
            # the same identity rule the scoring views and Team use.
            rows = [
                row for row in
                CategoryAthleteScore.objects
                .filter(category=category, type='teams')
                .exclude(status='rejected')
                .prefetch_related('team_members')
                if {member.pk for member in row.team_members.all()} == member_ids
            ]

            def create_team_result(category=category, team=enrollment.team, member_ids=member_ids):
                result = CategoryAthleteScore.objects.create(
                    category=category, athlete_id=min(member_ids), type='teams',
                    team_name=team.name, placement_claimed=PARTICIPATION,
                )
                result.team_members.set(member_ids)

            recorded += _record(rows, create_team_result)
    return recorded
