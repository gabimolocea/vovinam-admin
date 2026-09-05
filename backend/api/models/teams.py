from django.db import models, transaction
from django.db.models import F
from django.core.exceptions import ValidationError
from django.contrib import admin
from django.conf import settings
from django.contrib.auth.models import AbstractUser
from datetime import date, timedelta
import hashlib
import secrets
from urllib.parse import urlparse
from django.db.models.signals import m2m_changed, post_save
from django.dispatch import receiver
from django.core.exceptions import ValidationError
from django.db.models.signals import post_delete
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from django.utils.text import slugify
from ..mixins import TimestampMixin, SyncMixin, SoftDeleteMixin, AuditMixin
from ..managers import AthleteManager

# Create your models here.

def _format_team_member_names(athletes, limit=3):
    athletes = list(athletes or [])
    if not athletes:
        return ''

    visible = athletes[:limit]
    names = [f"{athlete.first_name} {athlete.last_name}".strip() for athlete in visible]
    names = [name for name in names if name]
    if not names:
        return ''

    if len(names) == 1:
        base = names[0]
    elif len(names) == 2:
        base = ' & '.join(names)
    else:
        base = ' & '.join(names)

    extra_count = max(0, len(athletes) - limit)
    if extra_count:
        base += f" (+{extra_count})"
    return base


def build_team_display_name(athletes, limit=3):
    athletes = [athlete for athlete in list(athletes or []) if athlete is not None]
    if not athletes:
        return None

    return _format_team_member_names(athletes, limit=limit)


def get_team_members_with_related(team):
    prefetched_members = getattr(team, '_prefetched_objects_cache', {}).get('members')
    if prefetched_members is not None:
        return [member for member in prefetched_members if getattr(member, 'athlete_id', None)]

    return list(team.members.select_related('athlete', 'athlete__club').all())


class Team(models.Model):
    """
    Represents a team of athletes.

    A team's identity is defined by its exact set of members (at least
    MIN_MEMBERS athletes), not by a name. There is no persisted ``name``
    field: ``name`` below is a read-only, auto-generated display value
    derived from the current members, kept only for convenience/rendering.
    """
    MIN_MEMBERS = 2

    categories = models.ManyToManyField(
        'Category',
        through='CategoryTeam',  # Use the existing through model
        related_name='team_categories',
        blank=True,
        limit_choices_to={'type': 'teams'},  # Only allow categories with type 'teams'
    )

    @property
    def name(self):
        """Auto-generate team display name from members (display only, not identity)."""
        members = get_team_members_with_related(self)
        if not members:
            return f"Team #{self.pk}"
        athlete_members = [member.athlete for member in members if member.athlete_id]
        return build_team_display_name(athlete_members) or f"Team #{self.pk}"

    @property
    def has_approved_result(self):
        """True if this team has been awarded a placement in any category
        (i.e. it was used in an approved result), meaning its membership
        must be frozen to keep results history consistent."""
        return (
            self.first_place_team_categories.exists()
            or self.second_place_team_categories.exists()
            or self.third_place_team_categories.exists()
        )

    def __str__(self):
        """Display team with member names for clarity"""
        return self.name

    @classmethod
    def find_by_members(cls, athletes):
        """
        Find an existing team whose member set exactly matches ``athletes``.
        A team is a standalone entity that can enroll in multiple
        categories, so the search is not scoped to any single category.
        Returns ``None`` if no exact match is found.
        """
        athlete_ids = {athlete.pk for athlete in athletes if athlete is not None}
        if len(athlete_ids) < cls.MIN_MEMBERS:
            return None

        candidates = cls.objects.prefetch_related('members').distinct()

        for team in candidates:
            existing_ids = {member.athlete_id for member in team.members.all()}
            if existing_ids == athlete_ids:
                return team
        return None

    @classmethod
    def get_or_create_by_members(cls, athletes, *, category=None):
        """
        Get the existing team with this exact member set, or create a new
        one with these members. Raises ``ValidationError`` if fewer than
        ``MIN_MEMBERS`` distinct athletes are provided.

        If ``category`` is given, the (found or created) team is enrolled
        in it. Returns a ``(team, created)`` tuple, mirroring ``get_or_create``.

        Wrapped in a locking transaction: without it, two concurrent calls
        for the same member set (e.g. two referees submitting a team result
        at the same time) could both miss the "existing team" lookup and
        each create their own duplicate ``Team`` row. Locking all existing
        ``Team`` rows for the duration of the lookup+create serializes
        concurrent calls so the second one always sees the first one's
        newly-created team instead of racing it.
        """
        athletes = [athlete for athlete in athletes if athlete is not None]
        unique_athletes = {athlete.pk: athlete for athlete in athletes}
        if len(unique_athletes) < cls.MIN_MEMBERS:
            raise ValidationError(
                f"A team requires at least {cls.MIN_MEMBERS} distinct athletes."
            )

        with transaction.atomic():
            # Lock existing teams so a concurrent caller can't create a
            # duplicate for the same member set while we're checking/creating.
            list(cls.objects.select_for_update().values_list('pk', flat=True))

            existing = cls.find_by_members(athletes)
            if existing is not None:
                if category is not None:
                    existing.categories.add(category)
                return existing, False

            team = cls.objects.create()
            TeamMember.objects.bulk_create(
                [TeamMember(team=team, athlete=athlete) for athlete in unique_athletes.values()]
            )
            if category is not None:
                team.categories.add(category)
            return team, True


class TeamMember(models.Model):
    """
    Represents a member of a team.
    """
    team = models.ForeignKey('Team', on_delete=models.CASCADE, related_name='members')
    athlete = models.ForeignKey('Athlete', on_delete=models.CASCADE, related_name='team_members')

    class Meta:
        unique_together = ('team', 'athlete')  # Ensure an athlete cannot be added twice to the same team

    def __str__(self):
        club_name = f", {self.athlete.club.name}" if self.athlete.club else ""
        return f"{self.athlete.first_name} {self.athlete.last_name}{club_name}"

