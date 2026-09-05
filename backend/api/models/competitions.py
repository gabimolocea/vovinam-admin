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

class DiplomaTemplate(models.Model):
    TEMPLATE_KIND_CHOICES = [
        ('first_place', 'Locul 1'),
        ('second_place', 'Locul 2'),
        ('third_place', 'Locul 3'),
        ('participation', 'Participare'),
    ]
    CATEGORY_SCOPE_CHOICES = [
        ('all', 'Toate categoriile'),
        ('solo', 'Solo'),
        ('team', 'Echipă'),
        ('fight', 'Luptă'),
    ]
    PREVIEW_ORIENTATION_CHOICES = [
        ('landscape', 'Landscape'),
        ('portrait', 'Portrait'),
    ]

    event = models.ForeignKey('landing.Event', on_delete=models.CASCADE, related_name='diploma_templates')
    title = models.CharField(max_length=120)
    template_kind = models.CharField(max_length=20, choices=TEMPLATE_KIND_CHOICES)
    category_scope = models.CharField(max_length=12, choices=CATEGORY_SCOPE_CHOICES, default='all')
    pdf_file = models.FileField(upload_to='diploma_templates/')
    preview_orientation = models.CharField(max_length=12, choices=PREVIEW_ORIENTATION_CHOICES, default='landscape')
    placements = models.JSONField(default=list, blank=True, help_text='Listă de câmpuri poziționate pe diploma PDF.')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['event_id', 'category_scope', 'template_kind', 'id']
        unique_together = ('event', 'template_kind', 'category_scope')

    def __str__(self):
        return f"{self.event.title} - {self.get_template_kind_display()} - {self.get_category_scope_display()}"

class CategoryAthlete(models.Model):
    """
    Through model for the many-to-many relationship between Category and Athlete.
    """
    PLACE_CHOICES = [
        (1, '1st Place'),
        (2, '2nd Place'),
        (3, '3rd Place'),
    ]
    
    category = models.ForeignKey('Category', on_delete=models.CASCADE, related_name="enrolled_athletes")
    athlete = models.ForeignKey('Athlete', on_delete=models.CASCADE)
    weight = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)  # Weight in kilograms
    place = models.PositiveSmallIntegerField(choices=PLACE_CHOICES, null=True, blank=True, help_text='Award placement (auto-calculated from total score)')
    disqualified = models.BooleanField(default=False, help_text='Mark as disqualified')
    
    # Referee scores for solo categories
    ref1_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='REF1', help_text='Referee 1 score')
    ref2_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='REF2', help_text='Referee 2 score')
    ref3_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='REF3', help_text='Referee 3 score')
    ref4_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='REF4', help_text='Referee 4 score')
    ref5_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='REF5', help_text='Referee 5 score')
    
    @property
    def total_score(self):
        """Calculate total score excluding highest and lowest referee scores"""
        from decimal import Decimal
        scores = [s for s in [self.ref1_score, self.ref2_score, self.ref3_score, self.ref4_score, self.ref5_score] if s is not None]
        if len(scores) < 3:
            return None
        scores.sort()
        # Remove highest and lowest, sum the rest
        return sum(scores[1:-1])
    
    @property
    def scores_with_markup(self):
        """Return scores with highest/lowest marked for strikethrough"""
        scores = [
            (self.ref1_score, 'ref1'),
            (self.ref2_score, 'ref2'),
            (self.ref3_score, 'ref3'),
            (self.ref4_score, 'ref4'),
            (self.ref5_score, 'ref5')
        ]
        valid_scores = [(s, n) for s, n in scores if s is not None]
        if len(valid_scores) < 3:
            return scores
        
        sorted_scores = sorted(valid_scores, key=lambda x: x[0])
        lowest = sorted_scores[0][1]
        highest = sorted_scores[-1][1]
        
        return [(s, n, n == lowest or n == highest) for s, n in scores]

    class Meta:
        unique_together = ('category', 'athlete')  # Ensure an athlete cannot be added twice to the same category
        indexes = [
            models.Index(fields=['category']),
            models.Index(fields=['athlete']),
            models.Index(fields=['category', 'disqualified']),
        ]

    def delete(self, *args, **kwargs):
        """
        Override the delete method to remove the result from the database.
        """
        # Perform any additional cleanup if needed
        super().delete(*args, **kwargs)

    def __str__(self):
        return f"{self.athlete.first_name} {self.athlete.last_name} in {self.category.name} (Weight: {self.weight} kg)"
    
           
class CategoryTeam(models.Model):
    """
    Through model for the many-to-many relationship between Category and Team.
    """
    PLACE_CHOICES = [
        (1, '1st Place'),
        (2, '2nd Place'),
        (3, '3rd Place'),
    ]
    
    category = models.ForeignKey('Category', on_delete=models.CASCADE, related_name='enrolled_teams')
    team = models.ForeignKey('Team', on_delete=models.CASCADE, related_name='enrolled_categories')  # Rename related_name
    place = models.PositiveSmallIntegerField(choices=PLACE_CHOICES, null=True, blank=True, help_text='Award placement (auto-calculated from total score)')
    disqualified = models.BooleanField(default=False, help_text='Mark as disqualified')
    
    # Referee scores for team categories
    ref1_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='REF1', help_text='Referee 1 score')
    ref2_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='REF2', help_text='Referee 2 score')
    ref3_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='REF3', help_text='Referee 3 score')
    ref4_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='REF4', help_text='Referee 4 score')
    ref5_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='REF5', help_text='Referee 5 score')
    
    @property
    def total_score(self):
        """Calculate total score excluding highest and lowest referee scores"""
        from decimal import Decimal
        scores = [s for s in [self.ref1_score, self.ref2_score, self.ref3_score, self.ref4_score, self.ref5_score] if s is not None]
        if len(scores) < 3:
            return None
        scores.sort()
        # Remove highest and lowest, sum the rest
        return sum(scores[1:-1])
    
    @property
    def scores_with_markup(self):
        """Return scores with highest/lowest marked for strikethrough"""
        scores = [
            (self.ref1_score, 'ref1'),
            (self.ref2_score, 'ref2'),
            (self.ref3_score, 'ref3'),
            (self.ref4_score, 'ref4'),
            (self.ref5_score, 'ref5')
        ]
        valid_scores = [(s, n) for s, n in scores if s is not None]
        if len(valid_scores) < 3:
            return scores
        
        sorted_scores = sorted(valid_scores, key=lambda x: x[0])
        lowest = sorted_scores[0][1]
        highest = sorted_scores[-1][1]
        
        return [(s, n, n == lowest or n == highest) for s, n in scores]

    class Meta:
        unique_together = ('category', 'team')  # Ensure a team cannot be added twice to the same category
        indexes = [
            models.Index(fields=['category']),
            models.Index(fields=['team']),
        ]

    def __str__(self):
        category = self.category
        group = category.group if category else None
        event = category.event if category else None
        group_name = group.name if group else 'No Group'
        event_title = event.title if event else 'No Competition'
        return (
            f"{self.team.name} - "
            f"{category.name} - {group_name} - {event_title}"
        )


class Category(models.Model):
    def __init__(self, *args, **kwargs):
        competition = kwargs.pop('competition', None)
        super().__init__(*args, **kwargs)
        if competition is not None and getattr(self, 'event_id', None) is None:
            self.event = competition

    @property
    def type(self):
        """Return the type of category as a string: 'solo', 'team', or 'fight' based on subclass."""
        if hasattr(self, 'solocategory'):
            return 'solo'
        if hasattr(self, 'teamcategory'):
            return 'team'
        if hasattr(self, 'fightcategory'):
            return 'fight'
        return 'unknown'
    """
    Base category model using multi-table inheritance.
    Specific category types (Solo, Team, Fight) extend this model.
    """
    GENDER_CHOICES = [
        ('male', 'Male'),
        ('female', 'Female'),
        ('mixt', 'Mixt'),
    ]
    
    category_number = models.CharField(max_length=50, blank=True, null=True, help_text='Unique identifier for this category (e.g., C1, C2, SOLO-M-1)')
    name = models.CharField(max_length=100)
    event = models.ForeignKey('landing.Event', on_delete=models.CASCADE, related_name='categories', null=True, blank=True)
    gender = models.CharField(max_length=20, choices=GENDER_CHOICES, default='mixt')
    
    # M2M relationships shared across all types - defined here but used by child classes
    athletes = models.ManyToManyField('Athlete', through='CategoryAthlete', related_name='categories', blank=True)
    teams = models.ManyToManyField('Team', through='CategoryTeam', related_name='category_teams', blank=True)
    
    group = models.ForeignKey(
        'Group',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='categories'
    )
    birth_year_start = models.IntegerField(
        null=True, blank=True,
        help_text="Optional sub-range start (oldest birth year). Used for fight categories within a group."
    )
    birth_year_end = models.IntegerField(
        null=True, blank=True,
        help_text="Optional sub-range end (newest birth year). Used for fight categories within a group."
    )
    display_order = models.IntegerField(default=0, help_text="Order within the group for display purposes")

    class Meta:
        indexes = [
            models.Index(fields=['event']),
        ]
        ordering = ['display_order', 'id']
        verbose_name_plural = 'Categories'

    def __str__(self):
        associated = getattr(self, 'event', None) or getattr(self, 'competition', None)
        assoc_name = None
        if associated is not None:
            assoc_name = getattr(associated, 'name', None) or getattr(associated, 'title', None)
        return f"{self.name} ({assoc_name or 'N/A'})"

    @property
    def event_or_competition(self):
        """Return linked Event or fallback to legacy Competition"""
        if getattr(self, 'event', None):
            return self.event
        return getattr(self, 'competition', None)

    @property
    def competition(self):
        return self.event

    @competition.setter
    def competition(self, value):
        self.event = value
    
    def _generate_category_number(self):
        """Auto-generate category number based on type and gender"""
        # Determine category type by checking class name
        class_name = self.__class__.__name__.lower()
        
        if 'solo' in class_name:
            prefix = 'S' if self.gender == 'male' else ('SF' if self.gender == 'female' else 'SM')
        elif 'team' in class_name:
            prefix = 'T' if self.gender == 'male' else ('TF' if self.gender == 'female' else 'TM')
        elif 'fight' in class_name:
            prefix = 'F' if self.gender == 'male' else ('FF' if self.gender == 'female' else 'FM')
        else:
            prefix = 'C'
        
        # Find the highest existing number with this prefix
        import re
        existing = Category.objects.filter(
            category_number__startswith=prefix
        ).exclude(id=self.id if self.id else None).values_list('category_number', flat=True)
        
        max_num = 0
        for num_str in existing:
            match = re.search(r'\d+$', num_str)
            if match:
                max_num = max(max_num, int(match.group()))
        
        return f"{prefix}{max_num + 1}"
    
    def save(self, *args, **kwargs):
        """Auto-generate category_number if not provided"""
        if not self.category_number:
            self.category_number = self._generate_category_number()
        super().save(*args, **kwargs)


class SoloCategory(Category):
    """
    Solo competition category - individual athletes compete.
    Athletes enrolled via CategoryAthlete M2M (inherited from Category).
    """
    # Individual awards
    first_place = models.ForeignKey('Athlete', on_delete=models.SET_NULL, null=True, blank=True, related_name='solo_first_place_categories')
    second_place = models.ForeignKey('Athlete', on_delete=models.SET_NULL, null=True, blank=True, related_name='solo_second_place_categories')
    third_place = models.ForeignKey('Athlete', on_delete=models.SET_NULL, null=True, blank=True, related_name='solo_third_place_categories')

    class Meta:
        verbose_name = 'Solo Category'
        verbose_name_plural = 'Solo Categories'

    def clean(self):
        """Validate awards are enrolled athletes"""
        awarded = [self.first_place, self.second_place, self.third_place]
        awarded = list(filter(None, awarded))
        
        if len(set(awarded)) != len(awarded):
            raise ValidationError("The same athlete cannot be awarded multiple times.")
        
        for athlete in awarded:
            if athlete and not self.athletes.filter(pk=athlete.pk).exists():
                raise ValidationError(f"Athlete '{athlete}' must be enrolled to be awarded.")

    def calculate_athlete_scores(self):
        """Calculate total scores for each athlete"""
        athlete_scores = {}
        for score in self.athlete_scores.all():
            athlete_scores[score.athlete] = athlete_scores.get(score.athlete, 0) + score.score
        return athlete_scores


class TeamCategory(Category):
    """
    Team competition category - teams of athletes compete.
    Teams enrolled via CategoryTeam M2M (inherited from Category).
    """
    # Team awards
    first_place_team = models.ForeignKey('Team', on_delete=models.SET_NULL, null=True, blank=True, related_name='first_place_team_categories')
    second_place_team = models.ForeignKey('Team', on_delete=models.SET_NULL, null=True, blank=True, related_name='second_place_team_categories')
    third_place_team = models.ForeignKey('Team', on_delete=models.SET_NULL, null=True, blank=True, related_name='third_place_team_categories')

    class Meta:
        verbose_name = 'Team Category'
        verbose_name_plural = 'Team Categories'

    def clean(self):
        """Validate awards are enrolled teams"""
        awarded = [self.first_place_team, self.second_place_team, self.third_place_team]
        awarded = list(filter(None, awarded))
        
        if len(set(awarded)) != len(awarded):
            raise ValidationError("The same team cannot be awarded multiple times.")
        
        for team in awarded:
            if team and not self.teams.filter(pk=team.pk).exists():
                raise ValidationError(f"Team '{team}' must be enrolled to be awarded.")


class FightCategory(Category):
    """
    Fight competition category - bracket-style matches between individual athletes.
    Athletes enrolled via CategoryAthlete M2M (inherited from Category).
    Matches created for bracket generation.
    """
    # Fight-specific awards
    first_place = models.ForeignKey('Athlete', on_delete=models.SET_NULL, null=True, blank=True, related_name='fight_first_place_categories')
    second_place = models.ForeignKey('Athlete', on_delete=models.SET_NULL, null=True, blank=True, related_name='fight_second_place_categories')
    third_place = models.ForeignKey('Athlete', on_delete=models.SET_NULL, null=True, blank=True, related_name='fight_third_place_categories')

    class Meta:
        verbose_name = 'Fight Category'
        verbose_name_plural = 'Fight Categories'

    def clean(self):
        """Validate awards are enrolled athletes"""
        awarded = [self.first_place, self.second_place, self.third_place]
        awarded = list(filter(None, awarded))
        
        if len(set(awarded)) != len(awarded):
            raise ValidationError("The same athlete cannot be awarded multiple times.")
        
        for athlete in awarded:
            if athlete and not self.athletes.filter(pk=athlete.pk).exists():
                raise ValidationError(f"Athlete '{athlete}' must be enrolled to be awarded.")


class FightGroupEnrollment(models.Model):
    """
    Pre-registration pool for fight athletes per event group.
    Athletes can be weighted first, then assigned to fight categories later.
    """

    event = models.ForeignKey('Competition', on_delete=models.CASCADE, related_name='fight_group_enrollments')
    group = models.ForeignKey('Group', on_delete=models.CASCADE, related_name='fight_group_enrollments')
    athlete = models.ForeignKey('Athlete', on_delete=models.CASCADE, related_name='fight_group_enrollments')
    registered_weight_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    notes = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('event', 'group', 'athlete')
        indexes = [
            models.Index(fields=['event', 'group'], name='api_fightgr_event_i_eb4365_idx'),
            models.Index(fields=['athlete'], name='api_fightgr_athlete_8e4255_idx'),
        ]
        verbose_name = 'Fight Group Enrollment'
        verbose_name_plural = 'Fight Group Enrollments'

    def __str__(self):
        return f"{self.athlete} @ {self.group} ({self.event})"


class FightAthleteWeight(models.Model):
    """
    Track weight-in data for athletes in fight categories.
    Registered weight: submitted ~1 week before competition
    Match day weight: measured on competition day
    Used to detect disqualifications due to excessive weight loss
    """
    PLACE_CHOICES = [
        (1, '1st Place'),
        (2, '2nd Place'),
        (3, '3rd Place'),
    ]
    
    category = models.ForeignKey('FightCategory', on_delete=models.CASCADE, related_name='athlete_weights')
    athlete = models.ForeignKey('Athlete', on_delete=models.CASCADE, related_name='fight_weights')
    pre_weight_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='Registered Weight (kg)', help_text='Weight submitted ~1 week before competition')
    current_weight_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='Match Day Weight (kg)', help_text='Weight measured on competition day')
    weight_loss_percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, editable=False, help_text='Calculated percentage weight loss')
    is_disqualified = models.BooleanField(default=False, help_text='Mark as disqualified if weight exceeds limits')
    disqualification_reason = models.CharField(max_length=255, blank=True, help_text='Reason for disqualification')
    place = models.PositiveSmallIntegerField(choices=PLACE_CHOICES, null=True, blank=True, help_text='Award placement')
    recorded_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('category', 'athlete')
        verbose_name = 'Fight Athlete Weight'
        verbose_name_plural = 'Fight Athlete Weights'

    def __str__(self):
        return f"{self.athlete} - {self.category.name}"

    def save(self, *args, **kwargs):
        """Calculate weight loss percentage before saving"""
        if self.pre_weight_kg and self.current_weight_kg:
            loss = self.pre_weight_kg - self.current_weight_kg
            self.weight_loss_percentage = (loss / self.pre_weight_kg) * 100
        super().save(*args, **kwargs)

    def get_weight_loss_display(self):
        """Display weight loss in kg and percentage"""
        if self.pre_weight_kg and self.current_weight_kg:
            loss_kg = self.pre_weight_kg - self.current_weight_kg
            return f"{loss_kg:.2f}kg ({self.weight_loss_percentage:.1f}%)" if self.weight_loss_percentage else f"{loss_kg:.2f}kg"
        return "Incomplete"

