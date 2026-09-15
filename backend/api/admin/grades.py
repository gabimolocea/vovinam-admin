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
    list_display = ('athlete', 'grade', 'level', 'event', 'obtained_date', 'status', 'submitted_by_athlete')
    search_fields = ('athlete__first_name', 'athlete__last_name', 'grade__name', 'level')
    list_filter = ('status', 'submitted_by_athlete', 'level', 'event', 'obtained_date')
    # Use Django admin autocomplete for examiner fields and restrict choices to coaches
    autocomplete_fields = ('examiner_1', 'examiner_2')
    readonly_fields = ('certificate_image_preview',)
    actions = ['approve_pending', 'reject_pending']

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

    def certificate_image_preview(self, obj):
        try:
            if obj.certificate_image and hasattr(obj.certificate_image, 'url'):
                return format_html(
                    '<a href="{0}" target="_blank" rel="noopener noreferrer">'
                    '<img src="{0}" style="max-width:360px; max-height:360px; object-fit:contain; '
                    'border:1px solid #ccc; border-radius:4px;" />'
                    '</a>',
                    obj.certificate_image.url
                )
        except Exception:
            pass
        return _('Nu a fost trimisă o poză a certificatului.')
    certificate_image_preview.short_description = _('Poză certificat')

    def approve_pending(self, request, queryset):
        count = 0
        for obj in queryset.filter(status='pending'):
            obj.approve(request.user)
            count += 1
        if count:
            self.message_user(request, f'{count} examen(e) de grad aprobat(e).', level=messages.SUCCESS)
        else:
            self.message_user(request, 'Nicio înregistrare selectată nu este în așteptare.', level=messages.WARNING)
    approve_pending.short_description = _('Aprobă examenele de grad în așteptare (pentru selecție)')

    def reject_pending(self, request, queryset):
        count = 0
        for obj in queryset.filter(status='pending'):
            obj.reject(request.user, 'Examenul de grad nu a fost aprobat.')
            count += 1
        if count:
            self.message_user(request, f'{count} examen(e) de grad respins(e).', level=messages.SUCCESS)
        else:
            self.message_user(request, 'Nicio înregistrare selectată nu este în așteptare.', level=messages.WARNING)
    reject_pending.short_description = _('Respinge examenele de grad în așteptare (pentru selecție)')

    # Do not use readonly_fields beyond the preview above, to allow editing in the standalone GradeHistory admin panel

# Register Title model