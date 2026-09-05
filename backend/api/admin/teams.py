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
    CategoryTeamInline,
    TeamAdminForm,
    TeamMemberInline,
)

@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    form = TeamAdminForm
    list_display = ('name', 'assigned_categories')  # Display team name and assigned categories
    readonly_fields = ('name',)
    inlines = [TeamMemberInline, CategoryTeamInline]  # Include both inlines
    search_fields = ('members__athlete__first_name', 'members__athlete__last_name')  # Search by team member names
    
    def get_search_results(self, request, queryset, search_term):
        """Custom search that searches team members' names"""
        queryset, use_distinct = super().get_search_results(request, queryset, search_term)
        if search_term:
            # Search by team member names
            queryset = queryset.filter(
                members__athlete__first_name__icontains=search_term
            ) | queryset.filter(
                members__athlete__last_name__icontains=search_term
            )
            use_distinct = True
        return queryset, use_distinct
    
    def get_fields(self, request, obj=None):
        """Only show readonly name field when editing, nothing when creating"""
        if obj:  # Editing existing team
            return ('name',)
        else:  # Creating new team
            return []  # Empty list - no fields shown
    
    def assigned_categories(self, obj):
        """
        Display the categories assigned to the team.
        """
        categories = obj.categories.all()
        return ", ".join([category.name for category in categories]) if categories else "Nicio categorie atribuită"
    assigned_categories.short_description = _('Categorii atribuite')

    def save_model(self, request, obj, form, change):
        """
        Save the team instance and validate that no duplicate team exists.
        """
        # Save the team instance first to ensure it has a primary key
        super().save_model(request, obj, form, change)

        # Validate that no team with the same set of athletes already exists
        team_members = set(obj.members.values_list('athlete', flat=True))
        existing_teams = Team.objects.exclude(pk=obj.pk)

        for team in existing_teams:
            existing_team_members = set(team.members.values_list('athlete', flat=True))
            if team_members == existing_team_members:
                raise ValueError("A team with the same members already exists.")
