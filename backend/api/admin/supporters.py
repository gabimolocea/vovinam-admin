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
    CategoryRefereeScoreInline,
    CategoryTeamScoreInline,
)

@admin.register(SupporterAthleteRelation)
class SupporterAthleteRelationAdmin(admin.ModelAdmin):
    list_display = ['supporter', 'athlete', 'relationship', 'status', 'can_edit', 'can_register_competitions', 'created']
    list_filter = ['status', 'relationship', 'can_edit', 'can_register_competitions', 'created']
    search_fields = ['supporter__username', 'supporter__email', 'athlete__first_name', 'athlete__last_name']
    ordering = ['-created']
    actions = ['approve_relations', 'reject_relations']

    def approve_relations(self, request, queryset):
        for relation in queryset:
            relation.approve(request.user)
    approve_relations.short_description = 'Aprobă relațiile selectate'

    def reject_relations(self, request, queryset):
        for relation in queryset:
            relation.reject(request.user)
    reject_relations.short_description = 'Respinge relațiile selectate'


# Note: CategoryAthleteScore has no standalone admin page; scores are managed
# via CategoryTeamScoreInline/CategoryRefereeScoreInline on the category admins.


# DISABLED INLINES (for future use):
# MatchVideoSegmentInline - Manage video segments/round timestamps
# RefereePointEventTimestampInline - Link point events to video timestamps
# Disabled because timestamp features are not needed yet.
# To re-enable: uncomment and add back to MatchVideoRecordingAdmin.inlines.
#
# class MatchVideoSegmentInline(admin.TabularInline):
#     """Inline for managing video segments within a match video"""
#     model = MatchVideoSegment
#     extra = 1
#
# class RefereePointEventTimestampInline(admin.TabularInline):
#     """Inline for linking point events to video timestamps"""
#     model = RefereePointEventTimestamp
#     extra = 0

