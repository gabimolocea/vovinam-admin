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
    GradeHistoryAdminForm,
)

@admin.register(Grade)
class GradeAdmin(admin.ModelAdmin):
    list_display = ('name', 'rank_order', 'grade_type', 'image_preview', 'created', 'modified')
    search_fields = ('name', 'grade_type')
    list_filter = ('grade_type', 'created', 'modified')
    readonly_fields = ('image_preview',)
    
    def image_preview(self, obj):
        if obj.image:
            return format_html('<img src="{}" style="max-height: 50px; max-width: 100px;" />', obj.image.url)
        return '-'
    image_preview.short_description = 'Previzualizare imagine'



# Updated GradeHistoryAdmin
@admin.register(GradeHistory)
class GradeHistoryAdmin(admin.ModelAdmin):
    list_display = ('athlete', 'grade', 'level', 'event', 'obtained_date')
    search_fields = ('athlete__first_name', 'athlete__last_name', 'grade__name', 'level')
    list_filter = ('level', 'event', 'obtained_date')
    # Use Django admin autocomplete for examiner fields and restrict choices to coaches
    autocomplete_fields = ('examiner_1', 'examiner_2')

    # Use the custom form to show friendly validation messages in the admin
    form = GradeHistoryAdminForm

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        """
        Restrict examiner_1 and examiner_2 foreign key dropdowns to athletes that are coaches.
        This provides an autocomplete that only shows athletes with is_coach=True.
        """
        if db_field.name in ('examiner_1', 'examiner_2'):
            kwargs['queryset'] = Athlete.objects.filter(is_coach=True)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def get_changeform_initial_data(self, request):
        # Prefill the athlete field when ?athlete=<id> is provided in the URL
        initial = super().get_changeform_initial_data(request) or {}
        athlete_id = request.GET.get('athlete')
        if athlete_id:
            initial['athlete'] = athlete_id
        return initial

    # Do not use readonly_fields here to allow editing in the standalone GradeHistory admin panel

# Register Title model