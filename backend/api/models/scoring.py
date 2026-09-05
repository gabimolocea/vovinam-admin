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
    User,
)
from .competitions import (
    Category,
    CategoryAthlete,
    CategoryTeam,
)
from .teams import Team
class CategoryRefereeScore(models.Model):
    """
    Stores individual referee scores for athletes/teams in solo and team categories.
    For solo/team categories, 5 referees score each athlete/team.
    Referees start with base score of 100 and submit deductions.
    Final score = 100 - sum_of_deductions.
    The final award score excludes the highest and lowest scores and averages the middle 3.
    """
    CATEGORY_TYPE_CHOICES = [
        ('solo', 'Solo'),
        ('teams', 'Echipe'),
    ]
    
    # Link to the athlete's result submission
    athlete_score = models.ForeignKey(
        'CategoryAthleteScore',
        on_delete=models.CASCADE,
        verbose_name=_('Rezultat sportiv'),
        related_name='referee_scores',
        help_text=_('Rezultatul sportivului sau echipei care este arbitrat.')
    )
    
    # The referee providing the score
    referee = models.ForeignKey(
        'Athlete',
        on_delete=models.CASCADE,
        verbose_name=_('Arbitru'),
        limit_choices_to={'is_referee': True},
        related_name='given_category_scores',
        help_text=_('Arbitrul care acordă acest scor.')
    )
    
    # Deduction structure (JSON field for flexibility)
    # Example: {"wrong_technique": 10, "wrong_position": 5, "not_looking_real": 0, "stamina": 3}
    deductions = models.JSONField(
        _('Deduceri'),
        default=dict,
        blank=True,
        help_text=_('Deduceri pe categorii: tehnică greșită, poziție greșită, lipsă realism, rezistență.')
    )
    
    # Calculated total score (100 - sum_of_deductions)
    score = models.DecimalField(
        _('Scor'),
        max_digits=5,
        decimal_places=2,
        default=100,
        help_text=_('Scor final: 100 minus toate deducerile.')
    )
    
    # Metadata
    submitted_date = models.DateTimeField(_('Data trimiterii'), auto_now_add=True)
    notes = models.TextField(_('Note'), blank=True, null=True, help_text=_('Note opționale de la arbitru.'))
    
    class Meta:
        unique_together = ('athlete_score', 'referee')  # Each referee scores each athlete/team once
        indexes = [
            models.Index(fields=['athlete_score', 'referee']),
            models.Index(fields=['submitted_date']),
        ]
        verbose_name = _('Scor al arbitrului pentru categorie')
        verbose_name_plural = _('Scoruri ale arbitrilor pentru categorii')
    
    def __str__(self):
        athlete = self.athlete_score.athlete
        referee = self.referee
        team_name = self.athlete_score.team_name if self.athlete_score.type == 'teams' else None
        
        if team_name:
            return f"{referee.first_name} {referee.last_name} scored Team {team_name}: {self.score}"
        elif athlete:
            return f"{referee.first_name} {referee.last_name} scored {athlete.first_name} {athlete.last_name}: {self.score}"
        else:
            return f"{referee.first_name} {referee.last_name} scored (unknown): {self.score}"
    
    def clean(self):
        """Validate that this is for a solo or team category"""
        super().clean()
        if self.athlete_score and self.athlete_score.type not in ['solo', 'team', 'teams']:
            raise ValidationError(
                f"Referee scoring is only applicable to solo and team categories, not {self.athlete_score.type}"
            )

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Any create/edit of a referee score after the parent result was
        # already approved must reopen it for re-review: the displayed
        # score is always live-computed, but an already-"approved" status
        # should not silently survive a scoring change.
        athlete_score = self.athlete_score
        if athlete_score.status == 'approved':
            type(athlete_score).objects.filter(pk=athlete_score.pk).update(
                status='pending', reviewed_date=None, reviewed_by=None,
            )
            athlete_score.status = 'pending'
            athlete_score.reviewed_date = None
            athlete_score.reviewed_by = None


class CategoryRefereeScoreEvent(models.Model):
    ACTION_CHOICES = [
        ('create', 'Creare'),
        ('update', 'Actualizare'),
        ('delete', 'Ștergere'),
        ('reveal', 'Afișare'),
    ]

    SOURCE_CHOICES = [
        ('referee_app', 'Aplicație arbitru'),
        ('competition_admin', 'Administrare competiție'),
        ('system', 'Sistem'),
    ]

    athlete_score = models.ForeignKey(
        'CategoryAthleteScore',
        on_delete=models.CASCADE,
        verbose_name=_('Rezultat sportiv'),
        related_name='score_events',
        help_text=_('Rezultatul sportivului sau echipei afectat de acest eveniment.')
    )
    referee = models.ForeignKey(
        'Athlete',
        on_delete=models.CASCADE,
        verbose_name=_('Arbitru'),
        limit_choices_to={'is_referee': True},
        related_name='category_score_events',
        help_text=_('Arbitrul care a produs acest eveniment.')
    )
    action = models.CharField(_('Acțiune'), max_length=20, choices=ACTION_CHOICES, default='update')
    source = models.CharField(_('Sursă'), max_length=20, choices=SOURCE_CHOICES, default='competition_admin')
    score_value = models.DecimalField(_('Valoare scor'), max_digits=5, decimal_places=2, null=True, blank=True)
    previous_score = models.DecimalField(_('Scor anterior'), max_digits=5, decimal_places=2, null=True, blank=True)
    notes = models.TextField(_('Note'), blank=True, null=True)
    timestamp = models.DateTimeField(_('Moment înregistrare'), auto_now_add=True)
    created_by = models.ForeignKey('User', on_delete=models.SET_NULL, verbose_name=_('Creat de'), null=True, blank=True)
    recording_session = models.ForeignKey(
        'FieldRecordingSession',
        on_delete=models.SET_NULL,
        verbose_name=_('Sesiune înregistrare'),
        null=True,
        blank=True,
        related_name='category_score_events'
    )
    video_offset_ms = models.IntegerField(_('Decalaj video (ms)'), null=True, blank=True)
    metadata = models.JSONField(_('Metadate'), default=dict, blank=True)

    class Meta:
        ordering = ['timestamp', 'id']
        indexes = [
            models.Index(fields=['athlete_score', 'timestamp']),
            models.Index(fields=['referee', 'timestamp']),
        ]
        verbose_name = _('Eveniment de scor al arbitrului pentru categorie')
        verbose_name_plural = _('Evenimente de scor ale arbitrilor pentru categorii')

    def __str__(self):
        return f"Category score event #{self.pk} ({self.action})"


class CategoryAthleteScore(ApprovalWorkflowMixin, models.Model):
    """
    Stores athlete results for a category with approval workflow.
    Athletes can submit their own results (individual or team) which require admin approval and auto-populate Category awards.
    """
    CATEGORY_TYPE_CHOICES = [
        ('solo', 'Solo'),
        ('teams', 'Echipe'),
        ('fight', 'Luptă'),
    ]
    
    STATUS_CHOICES = APPROVAL_STATUS_CHOICES
    
    PLACEMENT_CHOICES = [
        ('1st', 'Locul 1'),
        ('2nd', 'Locul 2'),
        ('3rd', 'Locul 3'),
    ]
    
    category = models.ForeignKey('Category', on_delete=models.CASCADE, verbose_name=_('Categorie'), related_name='athlete_scores')
    athlete = models.ForeignKey('Athlete', on_delete=models.CASCADE, verbose_name=_('Sportiv'), related_name='category_scores', null=True, blank=True, help_text=_('Sportivul arbitrat (nul pentru scorurile de echipă).'))
    referee = models.ForeignKey('Athlete', on_delete=models.CASCADE, verbose_name=_('Arbitru'), limit_choices_to={'is_referee': True}, null=True, blank=True)
    score = models.IntegerField(_('Punctaj'), default=0, blank=True, null=True, help_text=_('Punctajul numeric acordat de arbitru/oficial (nerelevant pentru auto-raportările sportivilor cu revendicare de clasament).'))
    
    # Type and group (matching Category model structure)
    type = models.CharField(_('Tip rezultat'), max_length=10, choices=CATEGORY_TYPE_CHOICES, default='solo', help_text=_('Tipul rezultatului: solo, luptă sau echipe.'))
    group = models.ForeignKey(
        'Group',
        on_delete=models.SET_NULL,
        verbose_name=_('Grupă'),
        null=True,
        blank=True,
        related_name='athlete_scores',
        help_text=_('Grupa alocată (similar modelului Category).')
    )
    team_members = models.ManyToManyField('Athlete', verbose_name=_('Membri echipă'), blank=True, related_name='team_results', help_text=_('Membrii echipei, inclusiv persoana care a trimis rezultatul echipei.'))
    team_name = models.CharField(_('Nume echipă'), max_length=200, blank=True, null=True, help_text=_('Nume opțional al echipei.'))

    # Backwards-compatibility: some scripts/tests use `result_type` as the field name.
    # Provide a manager that annotates `result_type` and accept `result_type` in __init__.
    class _CompatManager(models.Manager):
        def get_queryset(self):
            # annotate a virtual `result_type` column equal to the `type` field so filters like
            # .filter(result_type='teams') work in legacy scripts/tests
            return super().get_queryset().annotate(result_type=F('type'))

    objects = _CompatManager()

    def __init__(self, *args, **kwargs):
        # map legacy kwarg `result_type` to the actual `type` field
        if 'result_type' in kwargs and 'type' not in kwargs:
            kwargs['type'] = kwargs.pop('result_type')
        super().__init__(*args, **kwargs)
    
    # Athlete self-submission fields
    submitted_by_athlete = models.BooleanField(_('Trimis de sportiv'), default=False, help_text=_('Bifat dacă a fost trimis chiar de sportiv.'))
    placement_claimed = models.CharField(_('Loc revendicat'), max_length=10, choices=PLACEMENT_CHOICES, blank=True, null=True, help_text=_('Locul revendicat de sportiv sau echipă.'))
    notes = models.TextField(_('Note'), blank=True, null=True, help_text=_('Note suplimentare despre prestație.'))
    certificate_image = models.ImageField(_('Imagine certificat'), upload_to='result_certificates/', null=True, blank=True, help_text=_('Fotografie a certificatului sau a premiului.'))
    result_document = models.FileField(_('Document rezultat'), upload_to='result_documents/', null=True, blank=True, help_text=_('Documentul oficial cu rezultatul.'))
    
    # Approval workflow fields
    status = models.CharField(_('Stare'), max_length=20, choices=STATUS_CHOICES, default='approved', help_text=_('Starea aprobării (implicit aprobat pentru trimiterile arbitrilor).'))
    submitted_date = models.DateTimeField(_('Data trimiterii'), auto_now_add=True)
    reviewed_date = models.DateTimeField(_('Data revizuirii'), null=True, blank=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, verbose_name=_('Revizuit de'), null=True, blank=True, related_name='reviewed_scores')
    admin_notes = models.TextField(_('Note administrator'), blank=True, null=True, help_text=_('Note ale administratorului despre aprobare sau respingere.'))

    class Meta:
        unique_together = ('category', 'athlete', 'referee')  # Ensure unique scores per referee and athlete
        indexes = [
            models.Index(fields=['category', 'status']),
            models.Index(fields=['athlete', 'status']),
            models.Index(fields=['submitted_date']),
            models.Index(fields=['status', 'submitted_by_athlete']),
        ]
        verbose_name = _('Rezultat al sportivului')
        verbose_name_plural = _('Rezultate ale sportivilor')

    def __str__(self):
        category = self.category
        group = category.group if category else None
        event = category.event if category else None
        group_name = group.name if group else 'No Group'
        event_title = event.title if event else 'Fără competiție'
        
        if self.athlete:
            return (
                f"{self.athlete.first_name} {self.athlete.last_name} - "
                f"{category.name} - {group_name} - {event_title}"
            )
        elif self.type == 'teams' and self.team_name:
            return f"Team {self.team_name} - {category.name} - {group_name} - {event_title}"
        else:
            return f"{category.name} - {group_name} - {event_title}"
    
    @property
    def calculated_score(self):
        """
        Calculate final score for solo/team categories by:
        1. Collecting all 5 referee scores
        2. Removing the highest and lowest scores
        3. Summing the middle 3 scores
        
        Returns None if category type is not solo/teams or if less than 3 referee scores exist.
        """
        # Only applicable to solo and team categories
        if self.type not in ['solo', 'teams']:
            return None
        
        # Get all referee scores for this result
        referee_scores = list(self.referee_scores.values_list('score', flat=True))
        
        # Need at least 3 scores to calculate (ideally 5)
        if len(referee_scores) < 3:
            return None
        
        # Sort scores to easily identify highest and lowest
        sorted_scores = sorted(referee_scores)
        
        # Remove the lowest and highest
        # If we have exactly 3 scores, use all 3
        # If we have 4 scores, remove only the highest
        # If we have 5+ scores, remove both highest and lowest
        if len(sorted_scores) == 3:
            middle_scores = sorted_scores
        elif len(sorted_scores) == 4:
            middle_scores = sorted_scores[:-1]  # Remove only highest
        else:
            middle_scores = sorted_scores[1:-1]  # Remove both lowest and highest
        
        # Sum the middle scores
        return sum(middle_scores)
    
    @property
    def referee_score_count(self):
        """Return the number of referee scores submitted for this result"""
        return self.referee_scores.count()
    
    @property
    def has_all_referee_scores(self):
        """Check if all 5 referee scores have been submitted"""
        return self.type in ['solo', 'teams'] and self.referee_score_count == 5
    
    def get_referee_score(self, referee_position):
        """
        Get the score from a specific referee position (1-5).
        Returns the score value or None if not submitted.
        """
        if not self.category:
            return None
        
        try:
            assignment = self.category.referee_assignment
        except:
            return None
        
        # Get the referee for this position
        referee = getattr(assignment, f'referee_{referee_position}', None)
        if not referee:
            return None
        
        # Get the score from this referee
        try:
            score_obj = self.referee_scores.get(referee=referee)
            return score_obj.score
        except CategoryRefereeScore.DoesNotExist:
            return None
    
    def get_all_referee_scores(self):
        """
        Get all 5 referee scores in order (R1-R5).
        Returns dict with keys 'r1' through 'r5', values are scores or None.
        """
        return {
            'r1': self.get_referee_score(1),
            'r2': self.get_referee_score(2),
            'r3': self.get_referee_score(3),
            'r4': self.get_referee_score(4),
            'r5': self.get_referee_score(5),
        }
    
    def save(self, *args, **kwargs):
        """Override save to track status changes and ensure team submitter is included"""
        # Track if status is changing to approved
        status_changed_to_approved = False
        
        if self.pk:  # Existing record
            try:
                old_instance = CategoryAthleteScore.objects.get(pk=self.pk)
                status_changed_to_approved = (old_instance.status != 'approved' and self.status == 'approved')
            except CategoryAthleteScore.DoesNotExist:
                pass
        
        # If submitted by athlete, set status to pending
        if self.submitted_by_athlete and not self.pk:
            self.status = 'pending'
        # If submitted by referee/admin, set status to approved
        elif not self.submitted_by_athlete:
            self.status = 'approved'
            
        super().save(*args, **kwargs)
        
        # For team results, ensure the submitting athlete is included in team members
        if self.type == 'teams' and self.athlete and not self.team_members.filter(pk=self.athlete.pk).exists():
            self.team_members.add(self.athlete)
        
        # Auto-populate Category awards when status changes to approved (only for admin approvals, not team creation)
        if status_changed_to_approved and self.submitted_by_athlete and self.placement_claimed:
            # Only update category text fields, don't create teams during auto-save
            self._update_category_awards_text_only()
    
    def approve(self, admin_user, notes=''):
        """
        Approve the athlete-submitted result and auto-populate Category
        awards. For team results, validates the minimum team size and
        performs the status transition, award update, and team
        creation/enrollment atomically so a failure never leaves the
        result approved without its corresponding team.
        """
        if (
            self.type == 'teams'
            and self.placement_claimed
            and self.team_members.count() < Team.MIN_MEMBERS
        ):
            raise ValidationError(
                f"A team result requires at least {Team.MIN_MEMBERS} team members before it can be approved."
            )

        with transaction.atomic():
            # Perform the transition without notifying yet; award/team
            # creation must succeed first so we never notify about a
            # change that gets rolled back.
            self._transition_status('approved', admin_user, notes)

            # Auto-populate Category awards if placement is claimed
            if self.submitted_by_athlete and self.placement_claimed:
                self._update_category_awards()

        # Notify only after the transaction has committed successfully.
        self._notify_result_status('approved', admin_user, notes)

    def reject(self, admin_user, notes=''):
        """Reject the athlete-submitted result"""
        self._transition_status('rejected', admin_user, notes, on_success=lambda obj, status, actor, message: self._notify_result_status(status, actor, message))

    def request_revision(self, admin_user, notes=''):
        """Request revision on the athlete-submitted result"""
        self._transition_status('revision_required', admin_user, notes, on_success=lambda obj, status, actor, message: self._notify_result_status(status, actor, message))

    def _notify_result_status(self, status, admin_user, notes):
        from ..notification_utils import create_result_status_notification
        create_result_status_notification(self, status, admin_user, notes)
    
    def _get_or_create_team(self):
        """
        Get (or create) the Team matching this result's exact set of team
        members, identified by membership rather than name. Raises
        ``ValidationError`` if fewer than ``Team.MIN_MEMBERS`` athletes are
        recorded. Cached per-instance since it's used by both the award
        text-field update and the auto-enrollment step.
        """
        if not hasattr(self, '_award_team'):
            team, _created = Team.get_or_create_by_members(
                self.team_members.all(), category=self.category
            )
            self._award_team = team
        return self._award_team
    
    def _update_category_awards_text_only(self):
        """Update only the category text fields without creating teams"""
        if not self.category or not self.placement_claimed:
            return
            
        category = self.category
        placement = self.placement_claimed.lower().replace(' place', '').strip()
        
        if self.type == 'teams' and self.team_members.exists():
            # Team result - create/get team and update ForeignKey fields
            team = self._get_or_create_team()
            
            if placement == '1st':
                category.first_place_team = team
            elif placement == '2nd':  
                category.second_place_team = team
            elif placement == '3rd':
                category.third_place_team = team
        else:
            # Individual result - update ForeignKey fields for all category types
            self._ensure_athlete_enrolled()
            
            if placement == '1st':
                category.first_place = self.athlete
            elif placement == '2nd':
                category.second_place = self.athlete
            elif placement == '3rd':
                category.third_place = self.athlete
                
        category.save()

    def _update_category_awards(self):
        """Update the Category model with the approved award placement and create teams"""
        if not self.category or not self.placement_claimed:
            return
            
        # First update the text fields
        self._update_category_awards_text_only()
        
        # Then create team objects for team results
        if self.type == 'teams' and self.team_members.exists():
            self._create_or_update_team()
    
    def _create_or_update_team(self):
        """
        Get/create the Team for this result's members and ensure it is
        enrolled in the category. Team identity and name synchronization
        are handled by ``_get_or_create_team()`` and the
        ``auto_generate_team_name`` m2m signal respectively.
        """
        if not self.team_members.exists():
            return None

        team = self._get_or_create_team()

        CategoryTeam.objects.get_or_create(category=self.category, team=team)

        return team
    
    def _ensure_athlete_enrolled(self):
        """Ensure the athlete is enrolled in the category before awarding placement"""
        try:
            # Check if athlete is already enrolled
            CategoryAthlete.objects.get(category=self.category, athlete=self.athlete)
        except CategoryAthlete.DoesNotExist:
            # Enroll the athlete in the category
            CategoryAthlete.objects.create(
                category=self.category,
                athlete=self.athlete
                # weight can be added later if needed
            )
    
    @classmethod
    def create_category_if_needed(cls, competition, name, category_type='solo', gender='mixt', group=None):
        """Create a category if it doesn't exist"""
        from ..models import Category
        
        category, created = Category.objects.get_or_create(
            name=name,
            competition=competition,
            defaults={
                'type': category_type,
                'gender': gender,
                'group': group
            }
        )
        return category, created
    


class CategoryTeamScore(models.Model):
    """
    Stores referee scores for teams in a category.
    """
    category = models.ForeignKey('Category', on_delete=models.CASCADE, verbose_name=_('Categorie'), related_name='team_scores')
    team = models.ForeignKey('Team', on_delete=models.CASCADE, verbose_name=_('Echipă'), related_name='category_scores')
    referee = models.ForeignKey('Athlete', on_delete=models.CASCADE, verbose_name=_('Arbitru'), limit_choices_to={'is_referee': True})
    score = models.IntegerField(_('Punctaj'), default=0)  # Score given by the referee

    class Meta:
        unique_together = ('category', 'team', 'referee')  # Ensure unique scores per referee and team
        verbose_name = _('Rezultat al echipei')
        verbose_name_plural = _('Rezultate ale echipelor')

    def __str__(self):
        return f"{self.team.name} - {self.category.name} - Arbitru: {self.referee.first_name} {self.referee.last_name}"


# NOTE: CategoryTeamAthleteScore model consolidated into CategoryAthleteScore with type='teams'
# This model is deprecated and will be removed after migration
# 
# class CategoryTeamAthleteScore(models.Model):
#     """
#     DEPRECATED: Team functionality moved to CategoryAthleteScore with type='teams'
#     """
#     pass


class FieldRecordingSession(models.Model):
    STATUS_CHOICES = [
        ('recording', 'Înregistrare în curs'),
        ('stopped', 'Oprită'),
        ('failed', 'Eșuată'),
    ]

    event = models.ForeignKey('landing.Event', on_delete=models.CASCADE, verbose_name=_('Eveniment'), related_name='field_recording_sessions')
    field = models.ForeignKey('CompetitionField', on_delete=models.CASCADE, verbose_name=_('Teren'), related_name='recording_sessions')
    title = models.CharField(_('Titlu'), max_length=255, blank=True)
    status = models.CharField(_('Stare'), max_length=20, choices=STATUS_CHOICES, default='recording')
    started_at = models.DateTimeField(_('Început la'))
    ended_at = models.DateTimeField(_('Încheiat la'), null=True, blank=True)
    obs_scene_name = models.CharField(_('Nume scenă OBS'), max_length=255, blank=True)
    obs_source_name = models.CharField(_('Nume sursă OBS'), max_length=255, blank=True)
    recording_file_name = models.CharField(_('Nume fișier înregistrare'), max_length=255, blank=True)
    recording_file_path = models.CharField(_('Cale fișier înregistrare'), max_length=500, blank=True)
    recording_url = models.URLField(_('URL înregistrare'), blank=True, max_length=500)
    notes = models.TextField(_('Note'), blank=True)
    metadata = models.JSONField(_('Metadate'), default=dict, blank=True)
    created_at = models.DateTimeField(_('Data creării'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Data actualizării'), auto_now=True)

    class Meta:
        ordering = ['-started_at', '-id']
        indexes = [
            models.Index(fields=['event', 'field', 'status']),
            models.Index(fields=['started_at']),
        ]
        verbose_name = _('Sesiune de înregistrare a terenului')
        verbose_name_plural = _('Sesiuni de înregistrare a terenului')

    def __str__(self):
        label = self.title or f"Înregistrare {self.field}"
        return f"{label} ({self.started_at:%Y-%m-%d %H:%M})"
