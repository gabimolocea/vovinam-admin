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
    AthleteInline,
    TrainingSeminarParticipationInline,
)

@admin.register(Club)
class ClubAdmin(admin.ModelAdmin):
    list_display = ('name', 'city', 'athlete_count', 'coach_count', 'address', 'mobile_number', 'website', 'created', 'modified')
    search_fields = ('name', 'city__name')
    autocomplete_fields = ('city',)
    filter_horizontal = ('coaches',)  # Add horizontal filter for ManyToManyField
    inlines = [AthleteInline]

    # Organize fields in the admin form
    fieldsets = (
        ('Detalii club', {
            'fields': ('name', 'logo', 'city', 'address', 'mobile_number', 'website')
        }),
        ('Antrenori', {
            'fields': ('coaches',),
            'description': 'Selectează sportivii care sunt antrenori pentru acest club. În listă apar doar sportivii marcați ca antrenori.'
        }),
        ('Marcaje temporale', {
            'fields': ('modified',)  # Only include editable fields
        }),
    )

    readonly_fields = ('created', 'modified')  # Mark non-editable fields as read-only

    class Media:
        js = ('/static/admin/js/club_tabs.js?v=20260206',)
    
    def athlete_count(self, obj):
        """Display the number of athletes in this club (uses the annotated count, no extra query)."""
        return obj.athlete_count_annotated
    athlete_count.short_description = _('Sportivi')
    athlete_count.admin_order_field = 'athlete_count_annotated'
    
    def coach_count(self, obj):
        """Display the number of coaches in this club (uses the annotated count, no extra query)."""
        return obj.coach_count_annotated
    coach_count.short_description = _('Antrenori')
    coach_count.admin_order_field = 'coach_count_annotated'
    
    def get_queryset(self, request):
        """Annotate athlete/coach counts and select the related city to avoid N+1 queries on the changelist."""
        qs = super().get_queryset(request)
        return qs.select_related('city').annotate(
            athlete_count_annotated=Count('athletes', distinct=True),
            coach_count_annotated=Count('coaches', distinct=True),
        )
    
    def formfield_for_manytomany(self, db_field, request, **kwargs):
        """Filter coaches to only show athletes who are marked as coaches"""
        if db_field.name == "coaches":
            club_id = None
            try:
                club_id = request.resolver_match.kwargs.get('object_id')
            except Exception:
                club_id = None
            coach_qs = Athlete.objects.filter(is_coach=True, status='approved')
            if club_id:
                coach_qs = coach_qs.filter(models.Q(club__isnull=True) | models.Q(club_id=club_id))
            else:
                coach_qs = coach_qs.filter(club__isnull=True)
            kwargs["queryset"] = coach_qs.order_by('first_name', 'last_name')
        return super().formfield_for_manytomany(db_field, request, **kwargs)

    def get_inline_instances(self, request, obj=None):
        inlines = super().get_inline_instances(request, obj)
        if obj:
            athlete_count = obj.athletes.count()
            for inline in inlines:
                if isinstance(inline, AthleteInline):
                    inline.verbose_name_plural = f"Sportivi ({athlete_count})"
        return inlines


# FrontendTheme admin removed â€” frontend theme management has been disabled.

# Original Athlete admin removed - using consolidated AthleteAdmin below

# Legacy MedicalVisa and AnnualVisa admin classes removed â€” use unified Visa admin instead.


# Provide the TrainingSeminarAdmin class for programmatic use (tests and callers)
# but do NOT register it with the admin site â€” seminars are managed via landing.Event.
class TrainingSeminarAdmin(admin.ModelAdmin):
    list_display = ('name', 'start_date', 'end_date', 'place')
    search_fields = ('name', 'place')
    list_filter = ('start_date', 'end_date', 'place')
    exclude = ('athletes',)
    inlines = [TrainingSeminarParticipationInline]

    def save_related(self, request, form, formsets, change):
        """After saving related objects in the admin, ensure any athletes enrolled
        via the admin have corresponding TrainingSeminarParticipation records with
        reviewed_by and reviewed_date set to the admin user.
        """
        super().save_related(request, form, formsets, change)

        instance = getattr(form, 'instance', None)
        if instance is None:
            return

        try:
            from django.utils import timezone
            from ..models import TrainingSeminarParticipation

            for athlete in instance.athletes.all():
                tsp, created = TrainingSeminarParticipation.objects.get_or_create(
                    athlete=athlete,
                    seminar=instance,
                    defaults={
                        'submitted_by_athlete': False,
                        'status': 'approved',
                        'reviewed_by': request.user,
                        'reviewed_date': timezone.now()
                    }
                )

                if not created and not tsp.submitted_by_athlete:
                    changed = False
                    if not tsp.reviewed_by:
                        tsp.reviewed_by = request.user
                        changed = True
                    if not tsp.reviewed_date:
                        tsp.reviewed_date = timezone.now()
                        changed = True
                    if changed:
                        tsp.save()
        except Exception:
            # Avoid breaking admin if DB constraints fail
            pass

# TrainingSeminar and TrainingSeminarParticipation are intentionally not registered in the
# admin to avoid duplication with Landing > Event (Event.event_type='training_seminar').
# Seminars are managed via the Landing Event admin. The models remain in the API for
# backward compatibility and existing integrations.

# Register Grade model with the new grade_type field