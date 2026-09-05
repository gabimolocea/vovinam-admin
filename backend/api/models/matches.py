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

from ._common import (
    APPROVAL_STATUS_CHOICES,
    ApprovalWorkflowMixin,
    Athlete,
    User,
)
from .fields import MatchFieldAssignment
class Match(models.Model):
    MATCH_TYPE_CHOICES = [
        ('qualifications', 'Qualifications'),
        ('quarter-finals', 'Quarter-Finals'),
        ('semi-finals', 'Semi-Finals'),
        ('finals', 'Finals'),
        ('bronze', 'Bronze Match'),
    ]

    MATCH_STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]

    DISPLAY_MODE_CHOICES = [
        ('reveal_final', 'Reveal Final'),
        ('real_time', 'Real Time Scoring'),
    ]
    
    match_number = models.CharField(max_length=50, blank=True, null=True, help_text='Unique identifier for this match (e.g., M1, M2, F-C1-Q1)')
    status = models.CharField(max_length=20, choices=MATCH_STATUS_CHOICES, default='scheduled', help_text='Current status of the match')
    category = models.ForeignKey('Category', on_delete=models.CASCADE, related_name='matches')
    field = models.ForeignKey('CompetitionField', on_delete=models.SET_NULL, null=True, blank=True, related_name='matches')
    match_type = models.CharField(max_length=20, choices=MATCH_TYPE_CHOICES, default='qualifications')
    round_number = models.PositiveIntegerField(default=1, help_text='Round number within the bracket (1=first round, 2=second, etc.)')
    bracket_position = models.PositiveIntegerField(default=0, help_text='Position within the round (0-based, for visual layout)')
    next_match = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='previous_matches', help_text='Winner advances to this match')
    loser_next_match = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='previous_loser_matches', help_text='Loser advances to this match (consolation/bronze)')
    red_corner = models.ForeignKey('Athlete', on_delete=models.SET_NULL, null=True, blank=True, related_name='red_corner_matches')
    blue_corner = models.ForeignKey('Athlete', on_delete=models.SET_NULL, null=True, blank=True, related_name='blue_corner_matches')
    referees = models.ManyToManyField('Athlete', related_name='refereed_matches', limit_choices_to={'is_referee': True})
    central_referee = models.ForeignKey('Athlete', on_delete=models.SET_NULL, null=True, blank=True, related_name='central_for_matches', limit_choices_to={'is_referee': True})
    # Winner is now computed from scoring system - no longer stored
    name = models.CharField(max_length=255, blank=True)  # Automatically generated match name
    display_mode = models.CharField(max_length=20, choices=DISPLAY_MODE_CHOICES, default='reveal_final')

    class Meta:
        verbose_name_plural = 'Matches'

    @property
    def winner(self):
        """Calculate winner from referee scores using scoring system"""
        # First try simplified scoring system if it exists
        winner = self.calculate_winner_simplified()
        if winner:
            return winner
        
        # Fall back to complex scoring system
        try:
            from ..scoring import compute_match_results
            results = compute_match_results(
                self,
                events=getattr(self, '_prefetched_point_events', None),
            )
            return results.get('match_winner')
        except Exception:
            # Fallback to old calculation if scoring system unavailable
            return self._calculate_winner_legacy()

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        try:
            if self.field_id:
                MatchFieldAssignment.objects.update_or_create(
                    match=self,
                    defaults={'field_id': self.field_id}
                )
        except Exception:
            pass
    
    def calculate_winner_simplified(self):
        """
        Calculate winner using simplified 5-referee scoring system.
        Similar to solo/team category scoring: exclude highest and lowest scores, count middle 3.
        Returns the corner with more votes from the middle 3 referees.
        """
        try:
            # Prefer final referee decisions (`round is null`) when they exist.
            # Fall back to all simplified scores for backwards compatibility.
            prefetched_scores = getattr(self, '_prefetched_simplified_scores', None)
            if prefetched_scores is not None:
                scores = [score for score in prefetched_scores if score.round_id is None]
            else:
                scores = list(self.simplified_referee_scores.filter(round__isnull=True))
            if not scores:
                scores = prefetched_scores if prefetched_scores is not None else list(self.simplified_referee_scores.all())

            if not scores:
                return None

            # With 1-2 available referee decisions, use the simple majority of the
            # submitted choices. This matches the live admin flow, where a winner
            # can be revealed even before all referees have submitted.
            if len(scores) < 3:
                red_votes = 0
                blue_votes = 0
                for score in scores:
                    winner_choice = getattr(score, 'winner_choice', None)
                    if winner_choice == 'red':
                        red_votes += 1
                    elif winner_choice == 'blue':
                        blue_votes += 1

                if red_votes > blue_votes:
                    return self.red_corner
                elif blue_votes > red_votes:
                    return self.blue_corner
                return None
            
            # Calculate score difference for each referee (red - blue)
            score_diffs = []
            for score in scores:
                diff = score.red_corner_score - score.blue_corner_score
                score_diffs.append({
                    'diff': diff,
                    'winner': 'red' if diff > 0 else ('blue' if diff < 0 else None),
                    'score': score
                })
            
            # Sort by absolute difference to identify extreme scores
            sorted_diffs = sorted(score_diffs, key=lambda x: abs(x['diff']))
            
            # For 5 scores: remove lowest and highest difference (most extreme), keep middle 3
            # For 4 scores: remove only the highest
            # For 3 scores: use all 3
            if len(sorted_diffs) == 3:
                middle_scores = sorted_diffs
            elif len(sorted_diffs) == 4:
                middle_scores = sorted_diffs[:-1]
            else:
                middle_scores = sorted_diffs[1:-1]
            
            # Count votes from middle referees
            red_votes = sum(1 for s in middle_scores if s['winner'] == 'red')
            blue_votes = sum(1 for s in middle_scores if s['winner'] == 'blue')
            
            if red_votes > blue_votes:
                return self.red_corner
            elif blue_votes > red_votes:
                return self.blue_corner
            
            return None  # Tie
        except Exception:
            return None
    
    def _calculate_winner_legacy(self):
        """Legacy winner calculation based on referee votes"""
        prefetched_scores = getattr(self, '_prefetched_legacy_scores', None)
        if prefetched_scores is not None:
            red_votes = sum(score.winner == 'red' for score in prefetched_scores)
            blue_votes = sum(score.winner == 'blue' for score in prefetched_scores)
        else:
            red_votes = self.referee_scores.filter(winner='red').count()
            blue_votes = self.referee_scores.filter(winner='blue').count()
        if red_votes > blue_votes:
            return self.red_corner
        elif blue_votes > red_votes:
            return self.blue_corner
        return None

    def _generate_match_number(self):
        """Auto-generate match number based on category and match type"""
        type_prefix = {
            'qualifications': 'Q',
            'semi-finals': 'SF',
            'finals': 'F',
        }.get(self.match_type, 'M')
        
        # Count existing matches of this type in this category
        if self.category_id:
            count = Match.objects.filter(
                category_id=self.category_id,
                match_type=self.match_type
            ).count() + 1
            
            # Include category number if available
            if self.category and self.category.category_number:
                return f"{self.category.category_number}-{type_prefix}{count}"
            else:
                return f"M{count}"
        else:
            # Fallback to simple incrementing
            last = Match.objects.order_by('-id').first()
            return f"M{last.id + 1 if last else 1}"
    
    def save(self, *args, **kwargs):
        """Generate match name and number on save"""
        # Auto-generate match_number if not provided
        if not self.match_number:
            self.match_number = self._generate_match_number()
        
        # Generate match name
        try:
            red_name = self.red_corner.first_name if self.red_corner_id else ''
            blue_name = self.blue_corner.first_name if self.blue_corner_id else ''
            category_name = self.category.name if self.category_id else ''
            self.name = f"{red_name} vs {blue_name} ({self.match_type}) - {category_name}"
        except Exception:
            pass
        super().save(*args, **kwargs)

    def __str__(self):
        category = self.category
        group = category.group if category else None
        event = category.event if category else None
        group_name = group.name if group else 'No Group'
        event_title = event.title if event else 'No Competition'
        return (
            f"{self.name} - "
            f"{category.name} - {group_name} - {event_title}"
        )


class RefereeScore(models.Model):
    match = models.ForeignKey('Match', on_delete=models.CASCADE, related_name='referee_scores')
    referee = models.ForeignKey('Athlete', on_delete=models.CASCADE, limit_choices_to={'is_referee': True}, null=True, blank=True)
    red_corner_score = models.IntegerField(default=0)
    blue_corner_score = models.IntegerField(default=0)
    winner = models.CharField(max_length=10, choices=[('red', 'Red Corner'), ('blue', 'Blue Corner')], null=True, blank=True)

    def __str__(self):
        if self.referee:
            ref_name = f"{self.referee.first_name} {self.referee.last_name}"
        else:
            ref_name = "Unassigned"
        return f"Referee: {ref_name} - Match: {self.match}"


class RefereePointEvent(models.Model):
    """Append-only events created by referees (or admins) describing points/penalties.

    These are the raw inputs that the aggregation job consumes to produce
    per-referee `RefereeScore` rows and the final `Match` winner.
    """
    EVENT_TYPE_CHOICES = [
        ('score', 'Score'),
        ('penalty', 'Penalty'),
        ('deduction', 'Deduction'),
        ('other', 'Other'),
    ]
    VALIDATION_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('validated', 'Validated'),
        ('rejected', 'Rejected'),
    ]

    match = models.ForeignKey('Match', on_delete=models.CASCADE, related_name='point_events')
    referee = models.ForeignKey('Athlete', on_delete=models.CASCADE, limit_choices_to={'is_referee': True})
    timestamp = models.DateTimeField(auto_now_add=True)
    side = models.CharField(max_length=10, choices=[('red', 'Red Corner'), ('blue', 'Blue Corner')])
    points = models.IntegerField(default=0)
    event_type = models.CharField(max_length=20, choices=EVENT_TYPE_CHOICES, default='score')
    processed = models.BooleanField(default=False, db_index=True)
    external_id = models.CharField(max_length=200, blank=True, null=True)
    metadata = models.JSONField(
        blank=True,
        null=True,
        help_text=(
            "Optional JSON object for extra event data. Common keys: 'round' (int), "
            "'central' (bool), 'reason' (string), 'origin' (string). Example: "
            "{'round': 2, 'central': true, 'reason': 'excessive contact'}"
        )
    )
    created_by = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True)
    validation_status = models.CharField(max_length=20, choices=VALIDATION_STATUS_CHOICES, default='validated')
    validated_at = models.DateTimeField(null=True, blank=True)
    recording_session = models.ForeignKey(
        'FieldRecordingSession',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='referee_point_events'
    )
    video_offset_ms = models.IntegerField(null=True, blank=True)

    class Meta:
        ordering = ['timestamp']

    def __str__(self):
        return f"Event {self.pk} - Match {self.match_id} - Referee {self.referee_id} - {self.side} ({self.points})"

    def clean(self):
        """Validate metadata using the shared validator so invalid shapes are rejected early."""
        super().clean()
        try:
            from ..validators import validate_referee_point_event_metadata
            validate_referee_point_event_metadata(self.metadata)
        except Exception as e:
            # If it's already a Django ValidationError raise it, otherwise convert
            from django.core.exceptions import ValidationError as DjangoValidationError
            if isinstance(e, DjangoValidationError):
                raise
            raise DjangoValidationError(str(e))


class MatchRefereeAssignment(models.Model):
    """
    Assigns 5 referees (R1-R5) to a match for simplified scoring.
    Similar to CategoryRefereeAssignment but for fight matches.
    """
    match = models.OneToOneField(
        'Match',
        on_delete=models.CASCADE,
        related_name='referee_assignment',
        help_text='The match these referees are assigned to'
    )
    
    referee_1 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='match_r1_assignments',
        limit_choices_to={'is_referee': True},
        verbose_name='Referee 1',
        help_text='Referee position 1 (R1)'
    )
    
    referee_2 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='match_r2_assignments',
        limit_choices_to={'is_referee': True},
        verbose_name='Referee 2',
        help_text='Referee position 2 (R2)'
    )
    
    referee_3 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='match_r3_assignments',
        limit_choices_to={'is_referee': True},
        verbose_name='Referee 3',
        help_text='Referee position 3 (R3)'
    )
    
    referee_4 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='match_r4_assignments',
        limit_choices_to={'is_referee': True},
        verbose_name='Referee 4',
        help_text='Referee position 4 (R4)'
    )
    
    referee_5 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='match_r5_assignments',
        limit_choices_to={'is_referee': True},
        verbose_name='Referee 5',
        help_text='Referee position 5 (R5)'
    )
    
    def __str__(self):
        return f"Referee Assignment for {self.match}"
    
    def get_referees_list(self):
        """Returns list of 5 referees in order [R1, R2, R3, R4, R5]"""
        return [self.referee_1, self.referee_2, self.referee_3, self.referee_4, self.referee_5]
    
    def clean(self):
        """Validate referee assignments"""
        super().clean()
        # Note: duplicate referees are allowed (same referee can be assigned to multiple positions)


class MatchRefereeScore(models.Model):
    """
    Stores individual referee scores for fighters in matches.
    Each referee can score per-round (round is set) or submit a final
    winner decision (round is null). The winner is determined by which
    corner has more referee votes.
    """
    match = models.ForeignKey(
        'Match',
        on_delete=models.CASCADE,
        related_name='simplified_referee_scores',
        help_text='The match being scored'
    )
    
    referee = models.ForeignKey(
        'Athlete',
        on_delete=models.CASCADE,
        limit_choices_to={'is_referee': True},
        related_name='given_match_scores',
        help_text='The referee providing this score'
    )
    
    round = models.ForeignKey(
        'MatchRound',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='referee_scores',
        help_text='The round being scored (null = final/overall decision)'
    )
    
    red_corner_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        help_text='Score for red corner fighter'
    )
    
    blue_corner_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        help_text='Score for blue corner fighter'
    )
    
    # Metadata
    submitted_date = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, null=True, help_text='Optional notes from referee')
    
    class Meta:
        unique_together = ('match', 'referee', 'round')  # Each referee scores each round once
        indexes = [
            models.Index(fields=['match', 'referee']),
        ]
    
    def __str__(self):
        rnd = f" R{self.round.round_number}" if self.round else " Final"
        return f"{self.referee} - {self.match}{rnd}: Red {self.red_corner_score} vs Blue {self.blue_corner_score}"
    
    @property
    def winner_choice(self):
        """Determine which corner won according to this referee"""
        if self.red_corner_score > self.blue_corner_score:
            return 'red'
        elif self.blue_corner_score > self.red_corner_score:
            return 'blue'
        return None  # Tie


class AthleteMatch(ApprovalWorkflowMixin, models.Model):
    """
    Model to track individual matches/fights with approval workflow for athlete submissions.
    Separate from the competition Match model which tracks organized tournament matches.
    """
    RESULT_CHOICES = [
        ('win', 'Win'),
        ('loss', 'Loss'),
        ('draw', 'Draw'),
    ]
    
    STATUS_CHOICES = APPROVAL_STATUS_CHOICES
    
    athlete = models.ForeignKey(Athlete, on_delete=models.CASCADE, related_name='athlete_matches')
    opponent_name = models.CharField(max_length=200, help_text='Name of the opponent')
    match_date = models.DateField(help_text='Date of the match')
    event = models.ForeignKey('landing.Event', on_delete=models.SET_NULL, related_name='athlete_matches', blank=True, null=True)
    venue = models.CharField(max_length=200, blank=True, null=True, help_text='Venue where the match took place')
    result = models.CharField(max_length=10, choices=RESULT_CHOICES, help_text='Match result')
    round_ended = models.CharField(max_length=50, blank=True, null=True, help_text='Round when match ended (e.g., "Round 2", "Decision")')
    
    # Athlete self-submission fields
    submitted_by_athlete = models.BooleanField(default=False, help_text='True if submitted by the athlete themselves')
    match_video = models.FileField(upload_to='match_videos/', null=True, blank=True, help_text='Video of the match')
    match_image = models.ImageField(upload_to='match_images/', null=True, blank=True, help_text='Photo from the match')
    result_document = models.FileField(upload_to='match_documents/', null=True, blank=True, help_text='Official match result document')
    notes = models.TextField(blank=True, null=True, help_text='Additional notes about the match')
    
    # Approval workflow fields
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='approved', help_text='Approval status (defaults to approved for admin submissions)')
    submitted_date = models.DateTimeField(auto_now_add=True)
    reviewed_date = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_athlete_matches')
    admin_notes = models.TextField(blank=True, null=True, help_text='Admin notes about approval/rejection')
    
    class Meta:
        ordering = ['-match_date']
        verbose_name = _('Athlete Match')
        verbose_name_plural = _('Athlete Matches')
    
    def __str__(self):
        if self.submitted_by_athlete:
            return f"{self.athlete.first_name} {self.athlete.last_name} vs {self.opponent_name} ({self.match_date}) - Self-submitted: {self.status}"
        return f"{self.athlete.first_name} {self.athlete.last_name} vs {self.opponent_name} ({self.match_date}) - {self.result}"
    
    def save(self, *args, **kwargs):
        # Only stamp a default status at creation time. Previously the
        # "admin submission -> approved" branch ran on *every* save (no
        # `not self.pk` guard), so calling .reject()/.request_revision() on
        # an admin-submitted match would silently bounce back to 'approved'
        # on that same save() call.
        if not self.pk:
            self.status = 'pending' if self.submitted_by_athlete else 'approved'
        super().save(*args, **kwargs)


# Notification System Models
class MatchRound(models.Model):
    """
    Represents a single round in a fighting match.
    Tracks round duration, scores submitted per round, and round status.
    """
    match = models.ForeignKey(
        'Match',
        on_delete=models.CASCADE,
        related_name='rounds',
        help_text='The match this round belongs to'
    )
    
    round_number = models.IntegerField(
        help_text='Round number (1, 2, 3, etc.)'
    )
    
    duration_seconds = models.IntegerField(
        default=180,
        help_text='Duration of this round in seconds (default 3 minutes)'
    )
    
    STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),
        ('active', 'Active'),
        ('completed', 'Completed'),
    ]
    
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='scheduled',
        help_text='Current status of this round'
    )
    
    started_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the round started'
    )
    
    ended_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the round ended'
    )
    
    paused_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the round was paused (null = not paused)'
    )
    
    accumulated_pause_seconds = models.IntegerField(
        default=0,
        help_text='Total seconds spent paused in this round'
    )
    
    extra_seconds = models.IntegerField(
        default=0,
        help_text='Extra seconds added/removed by admin during this round'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ('match', 'round_number')
        ordering = ['round_number']
        verbose_name = 'Match Round'
        verbose_name_plural = 'Match Rounds'
    
    def __str__(self):
        return f"{self.match.match_number or self.match.id} - Round {self.round_number}"
    
    @property
    def is_paused(self):
        return self.paused_at is not None
    
    @property
    def effective_duration(self):
        """Total round duration including time adjustments"""
        return self.duration_seconds + self.extra_seconds


class MatchEvent(models.Model):
    """
    Tracks real-time events during a fighting match:
    warnings, penalties (-2 points from central referee), pauses, time adjustments.
    """
    EVENT_TYPE_CHOICES = [
        ('warning_red', 'Warning Red Corner'),
        ('warning_blue', 'Warning Blue Corner'),
        ('penalty_red', 'Penalty Red Corner'),
        ('penalty_blue', 'Penalty Blue Corner'),
        ('bonus_red', 'Bonus Red Corner'),
        ('bonus_blue', 'Bonus Blue Corner'),
        ('infraction_red', 'Infraction Red Corner'),
        ('infraction_blue', 'Infraction Blue Corner'),
        ('disqualify_red', 'Disqualify Red Corner'),
        ('disqualify_blue', 'Disqualify Blue Corner'),
        ('pause', 'Pause'),
        ('resume', 'Resume'),
        ('time_add', 'Time Added'),
        ('time_remove', 'Time Removed'),
    ]
    
    CORNER_CHOICES = [
        ('red', 'Red Corner'),
        ('blue', 'Blue Corner'),
        ('none', 'No Corner'),
    ]
    
    match = models.ForeignKey(
        'Match',
        on_delete=models.CASCADE,
        related_name='events',
        help_text='The match this event belongs to'
    )
    
    round = models.ForeignKey(
        'MatchRound',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='events',
        help_text='The round this event occurred in'
    )
    
    event_type = models.CharField(
        max_length=20,
        choices=EVENT_TYPE_CHOICES,
        help_text='Type of event'
    )
    
    corner = models.CharField(
        max_length=10,
        choices=CORNER_CHOICES,
        default='none',
        help_text='Which corner this event applies to'
    )
    
    value = models.IntegerField(
        default=0,
        help_text='Numeric value (e.g., seconds added/removed, penalty points)'
    )
    
    notes = models.CharField(
        max_length=200,
        blank=True,
        default='',
        help_text='Optional notes about the event'
    )
    
    created_by = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_match_events',
        help_text='Who created this event (usually central referee or admin)'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['created_at']
        verbose_name = 'Match Event'
        verbose_name_plural = 'Match Events'
    
    def __str__(self):
        return f"{self.match} - {self.get_event_type_display()} ({self.created_at})"

