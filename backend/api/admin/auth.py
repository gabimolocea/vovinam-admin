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


@admin.register(Group)
class GroupAdmin(admin.ModelAdmin):
    """
    Admin configuration for the Group model.
    Manages age-based groups for organizing categories.
    """
    list_display = ('name', 'event', 'get_age_range', 'get_category_count')
    search_fields = ('name', 'event__title')
    list_filter = ('event',)
    fieldsets = (
        ('Informații de bază', {
            'fields': ('name', 'event')
        }),
        ('Interval vârstă', {
            'fields': ('birth_year_start', 'birth_year_end'),
            'description': 'Definește intervalul anilor de naștere pentru sportivii din această grupă (de exemplu, 2015-2018)'
        }),
    )
    
    def get_queryset(self, request):
        """Select related event and annotate category count to avoid N+1 queries."""
        qs = super().get_queryset(request)
        return qs.select_related('event').annotate(category_count_annotated=Count('categories', distinct=True))

    def get_age_range(self, obj):
        """Display the age range for this group"""
        if obj.birth_year_start and obj.birth_year_end:
            return f"{obj.birth_year_start} - {obj.birth_year_end}"
        elif obj.birth_year_start:
            return f"{obj.birth_year_start}+"
        elif obj.birth_year_end:
            return f"până la {obj.birth_year_end}"
        return "Nesetat"
    get_age_range.short_description = 'Interval ani naștere'
    
    def get_category_count(self, obj):
        """Display number of categories in this group (uses the annotated count, no extra query)"""
        return f"{obj.category_count_annotated} categorii"
    get_category_count.short_description = 'Categorii'
    get_category_count.admin_order_field = 'category_count_annotated'


# User Admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from ..models import User, UserProxy


@admin.register(UserProxy)
class UserAdmin(BaseUserAdmin):
    """Custom User admin with role management."""
    list_display = ('email', 'first_name', 'last_name', 'role', 'is_active', 'date_joined')
    list_filter = ('role', 'is_active', 'is_staff', 'is_superuser', 'date_joined')
    search_fields = ('email', 'first_name', 'last_name', 'username')
    ordering = ('-date_joined',)
    
    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Date personale', {'fields': ('first_name', 'last_name', 'email')}),
        ('Rol și permisiuni', {'fields': ('role', 'is_active', 'is_staff', 'is_superuser')}),
        ('Grupuri și permisiuni', {'fields': ('groups', 'user_permissions')}),
        ('Date importante', {'fields': ('last_login', 'date_joined')}),
    )
    
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'email', 'first_name', 'last_name', 'password1', 'password2', 'role'),
        }),
    )


# Athlete Profile Management Admin