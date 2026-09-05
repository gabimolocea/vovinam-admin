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
        ('qualifications', 'Calificări'),
        ('quarter-finals', 'Sferturi de finală'),
        ('semi-finals', 'Semifinale'),
        ('finals', 'Finală'),
        ('bronze', 'Meci pentru bronz'),
    ]

    MATCH_STATUS_CHOICES = [
        ('scheduled', 'Programat'),
        ('active', 'Activ'),
        ('completed', 'Finalizat'),
        ('cancelled', 'Anulat'),
    ]

    DISPLAY_MODE_CHOICES = [
        ('reveal_final', 'Afișare finală'),
        ('real_time', 'Arbitraj în timp real'),
    ]
    
    match_number = models.CharField(_('Număr meci'), max_length=50, blank=True, null=True, help_text=_('Identificator unic pentru acest meci (de exemplu, M1, M2, F-C1-Q1).'))
    status = models.CharField(_('Stare'), max_length=20, choices=MATCH_STATUS_CHOICES, default='scheduled', help_text=_('Starea curentă a meciului.'))
    category = models.ForeignKey('Category', on_delete=models.CASCADE, verbose_name=_('Categorie'), related_name='matches')
    field = models.ForeignKey('CompetitionField', on_delete=models.SET_NULL, verbose_name=_('Teren'), null=True, blank=True, related_name='matches')
    match_type = models.CharField(_('Tip meci'), max_length=20, choices=MATCH_TYPE_CHOICES, default='qualifications')
    round_number = models.PositiveIntegerField(_('Număr rundă'), default=1, help_text=_('Numărul rundei în tablou (1 = prima rundă, 2 = a doua rundă etc.).'))
    bracket_position = models.PositiveIntegerField(_('Poziție tablou'), default=0, help_text=_('Poziția în cadrul rundei (indexare de la 0, pentru afișarea vizuală).'))
    next_match = models.ForeignKey('self', on_delete=models.SET_NULL, verbose_name=_('Meci următor'), null=True, blank=True, related_name='previous_matches', help_text=_('Câștigătorul avansează în acest meci.'))
    loser_next_match = models.ForeignKey('self', on_delete=models.SET_NULL, verbose_name=_('Meci următor pentru învins'), null=True, blank=True, related_name='previous_loser_matches', help_text=_('Învinsul avansează în acest meci (recalificări/bronze).'))
    red_corner = models.ForeignKey('Athlete', on_delete=models.SET_NULL, verbose_name=_('Colț roșu'), null=True, blank=True, related_name='red_corner_matches')
    blue_corner = models.ForeignKey('Athlete', on_delete=models.SET_NULL, verbose_name=_('Colț albastru'), null=True, blank=True, related_name='blue_corner_matches')
    referees = models.ManyToManyField('Athlete', verbose_name=_('Arbitri'), related_name='refereed_matches', limit_choices_to={'is_referee': True})
    central_referee = models.ForeignKey('Athlete', on_delete=models.SET_NULL, verbose_name=_('Arbitru central'), null=True, blank=True, related_name='central_for_matches', limit_choices_to={'is_referee': True})
    # Winner is now computed from scoring system - no longer stored
    name = models.CharField(_('Nume'), max_length=255, blank=True)  # Automatically generated match name
    display_mode = models.CharField(_('Mod afișare'), max_length=20, choices=DISPLAY_MODE_CHOICES, default='reveal_final')

    class Meta:
        verbose_name = _('Meci')
        verbose_name_plural = _('Meciuri')

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
        group_name = group.name if group else 'Fără grupă'
        event_title = event.title if event else 'Fără competiție'
        return (
            f"{self.name} - "
            f"{category.name} - {group_name} - {event_title}"
        )


class RefereeScore(models.Model):
    match = models.ForeignKey('Match', on_delete=models.CASCADE, verbose_name=_('Meci'), related_name='referee_scores')
    referee = models.ForeignKey('Athlete', on_delete=models.CASCADE, verbose_name=_('Arbitru'), limit_choices_to={'is_referee': True}, null=True, blank=True)
    red_corner_score = models.IntegerField(_('Scor colț roșu'), default=0)
    blue_corner_score = models.IntegerField(_('Scor colț albastru'), default=0)
    winner = models.CharField(_('Câștigător'), max_length=10, choices=[('red', 'Colț roșu'), ('blue', 'Colț albastru')], null=True, blank=True)

    class Meta:
        verbose_name = _('Scor arbitru')
        verbose_name_plural = _('Scoruri arbitri')

    def __str__(self):
        if self.referee:
            ref_name = f"{self.referee.first_name} {self.referee.last_name}"
        else:
            ref_name = "Nealocat"
        return f"Arbitru: {ref_name} - Meci: {self.match}"


class RefereePointEvent(models.Model):
    """Append-only events created by referees (or admins) describing points/penalties.

    These are the raw inputs that the aggregation job consumes to produce
    per-referee `RefereeScore` rows and the final `Match` winner.
    """
    EVENT_TYPE_CHOICES = [
        ('score', 'Punctaj'),
        ('penalty', 'Penalizare'),
        ('deduction', 'Deducere'),
        ('other', 'Altul'),
    ]
    VALIDATION_STATUS_CHOICES = [
        ('pending', 'În așteptare'),
        ('validated', 'Validat'),
        ('rejected', 'Respins'),
    ]

    match = models.ForeignKey('Match', on_delete=models.CASCADE, verbose_name=_('Meci'), related_name='point_events')
    referee = models.ForeignKey('Athlete', on_delete=models.CASCADE, verbose_name=_('Arbitru'), limit_choices_to={'is_referee': True})
    timestamp = models.DateTimeField(_('Moment înregistrare'), auto_now_add=True)
    side = models.CharField(_('Parte'), max_length=10, choices=[('red', 'Colț roșu'), ('blue', 'Colț albastru')])
    points = models.IntegerField(_('Puncte'), default=0)
    event_type = models.CharField(_('Tip eveniment'), max_length=20, choices=EVENT_TYPE_CHOICES, default='score')
    processed = models.BooleanField(_('Procesat'), default=False, db_index=True)
    external_id = models.CharField(_('ID extern'), max_length=200, blank=True, null=True)
    metadata = models.JSONField(
        _('Metadate'),
        blank=True,
        null=True,
        help_text=(
            "Obiect JSON opțional pentru date suplimentare ale evenimentului. Chei uzuale: „round” (int), "
            "„central” (bool), „reason” (string), „origin” (string). Exemplu: "
            "{'round': 2, 'central': true, 'reason': 'contact excesiv'}"
        )
    )
    created_by = models.ForeignKey('User', on_delete=models.SET_NULL, verbose_name=_('Creat de'), null=True, blank=True)
    validation_status = models.CharField(_('Stare validare'), max_length=20, choices=VALIDATION_STATUS_CHOICES, default='validated')
    validated_at = models.DateTimeField(_('Validat la'), null=True, blank=True)
    recording_session = models.ForeignKey(
        'FieldRecordingSession',
        on_delete=models.SET_NULL,
        verbose_name=_('Sesiune înregistrare'),
        null=True,
        blank=True,
        related_name='referee_point_events'
    )
    video_offset_ms = models.IntegerField(_('Decalaj video (ms)'), null=True, blank=True)

    class Meta:
        ordering = ['timestamp']
        verbose_name = _('Eveniment punctaj arbitru')
        verbose_name_plural = _('Evenimente punctaj arbitru')

    def __str__(self):
        return f"Eveniment {self.pk} - Meci {self.match_id} - Arbitru {self.referee_id} - {self.side} ({self.points})"

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
        verbose_name=_('Meci'),
        related_name='referee_assignment',
        help_text=_('Meciul la care sunt alocați acești arbitri.')
    )
    
    referee_1 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='match_r1_assignments',
        limit_choices_to={'is_referee': True},
        verbose_name=_('Arbitru 1'),
        help_text=_('Arbitrul de pe poziția 1 (R1).')
    )
    
    referee_2 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='match_r2_assignments',
        limit_choices_to={'is_referee': True},
        verbose_name=_('Arbitru 2'),
        help_text=_('Arbitrul de pe poziția 2 (R2).')
    )
    
    referee_3 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='match_r3_assignments',
        limit_choices_to={'is_referee': True},
        verbose_name=_('Arbitru 3'),
        help_text=_('Arbitrul de pe poziția 3 (R3).')
    )
    
    referee_4 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='match_r4_assignments',
        limit_choices_to={'is_referee': True},
        verbose_name=_('Arbitru 4'),
        help_text=_('Arbitrul de pe poziția 4 (R4).')
    )
    
    referee_5 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='match_r5_assignments',
        limit_choices_to={'is_referee': True},
        verbose_name=_('Arbitru 5'),
        help_text=_('Arbitrul de pe poziția 5 (R5).')
    )

    class Meta:
        verbose_name = _('Alocare arbitri meci')
        verbose_name_plural = _('Alocări arbitri meci')
    
    def __str__(self):
        return f"Alocare arbitri pentru {self.match}"
    
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
        verbose_name=_('Meci'),
        related_name='simplified_referee_scores',
        help_text=_('Meciul arbitrat.')
    )
    
    referee = models.ForeignKey(
        'Athlete',
        on_delete=models.CASCADE,
        verbose_name=_('Arbitru'),
        limit_choices_to={'is_referee': True},
        related_name='given_match_scores',
        help_text=_('Arbitrul care acordă acest scor.')
    )
    
    round = models.ForeignKey(
        'MatchRound',
        on_delete=models.CASCADE,
        verbose_name=_('Rundă'),
        null=True,
        blank=True,
        related_name='referee_scores',
        help_text=_('Runda arbitrată (nul = decizie finală/generală).')
    )
    
    red_corner_score = models.DecimalField(
        _('Scor colț roșu'),
        max_digits=5,
        decimal_places=2,
        default=0,
        help_text=_('Scorul pentru luptătorul din colțul roșu.')
    )
    
    blue_corner_score = models.DecimalField(
        _('Scor colț albastru'),
        max_digits=5,
        decimal_places=2,
        default=0,
        help_text=_('Scorul pentru luptătorul din colțul albastru.')
    )
    
    # Metadata
    submitted_date = models.DateTimeField(_('Data trimiterii'), auto_now_add=True)
    notes = models.TextField(_('Note'), blank=True, null=True, help_text=_('Note opționale de la arbitru.'))
    
    class Meta:
        unique_together = ('match', 'referee', 'round')  # Each referee scores each round once
        indexes = [
            models.Index(fields=['match', 'referee']),
        ]
        verbose_name = _('Scor arbitru meci')
        verbose_name_plural = _('Scoruri arbitri meci')
    
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
        ('win', 'Victorie'),
        ('loss', 'Înfrângere'),
        ('draw', 'Egal'),
    ]
    
    STATUS_CHOICES = APPROVAL_STATUS_CHOICES
    
    athlete = models.ForeignKey(Athlete, on_delete=models.CASCADE, verbose_name=_('Sportiv'), related_name='athlete_matches')
    opponent_name = models.CharField(_('Nume adversar'), max_length=200, help_text=_('Numele adversarului.'))
    match_date = models.DateField(_('Data meciului'), help_text=_('Data la care a avut loc meciul.'))
    event = models.ForeignKey('landing.Event', on_delete=models.SET_NULL, verbose_name=_('Eveniment'), related_name='athlete_matches', blank=True, null=True)
    venue = models.CharField(_('Loc desfășurare'), max_length=200, blank=True, null=True, help_text=_('Locul unde a avut loc meciul.'))
    result = models.CharField(_('Rezultat'), max_length=10, choices=RESULT_CHOICES, help_text=_('Rezultatul meciului.'))
    round_ended = models.CharField(_('Rundă încheiere'), max_length=50, blank=True, null=True, help_text=_('Runda în care s-a încheiat meciul (de exemplu, „Runda 2”, „Decizie”).'))
    
    # Athlete self-submission fields
    submitted_by_athlete = models.BooleanField(_('Trimis de sportiv'), default=False, help_text=_('Bifat dacă a fost trimis chiar de sportiv.'))
    match_video = models.FileField(_('Video meci'), upload_to='match_videos/', null=True, blank=True, help_text=_('Videoclip al meciului.'))
    match_image = models.ImageField(_('Imagine meci'), upload_to='match_images/', null=True, blank=True, help_text=_('Fotografie din meci.'))
    result_document = models.FileField(_('Document rezultat'), upload_to='match_documents/', null=True, blank=True, help_text=_('Documentul oficial cu rezultatul meciului.'))
    notes = models.TextField(_('Note'), blank=True, null=True, help_text=_('Note suplimentare despre meci.'))
    
    # Approval workflow fields
    status = models.CharField(_('Stare'), max_length=20, choices=STATUS_CHOICES, default='approved', help_text=_('Starea aprobării (implicit aprobat pentru înregistrările adăugate de administrator).'))
    submitted_date = models.DateTimeField(_('Data trimiterii'), auto_now_add=True)
    reviewed_date = models.DateTimeField(_('Data revizuirii'), null=True, blank=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, verbose_name=_('Revizuit de'), null=True, blank=True, related_name='reviewed_athlete_matches')
    admin_notes = models.TextField(_('Note administrator'), blank=True, null=True, help_text=_('Note ale administratorului despre aprobare sau respingere.'))
    
    class Meta:
        ordering = ['-match_date']
        verbose_name = _('Meci sportiv')
        verbose_name_plural = _('Meciuri sportiv')
    
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
        verbose_name=_('Meci'),
        related_name='rounds',
        help_text=_('Meciul de care aparține această rundă.')
    )
    
    round_number = models.IntegerField(
        _('Număr rundă'),
        help_text=_('Numărul rundei (1, 2, 3 etc.).')
    )
    
    duration_seconds = models.IntegerField(
        _('Durată (secunde)'),
        default=180,
        help_text=_('Durata acestei runde în secunde (implicit 3 minute).')
    )
    
    STATUS_CHOICES = [
        ('scheduled', 'Programată'),
        ('active', 'Activă'),
        ('completed', 'Finalizată'),
    ]
    
    status = models.CharField(
        _('Stare'),
        max_length=20,
        choices=STATUS_CHOICES,
        default='scheduled',
        help_text=_('Starea curentă a acestei runde.')
    )
    
    started_at = models.DateTimeField(
        _('Început la'),
        null=True,
        blank=True,
        help_text=_('Momentul la care a început runda.')
    )
    
    ended_at = models.DateTimeField(
        _('Încheiat la'),
        null=True,
        blank=True,
        help_text=_('Momentul la care s-a încheiat runda.')
    )
    
    paused_at = models.DateTimeField(
        _('Suspendat la'),
        null=True,
        blank=True,
        help_text=_('Momentul la care runda a fost suspendată (nul = nesuspendată).')
    )
    
    accumulated_pause_seconds = models.IntegerField(
        _('Secunde totale de pauză'),
        default=0,
        help_text=_('Numărul total de secunde în care această rundă a fost suspendată.')
    )
    
    extra_seconds = models.IntegerField(
        _('Secunde suplimentare'),
        default=0,
        help_text=_('Secunde adăugate sau eliminate de administrator în această rundă.')
    )

    created_at = models.DateTimeField(_('Data creării'), auto_now_add=True)
    
    class Meta:
        unique_together = ('match', 'round_number')
        ordering = ['round_number']
        verbose_name = _('Rundă meci')
        verbose_name_plural = _('Runde meci')
    
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
        ('warning_red', 'Avertisment colț roșu'),
        ('warning_blue', 'Avertisment colț albastru'),
        ('penalty_red', 'Penalizare colț roșu'),
        ('penalty_blue', 'Penalizare colț albastru'),
        ('bonus_red', 'Bonus colț roșu'),
        ('bonus_blue', 'Bonus colț albastru'),
        ('infraction_red', 'Abatere colț roșu'),
        ('infraction_blue', 'Abatere colț albastru'),
        ('disqualify_red', 'Descalificare colț roșu'),
        ('disqualify_blue', 'Descalificare colț albastru'),
        ('pause', 'Pauză'),
        ('resume', 'Reluare'),
        ('time_add', 'Timp adăugat'),
        ('time_remove', 'Timp eliminat'),
    ]
    
    CORNER_CHOICES = [
        ('red', 'Colț roșu'),
        ('blue', 'Colț albastru'),
        ('none', 'Fără colț'),
    ]
    
    match = models.ForeignKey(
        'Match',
        on_delete=models.CASCADE,
        verbose_name=_('Meci'),
        related_name='events',
        help_text=_('Meciul de care aparține acest eveniment.')
    )
    
    round = models.ForeignKey(
        'MatchRound',
        on_delete=models.CASCADE,
        verbose_name=_('Rundă'),
        null=True,
        blank=True,
        related_name='events',
        help_text=_('Runda în care a avut loc acest eveniment.')
    )
    
    event_type = models.CharField(
        _('Tip eveniment'),
        max_length=20,
        choices=EVENT_TYPE_CHOICES,
        help_text=_('Tipul evenimentului.')
    )
    
    corner = models.CharField(
        _('Colț'),
        max_length=10,
        choices=CORNER_CHOICES,
        default='none',
        help_text=_('Colțul la care se aplică acest eveniment.')
    )
    
    value = models.IntegerField(
        _('Valoare'),
        default=0,
        help_text=_('Valoare numerică (de exemplu, secunde adăugate/eliminate, puncte de penalizare).')
    )
    
    notes = models.CharField(
        _('Note'),
        max_length=200,
        blank=True,
        default='',
        help_text=_('Note opționale despre eveniment.')
    )
    
    created_by = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        verbose_name=_('Creat de'),
        null=True,
        blank=True,
        related_name='created_match_events',
        help_text=_('Cine a creat acest eveniment (de obicei arbitrul central sau administratorul).')
    )
    
    created_at = models.DateTimeField(_('Data creării'), auto_now_add=True)
    
    class Meta:
        ordering = ['created_at']
        verbose_name = _('Eveniment meci')
        verbose_name_plural = _('Evenimente meci')
    
    def __str__(self):
        return f"{self.match} - {self.get_event_type_display()} ({self.created_at})"
