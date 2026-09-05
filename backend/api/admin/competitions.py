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
    CategoryAdminForm,
    CategoryAthleteInline,
    CategoryFieldAssignmentInline,
    CategoryRefereeAssignmentInline,
    EnrolledTeamsInline,
    FightAthleteWeightInline,
    MatchInline,
    TeamPerformanceVideoInline,
)

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    """Admin for base Category model to support autocomplete"""
    form = CategoryAdminForm
    inlines = [CategoryFieldAssignmentInline]
    list_display = ('id', 'name_link', 'group', 'event')
    search_fields = ('name', 'event__title')
    list_filter = ('event', 'group')

    def name_link(self, obj):
        url = reverse('admin:api_category_change', args=(obj.pk,))
        return format_html('<a href="{}" style="font-weight: 500;">{}</a>', url, obj.name)
    name_link.short_description = 'Nume'
    name_link.admin_order_field = 'name'
    
@admin.register(SoloCategory)
class SoloCategoryAdmin(VersionAdmin, admin.ModelAdmin):
    list_display = ('category_id_display', 'category_name_display', 'event', 'get_group_display', 'gender', 'display_winners')
    search_fields = ('name', 'event__title', 'gender', 'group__name')
    list_filter = ('event', 'gender', 'group')
    autocomplete_fields = ['group']
    competition_field = 'event'
    
    fieldsets = [
        ('Detalii categorie', {
            'fields': ('event', 'group', 'name', 'gender'),
            'description': 'Grupa organizează categoriile pe intervale de vârstă (de exemplu, sportivi născuți între 2015-2018). Atribuie locurile direct în secțiunea Sportivi de mai jos.'
        }),
    ]

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'group':
            event_id = request.GET.get('event')
            if event_id:
                kwargs['queryset'] = Group.objects.filter(event_id=event_id)
            else:
                obj_id = request.resolver_match.kwargs.get('object_id') if request.resolver_match else None
                if obj_id:
                    try:
                        current = SoloCategory.objects.get(pk=obj_id)
                        if current.event_id:
                            kwargs['queryset'] = Group.objects.filter(event_id=current.event_id)
                    except SoloCategory.DoesNotExist:
                        pass
        return super().formfield_for_foreignkey(db_field, request, **kwargs)
    
    def category_id_display(self, obj):
        """Display category ID as read-only"""
        return obj.pk
    category_id_display.short_description = 'ID'
    category_id_display.admin_order_field = 'pk'
    
    def category_name_display(self, obj):
        """Display category name as bold clickable link"""
        url = reverse('admin:api_solocategory_change', args=(obj.pk,))
        return format_html('<a href="{}" style="font-weight: 500;">{}</a>', url, obj.name)
    category_name_display.short_description = 'Nume categorie'
    category_name_display.admin_order_field = 'name'
    
    def get_group_display(self, obj):
        """Display group with age range"""
        if obj.group:
            if obj.group.birth_year_start and obj.group.birth_year_end:
                return f"{obj.group.name} ({obj.group.birth_year_start}-{obj.group.birth_year_end})"
            return obj.group.name
        return "Fără grupă"
    get_group_display.short_description = 'Grupă de vârstă'
    get_group_display.admin_order_field = 'group__name'
    
    def get_inlines(self, request, obj=None):
        """Include referees and athletes for solo categories"""
        inlines = []
        if obj:
            inlines.append(CategoryFieldAssignmentInline)
            inlines.append(CategoryRefereeAssignmentInline)
            inlines.append(CategoryAthleteInline)
        return inlines
    
    def save_formset(self, request, form, formset, change):
        """Ensure CategoryRefereeAssignment gets the correct category_id"""
        # For CategoryRefereeAssignmentInline, handle the OneToOne relationship properly
        if formset.model == CategoryRefereeAssignment:
            parent_pk = form.instance.pk
            
            if not parent_pk:
                # Parent not yet saved - don't try to save the inline
                return
            
            # Get or create the assignment for this category
            assignment, created = CategoryRefereeAssignment.objects.get_or_create(
                category_id=parent_pk
            )
            
            # Update it with form data WITHOUT calling formset.save()
            # (which would try to create a duplicate record)
            for inline_form in formset.forms:
                if inline_form.cleaned_data and not inline_form.cleaned_data.get('DELETE', False):
                    # Read referee values directly from cleaned form data
                    assignment.referee_1 = inline_form.cleaned_data.get('referee_1')
                    assignment.referee_2 = inline_form.cleaned_data.get('referee_2')
                    assignment.referee_3 = inline_form.cleaned_data.get('referee_3')
                    assignment.referee_4 = inline_form.cleaned_data.get('referee_4')
                    assignment.referee_5 = inline_form.cleaned_data.get('referee_5')
                    assignment.save()
                    break  # Only process first form (max_num=1)
            
            # Set attributes Django admin expects for change message
            # For new objects, add to new_objects; for updates, leave empty
            # (changed_objects format is complex and not needed for our case)
            formset.new_objects = [assignment] if created else []
            formset.changed_objects = []
            formset.deleted_objects = []
        else:
            super().save_formset(request, form, formset, change)

    def display_winners(self, obj):
        """Display the individual winners"""
        return f"Locul 1: {obj.first_place}, Locul 2: {obj.second_place}, Locul 3: {obj.third_place}"
    display_winners.short_description = _('Câștigători')

    def save_model(self, request, obj, form, change):
        """Trigger validation before saving"""
        obj.clean()
        super().save_model(request, obj, form, change)
    
    class Media:
        css = {
            'all': ('/static/api/css/category_scores.css',)
        }
        js = ('/static/api/js/category_scores.js',)

@admin.register(TeamCategory)
class TeamCategoryAdmin(VersionAdmin, admin.ModelAdmin):
    list_display = ('category_id_display', 'category_name_display', 'event', 'get_group_display', 'gender', 'display_winners')
    search_fields = ('name', 'event__title', 'gender', 'group__name')
    list_filter = ('event', 'gender', 'group')
    autocomplete_fields = ['group']
    competition_field = 'event'
    
    fieldsets = [
        ('Detalii categorie', {
            'fields': ('event', 'group', 'name', 'gender'),
            'description': 'Grupa organizează categoriile pe intervale de vârstă (de exemplu, sportivi născuți între 2015-2018). Atribuie locurile direct în secțiunea Echipe de mai jos.'
        }),
    ]

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'group':
            event_id = request.GET.get('event')
            if event_id:
                kwargs['queryset'] = Group.objects.filter(event_id=event_id)
            else:
                obj_id = request.resolver_match.kwargs.get('object_id') if request.resolver_match else None
                if obj_id:
                    try:
                        current = TeamCategory.objects.get(pk=obj_id)
                        if current.event_id:
                            kwargs['queryset'] = Group.objects.filter(event_id=current.event_id)
                    except TeamCategory.DoesNotExist:
                        pass
        return super().formfield_for_foreignkey(db_field, request, **kwargs)
    
    def category_id_display(self, obj):
        """Display category ID as read-only"""
        return obj.pk
    category_id_display.short_description = 'ID'
    category_id_display.admin_order_field = 'pk'
    
    def category_name_display(self, obj):
        """Display category name as bold clickable link"""
        url = reverse('admin:api_teamcategory_change', args=(obj.pk,))
        return format_html('<a href="{}" style="font-weight: 500;">{}</a>', url, obj.name)
    category_name_display.short_description = 'Nume categorie'
    category_name_display.admin_order_field = 'name'
    
    def get_group_display(self, obj):
        """Display group with age range"""
        if obj.group:
            if obj.group.birth_year_start and obj.group.birth_year_end:
                return f"{obj.group.name} ({obj.group.birth_year_start}-{obj.group.birth_year_end})"
            return obj.group.name
        return "Fără grupă"
    get_group_display.short_description = 'Grupă de vârstă'
    get_group_display.admin_order_field = 'group__name'
    
    def get_inlines(self, request, obj=None):
        """Include referees and teams for team categories"""
        inlines = []
        if obj:
            inlines.append(CategoryFieldAssignmentInline)
            inlines.append(CategoryRefereeAssignmentInline)
            inlines.append(EnrolledTeamsInline)
        return inlines

    def display_winners(self, obj):
        """Display the team winners"""
        return f"Locul 1: {obj.first_place_team}, Locul 2: {obj.second_place_team}, Locul 3: {obj.third_place_team}"
    display_winners.short_description = _('Câștigători')

    def save_model(self, request, obj, form, change):
        """Trigger validation before saving"""
        obj.clean()
        super().save_model(request, obj, form, change)
    
    def save_formset(self, request, form, formset, change):
        """Ensure CategoryRefereeAssignment gets the correct category_id"""
        # For CategoryRefereeAssignmentInline, handle the OneToOne relationship properly
        if formset.model == CategoryRefereeAssignment:
            parent_pk = form.instance.pk
            
            if not parent_pk:
                # Parent not yet saved - don't try to save the inline
                return
            
            # Get or create the assignment for this category
            assignment, created = CategoryRefereeAssignment.objects.get_or_create(
                category_id=parent_pk
            )
            
            # Update it with form data WITHOUT calling formset.save()
            # (which would try to create a duplicate record)
            for inline_form in formset.forms:
                if inline_form.cleaned_data and not inline_form.cleaned_data.get('DELETE', False):
                    # Read referee values directly from cleaned form data
                    assignment.referee_1 = inline_form.cleaned_data.get('referee_1')
                    assignment.referee_2 = inline_form.cleaned_data.get('referee_2')
                    assignment.referee_3 = inline_form.cleaned_data.get('referee_3')
                    assignment.referee_4 = inline_form.cleaned_data.get('referee_4')
                    assignment.referee_5 = inline_form.cleaned_data.get('referee_5')
                    assignment.save()
                    break  # Only process first form (max_num=1)
            
            # Set attributes Django admin expects for change message
            # For new objects, add to new_objects; for updates, leave empty
            # (changed_objects format is complex and not needed for our case)
            formset.new_objects = [assignment] if created else []
            formset.changed_objects = []
            formset.deleted_objects = []
        else:
            super().save_formset(request, form, formset, change)
    
    class Media:
        css = {
            'all': ('/static/api/css/category_scores.css',)
        }
        js = ('/static/api/js/category_scores.js',)


@admin.register(FightCategory)
class FightCategoryAdmin(VersionAdmin, admin.ModelAdmin):
    list_display = ('category_id_display', 'category_name_display', 'event', 'get_group_display', 'gender', 'display_winners', 'match_progress')
    search_fields = ('name', 'event__title', 'gender', 'group__name')
    list_filter = ('event', 'gender', 'group')
    autocomplete_fields = ['group']
    competition_field = 'event'
    
    fieldsets = [
        ('Detalii categorie', {
            'fields': ('event', 'group', 'name', 'gender'),
            'description': 'Grupa organizează categoriile pe intervale de vârstă (de exemplu, sportivi născuți între 2015-2018). Atribuie locurile direct în secțiunea Sportivi de mai jos.'
        }),
        ('Tablou competițional', {
            'fields': ('bracket_display', 'bracket_stats_display'),
            'classes': ('collapse',),
        }),
    ]
    
    readonly_fields = ['bracket_display', 'bracket_stats_display']

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'group':
            event_id = request.GET.get('event')
            if event_id:
                kwargs['queryset'] = Group.objects.filter(event_id=event_id)
            else:
                obj_id = request.resolver_match.kwargs.get('object_id') if request.resolver_match else None
                if obj_id:
                    try:
                        current = FightCategory.objects.get(pk=obj_id)
                        if current.event_id:
                            kwargs['queryset'] = Group.objects.filter(event_id=current.event_id)
                    except FightCategory.DoesNotExist:
                        pass
        return super().formfield_for_foreignkey(db_field, request, **kwargs)
    
    def category_id_display(self, obj):
        """Display category ID as read-only"""
        return obj.pk
    category_id_display.short_description = 'ID'
    category_id_display.admin_order_field = 'pk'
    
    def category_name_display(self, obj):
        """Display category name as bold clickable link"""
        url = reverse('admin:api_fightcategory_change', args=(obj.pk,))
        group_name = obj.group.name if obj.group else 'Fără grupă'
        display_name = f"{obj.name} ({group_name})"
        return format_html('<a href="{}" style="font-weight: 500;">{}</a>', url, display_name)
    category_name_display.short_description = 'Nume categorie'
    category_name_display.admin_order_field = 'name'
    
    def get_group_display(self, obj):
        """Display group with age range"""
        if obj.group:
            if obj.group.birth_year_start and obj.group.birth_year_end:
                return f"{obj.group.name} ({obj.group.birth_year_start}-{obj.group.birth_year_end})"
            return obj.group.name
        return "Fără grupă"
    get_group_display.short_description = 'Grupă de vârstă'
    get_group_display.admin_order_field = 'group__name'
    
    def match_progress(self, obj):
        """Display match completion progress in list view"""
        stats = BracketStats.get_stats(obj)
        if stats['total_matches'] == 0:
            return mark_safe('<span style="color: #999;">—</span>')
        
        return format_html(
            '<div style="width: 100px; height: 20px; background: #f0f0f0; border-radius: 3px; overflow: hidden; position: relative;">'
            '<div style="background: #28a745; height: 100%; width: {}%; transition: width 0.3s;"></div>'
            '<span style="position: absolute; top: 2px; left: 5px; font-size: 11px; font-weight: bold; color: #333;">{}/{}</span>'
            '</div>',
            stats['completion_percentage'],
            stats['completed'],
            stats['total_matches']
        )
    match_progress.short_description = 'Progres'
    
    def bracket_display(self, obj):
        """Display tournament bracket visualization"""
        return bracket_visualization_readonly_field(self, obj)
    bracket_display.short_description = "Tablou competițional"
    
    def bracket_stats_display(self, obj):
        """Display bracket statistics"""
        return BracketStats.get_stats_display(obj)
    bracket_stats_display.short_description = "Statistici tablou"
    
    def get_inlines(self, request, obj=None):
        """Include enrolled athletes with weights and matches for fight categories"""
        inlines = []
        if obj:
            inlines.append(FightAthleteWeightInline)
            inlines.append(MatchInline)
        return inlines

    def display_winners(self, obj):
        """Display the fight winners"""
        return f"Locul 1: {obj.first_place}, Locul 2: {obj.second_place}, Locul 3: {obj.third_place}"
    display_winners.short_description = _('Câștigători')

    def save_model(self, request, obj, form, change):
        """Trigger validation before saving"""
        obj.clean()
        super().save_model(request, obj, form, change)


@admin.register(FightAthleteWeight)
class FightAthleteWeightAdmin(admin.ModelAdmin):
    """Admin for managing athlete weight-in data in fight categories"""
    list_display = ('athlete', 'category', 'pre_weight_kg', 'current_weight_kg', 'weight_loss_percentage', 'is_disqualified', 'recorded_at')
    list_filter = ('category__event', 'is_disqualified', 'recorded_at')
    search_fields = ('athlete__first_name', 'athlete__last_name', 'category__name')
    autocomplete_fields = ['athlete', 'category']
    fieldsets = (
        ('Sportiv și categorie', {
            'fields': ('category', 'athlete')
        }),
        ('Măsurători greutate', {
            'fields': ('pre_weight_kg', 'current_weight_kg', 'weight_loss_percentage')
        }),
        ('Descalificare', {
            'fields': ('is_disqualified', 'disqualification_reason')
        }),
        ('Înregistrare', {
            'fields': ('recorded_at',),
            'classes': ('collapse',)
        }),
    )
    readonly_fields = ('weight_loss_percentage', 'recorded_at')
    ordering = ['-recorded_at']


class CompetitionFieldAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'field_number', 'event', 'is_active')
    search_fields = ('name', 'field_number', 'event__title')
    list_filter = ('event', 'is_active')


class CategoryTeamAdmin(admin.ModelAdmin):
    """Admin for managing individual team enrollments in team categories"""
    list_display = ('team_display', 'category_display', 'place', 'total_score_display', 'disqualified')
    list_filter = ('category__event', 'place', 'disqualified')
    search_fields = ('team__members__athlete__first_name', 'team__members__athlete__last_name', 'category__name', 'category__event__title')
    autocomplete_fields = ['team']
    readonly_fields = ('total_score_display', 'ref1_score', 'ref2_score', 'ref3_score', 'ref4_score', 'ref5_score')
    inlines = [TeamPerformanceVideoInline]
    
    fieldsets = [
        ('ECHIPĂ ȘI CATEGORIE', {
            'fields': ('team', 'category'),
        }),
        ('REZULTATE', {
            'fields': ('place', 'disqualified'),
            'description': 'Notă: punctajul este administrat în pagina categoriei pe echipe, unde sunt vizibile atribuirea arbitrilor.'
        }),
        ('SCORURI (DOAR CITIRE)', {
            'fields': ('ref1_score', 'ref2_score', 'ref3_score', 'ref4_score', 'ref5_score', 'total_score_display'),
            'classes': ('collapse',),
            'description': 'Scoruri doar pentru vizualizare. Pentru editare, mergi în pagina categoriei pe echipe.'
        }),
    ]
    
    def team_display(self, obj):
        """Display team name"""
        return obj.team.name
    team_display.short_description = 'Echipă'
    team_display.admin_order_field = 'team__name'
    
    def category_display(self, obj):
        """Display category name"""
        return obj.category.name
    category_display.short_description = 'Categorie'
    category_display.admin_order_field = 'category__name'
    
    def total_score_display(self, obj):
        """Display calculated total score"""
        if obj.total_score is not None:
            return f"{obj.total_score:.2f}"
        return '-'
    total_score_display.short_description = 'Scor total'

