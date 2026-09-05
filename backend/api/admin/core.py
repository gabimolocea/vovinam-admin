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


@admin.register(City)
class CityAdmin(admin.ModelAdmin):
    list_display = ('name', 'created', 'modified')
    search_fields = ('name',)
    ordering = ('name',)

    def get_search_results(self, request, queryset, search_term):
        queryset, use_distinct = super().get_search_results(request, queryset, search_term)
        if not search_term:
            return queryset, use_distinct

        import unicodedata

        def normalize(value: str) -> str:
            if not value:
                return ''
            normalized = unicodedata.normalize('NFKD', value)
            return ''.join(ch for ch in normalized if not unicodedata.combining(ch)).lower()

        norm_query = normalize(search_term.strip())
        if not norm_query:
            return queryset, use_distinct

        if connection.vendor == 'postgresql':
            # Do the accent-insensitive match/ranking in the database using the
            # 'unaccent' extension, instead of loading every City row into
            # Python on each keystroke (this table has 10k+ rows from the
            # GeoNames RO import).
            queryset = (
                City.objects.annotate(
                    _normalized_name=Lower(Func(models.F('name'), function='unaccent')),
                )
                .filter(_normalized_name__icontains=norm_query)
                .annotate(
                    _order=Case(
                        When(_normalized_name=norm_query, then=0),
                        When(_normalized_name__startswith=norm_query, then=1),
                        default=2,
                        output_field=IntegerField(),
                    ),
                )
                .order_by('_order', 'name')
            )
            return queryset, use_distinct

        # Non-PostgreSQL backends (SQLite in local dev/tests) have no
        # 'unaccent' function available, so fall back to the Python-side scan.
        matches = []
        for row in City.objects.values('id', 'name'):
            norm_name = normalize(row['name'])
            if norm_query in norm_name:
                # score: exact match first, then startswith, then contains
                if norm_name == norm_query:
                    score = 0
                elif norm_name.startswith(norm_query):
                    score = 1
                else:
                    score = 2
                matches.append((score, row['name'], row['id']))

        if matches:
            matches.sort(key=lambda x: (x[0], x[1]))
            ordered_ids = [m[2] for m in matches]
            preserved = Case(
                *[When(id=pk, then=pos) for pos, pk in enumerate(ordered_ids)],
                output_field=IntegerField(),
            )
            queryset = City.objects.filter(id__in=ordered_ids).annotate(_order=preserved).order_by('_order')
        return queryset, use_distinct
    
    def has_module_permission(self, request):
        """Hide City from the admin app index/sidebar while keeping it registered for lookups/autocompletes."""
        return False

    # Backwards-compatible alias in case older Django versions call this method name
    def has_module_perms(self, request):
        return False

# Register Club model
@admin.register(LogEntry)
class LogEntryAdmin(admin.ModelAdmin):
    list_display = ('action_time', 'user', 'content_type', 'object_link', 'action_flag', 'change_message_summary')
    list_filter = ('action_flag', 'content_type', 'user')
    search_fields = ('object_repr', 'change_message', 'user__email', 'user__first_name', 'user__last_name')
    readonly_fields = ('action_time', 'user', 'content_type', 'object_id', 'object_repr', 'action_flag', 'change_message')
    date_hierarchy = 'action_time'
    ordering = ('-action_time',)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def object_link(self, obj):
        if not obj.content_type_id or not obj.object_id:
            return obj.object_repr
        try:
            return format_html(
                '<a href="{}">{}</a>',
                reverse(f'admin:{obj.content_type.app_label}_{obj.content_type.model}_change', args=[obj.object_id]),
                obj.object_repr,
            )
        except Exception:
            return obj.object_repr

    object_link.short_description = 'Obiect'

    def change_message_summary(self, obj):
        if not obj.change_message:
            return '—'
        return obj.change_message[:160]

    change_message_summary.short_description = 'Modificări'
