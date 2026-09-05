from django.contrib import admin, messages
from django.contrib.admin.models import LogEntry
from django.contrib.admin.widgets import RelatedFieldWidgetWrapper
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from django.forms import ModelForm
from django.core.exceptions import ValidationError
from django import forms
from django.urls import path, reverse
from django.shortcuts import render
from django.http import JsonResponse, HttpResponseRedirect
from reversion.admin import VersionAdmin
from dal import autocomplete, forward
from ..bracket_visualization import bracket_visualization_readonly_field, BracketStats
from django.db import models, connection
from django.db.models import Count, Case, When, IntegerField, Func
from django.db.models.functions import Lower
import json
import urllib.parse
from django.utils.safestring import mark_safe
from django.template.response import TemplateResponse
from ..models import (
    City,
    Club,
    Athlete,
    SupporterAthleteRelation,
    TrainingSeminarParticipation,
    Grade,
    GradeHistory,
    Title,
    FederationRole,
    Category,
    SoloCategory,
    TeamCategory,
    FightCategory,
    FightAthleteWeight,
    Team,
    CategoryTeam,
    CategoryAthlete,
    Match,
    MatchEvent,
    MatchRefereeScore,
    RefereeScore,
    RefereePointEvent,
    CategoryAthleteScore,
    CategoryRefereeScore,
    CategoryRefereeAssignment,
    MatchRefereeAssignment,
    CategoryTeamScore,
    TeamMember,
    Group,
    MatchVideoRecording,
    AthletePerformanceVideo,
    TeamPerformanceVideo,
    CompetitionField,
    CategoryFieldAssignment,
    MatchFieldAssignment,
    MatchRound,
    CompetitionReferee,
    DisplayMonitorSession,
    Visa,
    Event,
    EventParticipation,
    UserProxy,
)


admin.site.enable_nav_sidebar = True



from ._common import (
    AthletePerformanceVideoForm,
    MatchVideoRecordingForm,
    TeamPerformanceVideoForm,
)

@admin.register(MatchVideoRecording)
class MatchVideoRecordingAdmin(admin.ModelAdmin):
    """Admin for match video recordings (Fight categories)"""
    form = MatchVideoRecordingForm
    list_display = ('match_display', 'category_display', 'group_display', 'competition_display', 'recorded_at', 'duration_display', 'is_public', 'uploaded_at')
    list_filter = ('is_public', 'recorded_at', 'match__category__event')
    search_fields = ('match__name', 'match__category__name', 'match__category__group__name', 'match__category__event__title')
    autocomplete_fields = ['match']
    # Inlines disabled: Point Event Timestamps and Video Segments features disabled for now
    
    fieldsets = [
        ('SURSĂ VIDEO', {
            'fields': ('match', 'video_file', 'video_url'),
            'description': 'Furnizează fie un fișier video, fie un URL video (YouTube, Vimeo etc.)'
        }),
        ('METADATE', {
            'fields': ('recorded_at', 'duration_seconds', 'is_public'),
        }),
    ]
    
    def match_display(self, obj):
        """Display match name"""
        return obj.match.name
    match_display.short_description = 'Meci'
    match_display.admin_order_field = 'match__name'
    
    def duration_display(self, obj):
        """Display duration in human-readable format"""
        if obj.duration_seconds:
            minutes = obj.duration_seconds // 60
            seconds = obj.duration_seconds % 60
            return f"{minutes}m {seconds}s"
        return '-'
    duration_display.short_description = 'Durată'

    def category_display(self, obj):
        """Display category name"""
        return obj.match.category.name if obj.match.category else 'Fără categorie'
    category_display.short_description = 'Categorie'
    category_display.admin_order_field = 'match__category__name'

    def group_display(self, obj):
        """Display category group"""
        if obj.match.category and obj.match.category.group:
            return obj.match.category.group.name
        return 'Fără grupă'
    group_display.short_description = 'Grupă'
    group_display.admin_order_field = 'match__category__group__name'

    def competition_display(self, obj):
        """Display competition/event title"""
        if obj.match.category and obj.match.category.event:
            return obj.match.category.event.title
        return 'Fără eveniment'
    competition_display.short_description = 'Eveniment'
    competition_display.admin_order_field = 'match__category__event__title'


# VIDEO RECORDING ADMIN CLASSES FOR ATHLETE AND TEAM PERFORMANCES
# ============================================================================

@admin.register(AthletePerformanceVideo)
class AthletePerformanceVideoAdmin(admin.ModelAdmin):
    """Admin for athlete performance videos (Solo categories)"""
    form = AthletePerformanceVideoForm
    list_display = ('athlete_display', 'category_display', 'group_display', 'competition_display', 'recorded_at', 'is_public', 'uploaded_at')
    list_filter = ('is_public', 'recorded_at', 'athlete_score__category__event')
    search_fields = ('athlete_score__athlete__first_name', 'athlete_score__athlete__last_name', 'athlete_score__category__name', 'athlete_score__category__group__name', 'athlete_score__category__event__title')
    # autocomplete_fields removed because CategoryAthleteScore admin is hidden
    
    fieldsets = [
        ('CATEGORIE SOLO', {
            'fields': ('athlete_score',),
        }),
        ('SURSĂ VIDEO', {
            'fields': ('video_file', 'video_url'),
            'description': 'Furnizează fie un fișier video, fie un URL video (YouTube, Vimeo etc.)'
        }),
        ('METADATE', {
            'fields': ('recorded_at', 'duration_seconds', 'is_public'),
        }),
    ]
    
    def athlete_display(self, obj):
        """Display athlete name"""
        athlete = obj.athlete_score.athlete
        return f"{athlete.first_name} {athlete.last_name}"
    athlete_display.short_description = 'Sportiv'
    
    def category_display(self, obj):
        """Display category name"""
        return obj.athlete_score.category.name
    category_display.short_description = 'Categorie'
    category_display.admin_order_field = 'athlete_score__category__name'

    def group_display(self, obj):
        """Display category group"""
        group = obj.athlete_score.category.group
        return group.name if group else 'Fără grupă'
    group_display.short_description = 'Grupă'
    group_display.admin_order_field = 'athlete_score__category__group__name'

    def competition_display(self, obj):
        """Display competition/event title"""
        event = obj.athlete_score.category.event
        return event.title if event else 'Fără eveniment'
    competition_display.short_description = 'Eveniment'
    competition_display.admin_order_field = 'athlete_score__category__event__title'


@admin.register(TeamPerformanceVideo)
class TeamPerformanceVideoAdmin(admin.ModelAdmin):
    """Admin for team performance videos (Team categories)"""
    form = TeamPerformanceVideoForm
    list_display = ('team_display', 'category_display', 'group_display', 'competition_display', 'recorded_at', 'is_public', 'uploaded_at')
    list_filter = ('is_public', 'recorded_at', 'category_team__category__event')
    search_fields = ('category_team__team__name', 'category_team__category__name', 'category_team__category__group__name', 'category_team__category__event__title')
    # autocomplete_fields removed - CategoryTeam admin is disabled
    
    fieldsets = [
        ('ECHIPĂ ȘI CATEGORIE', {
            'fields': ('category_team',),
        }),
        ('SURSĂ VIDEO', {
            'fields': ('video_file', 'video_url'),
            'description': 'Furnizează fie un fișier video, fie un URL video (YouTube, Vimeo etc.)'
        }),
        ('METADATE', {
            'fields': ('recorded_at', 'duration_seconds', 'is_public'),
        }),
    ]
    
    def team_display(self, obj):
        """Display team name"""
        return obj.category_team.team.name
    team_display.short_description = 'Echipă'
    
    def category_display(self, obj):
        """Display category name"""
        return obj.category_team.category.name
    category_display.short_description = 'Categorie'
    category_display.admin_order_field = 'category_team__category__name'

    def group_display(self, obj):
        """Display category group"""
        group = obj.category_team.category.group
        return group.name if group else 'Fără grupă'
    group_display.short_description = 'Grupă'
    group_display.admin_order_field = 'category_team__category__group__name'

    def competition_display(self, obj):
        """Display competition/event title"""
        event = obj.category_team.category.event
        return event.title if event else 'Fără eveniment'
    competition_display.short_description = 'Eveniment'
    competition_display.admin_order_field = 'category_team__category__event__title'


# @admin.register(CategoryTeam)  # Disabled - manage teams via TeamCategory admin inline