from django.contrib import admin, messages
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from django.forms import ModelForm
from django.core.exceptions import ValidationError
from django import forms
from django.urls import path, reverse
from django.shortcuts import render
from django.http import JsonResponse
from reversion.admin import VersionAdmin
from dal import autocomplete, forward
from .bracket_visualization import bracket_visualization_readonly_field, BracketStats
from django.db import models
from django.db.models import Count, Case, When, IntegerField
from django.db.models.functions import TruncMonth
import datetime
import json
import urllib.parse
from django.utils.safestring import mark_safe
from .models import (
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
)

# Optional grouping configuration used by the admin grouping template tag.
# Map a user-facing group title to a list of model names (object names).
# Update this dict to control how models under the `api` app are grouped.
ADMIN_MODEL_GROUPS = {
    'GENERAL': [
        'Athlete',
        'SupporterAthleteRelation',
        'Club',
        'GradeHistory',
        'Title',
        'Visa',
        'FederationRole',
        'City',
        'User',
        'UserProxy',
    ],
    'COMPETITION MANAGEMENT': [
        'Event',
        'Group',
        'Category',
        'SoloCategory',
        'TeamCategory',
        'FightCategory',
        'FightAthleteWeight',
        'Team',
        'Match',
        'EventParticipation',
        'TrainingSeminarParticipation',
        'MatchVideoRecording',
        'AthletePerformanceVideo',
        'TeamPerformanceVideo',
        'CategoryAthleteScore',
    ],
}
# NOTE: Event proxy registration moved further down after inlines are defined
# so we can inject participation inlines into the Event admin. See below.


class AthleteInlineForm(forms.ModelForm):
    athlete_selector = forms.ModelChoiceField(
        queryset=Athlete.objects.all(),
        required=False,
        label=_('Name'),
        widget=autocomplete.ModelSelect2(url='athlete-autocomplete')
    )

    class Meta:
        model = Athlete
        fields = ()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        def label_with_club(athlete):
            if not athlete:
                return ''
            club_name = athlete.club.name if athlete.club else None
            if club_name:
                return f"{athlete.first_name} {athlete.last_name} ({club_name})"
            return f"{athlete.first_name} {athlete.last_name}"

        self.fields['athlete_selector'].label_from_instance = label_with_club
        # Only allow athletes without a club for new rows
        if not (self.instance and self.instance.pk):
            self.fields['athlete_selector'].queryset = Athlete.objects.filter(club__isnull=True)
        else:
            # For existing rows, show the current athlete but prevent edits
            self.fields['athlete_selector'].initial = self.instance
            self.fields['athlete_selector'].required = False
            self.fields['athlete_selector'].widget.attrs['disabled'] = True


class AthleteInlineFormSet(forms.BaseInlineFormSet):
    def delete_existing(self, obj, commit=True):
        """Remove athlete from club without deleting the athlete record."""
        obj.club = None
        if commit:
            obj.save()
        return obj

    def save_new(self, form, commit=True):
        """Attach selected athlete to this club without editing details."""
        athlete = form.cleaned_data.get('athlete_selector')
        if not athlete:
            return None
        if athlete.club_id:
            raise ValidationError(_('Selected athlete is already assigned to a club.'))
        athlete.club = self.instance
        if commit:
            athlete.save()
        return athlete


class AthleteInline(admin.TabularInline):
    model = Athlete
    fk_name = 'club'  # Specify the foreign key field
    formset = AthleteInlineFormSet
    form = AthleteInlineForm
    fields = ('athlete_selector', 'current_grade_display')
    readonly_fields = ('current_grade_display',)
    extra = 1  # Allow adding athletes from the tab
    verbose_name = _('Athlete')
    verbose_name_plural = _('Athletes')
    can_delete = True  # Allow removing athletes from the club

    def current_grade_display(self, obj):
        if obj and obj.current_grade:
            return obj.current_grade.name
        return '—'
    current_grade_display.short_description = _('Grade')
    
    def get_athlete_link(self, obj):
        """Display athlete name as clickable link to their detail page"""
        if obj and obj.pk:
            try:
                url = reverse('admin:api_athlete_change', args=(obj.pk,))
                return format_html('<a href="{}" target="_blank">{} {}</a>', url, obj.first_name, obj.last_name)
            except Exception:
                return f"{obj.first_name} {obj.last_name}"
        return '-'
    get_athlete_link.short_description = _('Name')
    
    def has_add_permission(self, request, obj=None):
        return True
    
    def has_delete_permission(self, request, obj=None):
        return True


class CategoryAthleteInlineForm(forms.ModelForm):
    class Meta:
        model = CategoryAthlete
        fields = '__all__'
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Style the athlete field to be 200px wide
        if 'athlete' in self.fields:
            self.fields['athlete'].widget.attrs.update({
                'style': 'width: 200px !important; max-width: 200px !important; min-width: 200px !important;',
                'class': 'vForeignKeyRawIdAdminField'
            })
    
    def save(self, commit=True):
        # Add debug logging
        import logging
        logger = logging.getLogger(__name__)
        
        instance = super().save(commit=False)
        logger.error(f"=== CategoryAthleteInlineForm.save() ===")
        logger.error(f"  category_id: {instance.category_id}")
        logger.error(f"  athlete_id: {instance.athlete_id}")
        logger.error(f"  commit: {commit}")
        
        # Verify both FKs exist before saving
        if instance.category_id:
            from .models import Category
            if not Category.objects.filter(pk=instance.category_id).exists():
                logger.error(f"ERROR: Category {instance.category_id} does not exist!")
                raise ValidationError(f"Category with ID {instance.category_id} does not exist")
                
        if instance.athlete_id:
            if not Athlete.objects.filter(pk=instance.athlete_id).exists():
                logger.error(f"ERROR: Athlete {instance.athlete_id} does not exist!")
                raise ValidationError(f"Athlete with ID {instance.athlete_id} does not exist")
        
        if commit:
            try:
                logger.error("Attempting to save...")
                instance.save()
                logger.error("SUCCESS!")
            except Exception as e:
                logger.error(f"SAVE ERROR: {e}")
                raise
        
        return instance


class CategoryAthleteInline(admin.TabularInline):
    model = CategoryAthlete
    form = CategoryAthleteInlineForm
    extra = 0
    fields = ('athlete', 'place')
    autocomplete_fields = ['athlete']  # Enable autocomplete for the athlete field
    verbose_name = _('Athlete')
    verbose_name_plural = _('Athletes')

    class Media:
        css = {
            'all': ('/static/admin/css/enrolled_teams_compact.css?v=20260206',)
        }
        js = ('/static/admin/js/enrolled_teams_compact.js?v=20260206',)
    
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        """Style foreign key fields, especially athlete autocomplete"""
        formfield = super().formfield_for_foreignkey(db_field, request, **kwargs)
        
        # Set width for athlete field
        if db_field.name == 'athlete':
            formfield.widget = autocomplete.ModelSelect2(
                url='athlete-autocomplete',
                forward=['category']
            )
            formfield.widget.attrs.update({
                'style': 'width: 200px !important; max-width: 200px !important; min-width: 200px !important;',
                'class': 'vForeignKeyRawIdAdminField'
            })
            if hasattr(formfield.widget, 'can_add_related'):
                formfield.widget.can_add_related = False
                formfield.widget.can_change_related = False
                formfield.widget.can_view_related = False
                formfield.widget.can_delete_related = False
        
        return formfield
    
    def formfield_for_dbfield(self, db_field, request, **kwargs):
        """Add inline styles to narrow down columns"""
        formfield = super().formfield_for_dbfield(db_field, request, **kwargs)
        
        # Set width for athlete field
        if db_field.name == 'athlete':
            formfield.widget.attrs.update({
                'style': 'width: 200px !important; max-width: 200px !important; min-width: 200px !important;'
            })
        # Set width for referee score fields (for solo categories)
        elif db_field.name.startswith('ref') and db_field.name.endswith('_score'):
            formfield.widget.attrs.update({
                'style': 'width: 80px !important; max-width: 80px !important;'
            })
        # Set width for other fields
        elif db_field.name in ('place', 'disqualified'):
            formfield.widget.attrs.update({
                'style': 'width: 80px !important; max-width: 80px !important;'
            })
        
        return formfield

    def get_formset(self, request, obj=None, **kwargs):
        """
        Dynamically adjust the inline title and fields based on the parent model.
        """
        if obj:
            from .models import FightCategory, SoloCategory
            if isinstance(obj, FightCategory):
                self.verbose_name = _('Athlete')
                self.verbose_name_plural = _('ENROLLED ATHLETES')
                self.fields = ('athlete', 'place')
            elif isinstance(obj, SoloCategory):
                self.verbose_name = _('Enrolled Athlete')
                self.verbose_name_plural = _('Enrolled Athletes')
                self.fields = ('athlete', 'ref1_score', 'ref2_score', 'ref3_score', 'ref4_score', 'ref5_score', 'total_display', 'place', 'disqualified')
                self.readonly_fields = ('total_display',)
            else:
                # For generic Category views (shouldn't happen often)
                self.verbose_name = _('Athlete')
                self.verbose_name_plural = _('Athletes')
                self.fields = ('athlete', 'place')
        return super().get_formset(request, obj, **kwargs)
    
    def total_display(self, obj):
        """Display calculated total score"""
        if obj and obj.total_score is not None:
            return f"{obj.total_score:.2f}"
        return "-"
    total_display.short_description = 'Total'

    def athlete_with_club(self, obj):
        """
        Display the athlete's name along with their club.
        """
        if obj.athlete.club:
            return f"{obj.athlete.first_name} {obj.athlete.last_name} ({obj.athlete.club.name})"
        return f"{obj.athlete.first_name} {obj.athlete.last_name}"
    athlete_with_club.short_description = _('Athlete (Club)')

    def category_with_event(self, obj):
        """
        Display the category name along with its event.
        """
        if obj.category and obj.category.event:
            return f"{obj.category.name} ({obj.category.event.title})"
        elif obj.category:
            return f"{obj.category.name} (No Event)"
        return "N/A"
    category_with_event.short_description = _('Category (Event)')

    def category_type(self, obj):
        """
        Display the type of the category.
        """
        from .models import FightCategory, SoloCategory, TeamCategory
        if isinstance(obj.category, FightCategory):
            return 'Fight'
        elif isinstance(obj.category, SoloCategory):
            return 'Solo'
        elif isinstance(obj.category, TeamCategory):
            return 'Team'
        return 'Unknown'
    category_type.short_description = _('Category Type')


# Custom Team Results display - using the improved approach from before
# Since Django admin inlines have limitations with ManyToMany relationships,
# we'll use the custom field display method in the main AthleteAdmin

# Inline GradeHistory for Athlete
class GradeHistoryInline(admin.TabularInline):
    model = GradeHistory
    fk_name = 'athlete'  # There are two FKs to Athlete on GradeHistory; ensure inline uses the athlete FK
    extra = 0  # Display only existing entries
    # Make the inline read-only when displayed on the Athlete page. Editing
    # grade history should be done in the dedicated GradeHistory admin page.
    fields = ('grade', 'obtained_date', 'level', 'event', 'examiner_1', 'examiner_2', 'status', 'submitted_date', 'reviewed_date', 'reviewed_by')
    readonly_fields = ('grade', 'obtained_date', 'level', 'event', 'examiner_1', 'examiner_2', 'status', 'submitted_date', 'reviewed_date', 'reviewed_by')
    show_change_link = False

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        """
        Restrict examiner_1 and examiner_2 foreign key dropdowns to athletes that are coaches
        when editing GradeHistory from the Athlete admin inline.
        """
        if db_field.name in ('examiner_1', 'examiner_2'):
            kwargs['queryset'] = Athlete.objects.filter(is_coach=True)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


# Admin form for GradeHistory to provide friendly validation in admin UI
class GradeHistoryAdminForm(forms.ModelForm):
    class Meta:
        model = GradeHistory
        fields = '__all__'

    def clean(self):
        cleaned = super().clean()
        athlete = cleaned.get('athlete')
        grade = cleaned.get('grade')
        if athlete and grade:
            qs = GradeHistory.objects.filter(athlete=athlete, grade=grade)
            if self.instance and self.instance.pk:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                # Prefer an approved existing record to link to
                approved = qs.filter(status='approved').order_by('submitted_date', 'pk').first()
                existing = approved or qs.order_by('submitted_date', 'pk').first()
                try:
                    url = reverse('admin:api_gradehistory_change', args=(existing.pk,))
                    link = format_html('<a href="{}">view existing record</a>', url)
                    message = format_html('An entry for this athlete and grade already exists. {}', link)
                except Exception:
                    # Fallback to plain text message if reverse fails
                    message = 'An entry for this athlete and grade already exists.'
                # Attach error to the grade field for a friendly admin message with link
                raise ValidationError({'grade': message})
        return cleaned


# Register unified Visa model admin
try:
    from .models import Visa

    class VisaAdminForm(forms.ModelForm):
        class Meta:
            model = Visa
            fields = '__all__'

        def clean(self):
            cleaned = super().clean()
            visa_type = cleaned.get('visa_type')
            health = cleaned.get('health_status')
            # If not a medical visa, clear any provided health_status to avoid accidental data retention
            if visa_type != 'medical' and health:
                cleaned['health_status'] = None
            # If medical visa, require health_status
            if visa_type == 'medical' and not cleaned.get('health_status'):
                raise ValidationError({'health_status': 'Health status is required for medical visas.'})
            return cleaned
    @admin.register(Visa)
    class VisaAdmin(admin.ModelAdmin):
        form = VisaAdminForm
        list_display = ('athlete_with_club', 'visa_type', 'issued_date', 'visa_status', 'status', 'submitted_date')
        # Use a custom change list template so we can expose two dedicated
        # "Add" buttons: one for Medical and one for Annual visas. These
        # buttons link to the add form with ?visa_type=<type> so the form
        # is pre-configured.
        change_list_template = 'admin/api/visa/change_list.html'
        search_fields = ('athlete__first_name', 'athlete__last_name')
        list_filter = ('visa_type', 'status')
        readonly_fields = ('visa_status',)

        class Media:
            # Include a tiny admin JS to show/hide the medical-only field `health_status`
            js = ('/static/api/js/visa_admin.js',)

        def athlete_with_club(self, obj):
            """Display athlete name with club in parentheses"""
            if obj.athlete:
                club_name = f" ({obj.athlete.club.name})" if obj.athlete.club else ""
                return f"{obj.athlete.first_name} {obj.athlete.last_name}{club_name}"
            return "-"
        athlete_with_club.short_description = 'Athlete'
        athlete_with_club.admin_order_field = 'athlete__first_name'

        def visa_status(self, obj):
            try:
                return obj.visa_status or ''
            except Exception:
                return ''
        visa_status.short_description = _('Status')

        def get_changeform_initial_data(self, request):
            """Prefill visa_type (and optionally athlete) from query params.

            This allows links such as
            /admin/api/visa/add/?visa_type=medical&athlete=123 to prefill fields.
            """
            initial = super().get_changeform_initial_data(request) or {}
            visa_type = request.GET.get('visa_type')
            athlete_id = request.GET.get('athlete')
            if visa_type:
                initial['visa_type'] = visa_type
            if athlete_id:
                initial['athlete'] = athlete_id
            return initial

        def get_form(self, request, obj=None, **kwargs):
            """Return a ModelForm class with visa_type disabled when the add
            form is opened via the quick-add buttons (i.e. ?visa_type=...).
            Disabling the field makes it read-only in the UI; we ensure the
            value is saved in save_model (disabled fields aren't POSTed).
            """
            form = super().get_form(request, obj, **kwargs)
            # Determine the visa_type to tailor the form. Prefer existing object's
            # type when editing, otherwise look for ?visa_type=... on the add form.
            if obj is None:
                visa_type = request.GET.get('visa_type')
            else:
                visa_type = getattr(obj, 'visa_type', None)

            try:
                # Validate the provided type against model choices
                valid_choices = [c[0] for c in Visa.VISA_TYPE_CHOICES]
            except Exception:
                valid_choices = []

            if visa_type and visa_type in valid_choices:
                if 'visa_type' in getattr(form, 'base_fields', {}):
                    # Set initial and disable the widget so it's read-only
                    form.base_fields['visa_type'].initial = visa_type
                    try:
                        form.base_fields['visa_type'].disabled = True
                    except Exception:
                        form.base_fields['visa_type'].widget.attrs['disabled'] = 'disabled'
            else:
                # No explicit visa_type provided; still make the field read-only
                # per request. Default to 'annual' to ensure a sensible initial
                # value on the add form so save_model can persist it.
                if 'visa_type' in getattr(form, 'base_fields', {}):
                    try:
                        form.base_fields['visa_type'].initial = 'annual'
                        form.base_fields['visa_type'].disabled = True
                    except Exception:
                        form.base_fields['visa_type'].widget.attrs['disabled'] = 'disabled'
            # Hide or show medical-only fields depending on the selected type
            try:
                if visa_type != 'medical' and 'health_status' in getattr(form, 'base_fields', {}):
                    # Hide the field and ensure it's not required in the UI
                    form.base_fields['health_status'].widget = forms.HiddenInput()
                    form.base_fields['health_status'].required = False
                elif visa_type == 'medical' and 'health_status' in getattr(form, 'base_fields', {}):
                    # Ensure visible and required for medical visas
                    try:
                        # If widget was previously HiddenInput, replace with default
                        from django.forms import fields as django_fields
                        form.base_fields['health_status'].widget = django_fields.ChoiceField(choices=form.base_fields['health_status'].choices).widget
                    except Exception:
                        pass
                    form.base_fields['health_status'].required = True
            except Exception:
                pass
            return form

        def save_model(self, request, obj, form, change):
            """Ensure visa_type from the querystring is preserved on save
            when the field was rendered disabled (and therefore omitted from
            POST data).
            """
            if not change:
                visa_type = request.GET.get('visa_type')
                try:
                    valid_choices = [c[0] for c in Visa.VISA_TYPE_CHOICES]
                except Exception:
                    valid_choices = []
                if visa_type and visa_type in valid_choices:
                    obj.visa_type = visa_type
                else:
                    # If no query param, try to read the form field initial value
                    try:
                        initial = None
                        if 'visa_type' in getattr(form, 'base_fields', {}):
                            initial = form.base_fields['visa_type'].initial
                        if initial and initial in valid_choices:
                            obj.visa_type = initial
                    except Exception:
                        pass
            super().save_model(request, obj, form, change)
except Exception:
    # Skip registering Visa admin during migrations/import-time errors
    pass

# Legacy MedicalVisa/AnnualVisa inlines and admin unregistration removed â€” use unified Visa instead.


# Unified Visa inline to replace MedicalVisaInline and AnnualVisaInline
class VisaInline(admin.TabularInline):
    try:
        from .models import Visa
    except Exception:
        Visa = None
    model = Visa
    extra = 0
    fields = ('visa_type', 'issued_date', 'visa_status', 'document', 'image', 'notes')
    readonly_fields = ('visa_status',)
    verbose_name = _('Visa')
    verbose_name_plural = _('Visas')
    
    def has_add_permission(self, request, obj=None):
        return False

    def visa_status(self, obj):
            try:
                return obj.visa_status or ''
            except Exception:
                return ''
    visa_status.short_description = _('Status')


class TrainingSeminarParticipationInline(admin.TabularInline):
    """Show approved participation (enrolled) athletes on the TrainingSeminar admin page.

    Use a StackedInline instead of TabularInline to avoid wide table columns that
    cause horizontal scrolling in the admin change form. StackedInline displays
    each enrollment vertically so all fields are visible without horizontal scroll.
    """
    model = TrainingSeminarParticipation
    fk_name = 'event'  # Specify which FK to use (event vs seminar)
    extra = 0
    show_change_link = True
    verbose_name = _('Event Participation')
    verbose_name_plural = _('Event Participations')
    # Show a compact set of fields to keep the inline small and readable.
    # Use the `athlete_link` read-only method instead of the full athlete FK
    # to keep the UI compact (click through to the athlete page to edit).
    fields = ('athlete_link', 'status', 'reviewed_date', 'reviewed_by')
    readonly_fields = ('athlete_link', 'reviewed_date', 'reviewed_by')
    can_delete = True

    class _InlineFormSet(forms.BaseInlineFormSet):
        def _ensure_legacy_seminar(self, event):
            if not event or not event.pk:
                return
            try:
                from django.db import connection
                ev_start = getattr(event, 'start_date', None)
                ev_end = getattr(event, 'end_date', None)
                if hasattr(ev_start, 'date'):
                    ev_start = ev_start.date()
                if hasattr(ev_end, 'date'):
                    ev_end = ev_end.date()
                ev_place = getattr(event, 'address', '') or ''
                with connection.cursor() as cursor:
                    cursor.execute(
                        "INSERT OR IGNORE INTO api_trainingseminar (id, name, start_date, end_date, place) VALUES (?, ?, ?, ?, ?)",
                        [event.pk, getattr(event, 'title', '') or f"Event {event.pk}", ev_start, ev_end, ev_place]
                    )
            except Exception:
                pass

        def save_new(self, form, commit=True):
            obj = super().save_new(form, commit=False)
            event = getattr(self, 'instance', None)
            if event:
                self._ensure_legacy_seminar(event)
                if not obj.event_id:
                    obj.event = event
                if not obj.seminar_id:
                    obj.seminar = event
            if commit:
                obj.save()
            return obj

        def save_existing(self, form, instance, commit=True):
            obj = super().save_existing(form, instance, commit=False)
            event = getattr(self, 'instance', None)
            if event:
                self._ensure_legacy_seminar(event)
                if not obj.event_id:
                    obj.event = event
                if not obj.seminar_id:
                    obj.seminar = event
            if commit:
                obj.save()
            return obj

    formset = _InlineFormSet

    def athlete_link(self, obj):
        """Link to the athlete change page when available."""
        try:
            return format_html('<a href="/admin/api/athlete/{}/change/">{} {}</a>', obj.athlete.pk, obj.athlete.first_name, obj.athlete.last_name)
        except Exception:
            return str(getattr(obj, 'athlete', ''))
    athlete_link.short_description = _('Athlete')

class AthleteTrainingSeminarParticipationInline(admin.TabularInline):
    """Inline on Athlete admin to show the athlete's approved seminar enrollments."""
    model = TrainingSeminarParticipation
    fk_name = 'athlete'
    extra = 0
    show_change_link = True
    verbose_name = _('Enrolled Event')
    verbose_name_plural = _('Enrolled Events')
    # Make the inline read-only on the Athlete page: we show existing enrollments
    # but don't allow adding/editing inline here. To add a new enrollment the
    # admin will be redirected to the dedicated add form with the athlete
    # prefilled (see `TrainingSeminarParticipationAdmin` below).
    fields = ('event', 'status', 'submitted_by_athlete', 'reviewed_date', 'reviewed_by')
    readonly_fields = ('event', 'status', 'submitted_by_athlete', 'reviewed_date', 'reviewed_by')
    show_change_link = False
    can_delete = False

    def has_add_permission(self, request, obj=None):
        # Disable adding inline from Athlete admin; use the dedicated add form instead.
        return False

    def has_change_permission(self, request, obj=None):
        # Prevent editing inline from Athlete admin
        return False

    def has_delete_permission(self, request, obj=None):
        # Prevent deletion inline from Athlete admin
        return False

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        # Return only approved participation by default
        return qs.filter(status='approved')

# Register landing.Event under the API admin using the proxy model defined in
# `api.models.Event`. We create a small subclass of the Landing EventAdmin and
# inject the TrainingSeminarParticipationInline so enrolled athletes are visible
# on the Event change page.
try:
    from landing.models import Event as LandingEvent
    from landing.admin import EventAdmin as LandingEventAdmin
    from .models import Event
    # Unregister any existing registrations for the landing Event or the API proxy
    for _m in (Event, LandingEvent):
        try:
            admin.site.unregister(_m)
        except Exception:
            pass

    # Create an API-specific EventAdmin that appends the participation inline
    # and includes quick-add links for related models.
    # Be careful with types: LandingEventAdmin.inlines may be a tuple, so coerce to list.
    try:
        base_inlines = list(getattr(LandingEventAdmin, 'inlines', []) or [])
        new_inlines = base_inlines + [TrainingSeminarParticipationInline]
        
        # Create a custom EventAdmin class with helpful methods and links
        class CustomEventAdmin(LandingEventAdmin):
            inlines = new_inlines

            def _ensure_legacy_seminar(self, event):
                """Ensure legacy TrainingSeminar row exists for this event."""
                if not event or not event.pk:
                    return
                try:
                    from django.db import connection
                    ev_start = getattr(event, 'start_date', None)
                    ev_end = getattr(event, 'end_date', None)
                    if hasattr(ev_start, 'date'):
                        ev_start = ev_start.date()
                    if hasattr(ev_end, 'date'):
                        ev_end = ev_end.date()
                    ev_place = getattr(event, 'address', '') or ''
                    with connection.cursor() as cursor:
                        cursor.execute(
                            "INSERT OR IGNORE INTO api_trainingseminar (id, name, start_date, end_date, place) VALUES (?, ?, ?, ?, ?)",
                            [event.pk, getattr(event, 'title', '') or f"Event {event.pk}", ev_start, ev_end, ev_place]
                        )
                except Exception:
                    pass
            
            def get_readonly_fields(self, request, obj=None):
                """Add custom display fields for quick-add links"""
                readonly = list(super().get_readonly_fields(request))
                if 'quick_add_links' not in readonly:
                    readonly.append('quick_add_links')
                return readonly
            
            def quick_add_links(self, obj):
                """Display quick-add links for categories and matches"""
                if not obj.pk:
                    return "Save the event first to see quick-add links."
                
                from django.urls import reverse
                links = []
                
                # Link to add Solo Category
                solo_add_url = reverse('admin:api_solocategory_add') + f'?event={obj.pk}'
                links.append(f'<a class="button" href="{solo_add_url}">+ Add Solo Category</a>')
                
                # Link to add Team Category
                team_add_url = reverse('admin:api_teamcategory_add') + f'?event={obj.pk}'
                links.append(f'<a class="button" href="{team_add_url}">+ Add Team Category</a>')
                
                # Link to add Fight Category
                fight_add_url = reverse('admin:api_fightcategory_add') + f'?event={obj.pk}'
                links.append(f'<a class="button" href="{fight_add_url}">+ Add Fight Category</a>')
                
                # Link to view categories for this event
                categories_url = reverse('admin:api_solocategory_changelist') + f'?event={obj.pk}'
                links.append(f'<a class="button" href="{categories_url}">View All Categories</a>')
                
                # Link to view matches for this event
                matches_url = reverse('admin:api_match_changelist') + f'?category__event__id={obj.pk}'
                links.append(f'<a class="button" href="{matches_url}">View All Matches</a>')
                
                html = '<div style="margin-top: 10px;">' + ' '.join(links) + '</div>'
                return format_html(html)
            
            quick_add_links.short_description = 'Quick Actions'
            
            def get_fieldsets(self, request, obj=None):
                """Add quick_add_links field to fieldsets if editing"""
                fieldsets = super().get_fieldsets(request, obj)
                if obj:  # Only show quick links when editing existing event
                    # Try to add to the first fieldset
                    fieldsets = list(fieldsets)
                    if fieldsets:
                        first_fieldset = list(fieldsets[0])
                        fields = list(first_fieldset[1]['fields']) if isinstance(first_fieldset[1]['fields'], tuple) else list(first_fieldset[1]['fields'])
                        if 'quick_add_links' not in fields:
                            fields.append('quick_add_links')
                            first_fieldset[1] = dict(first_fieldset[1])
                            first_fieldset[1]['fields'] = tuple(fields)
                            fieldsets[0] = tuple(first_fieldset)
                return fieldsets

            def save_formset(self, request, form, formset, change):
                """Ensure legacy seminar is set for event participations."""
                if formset.model is TrainingSeminarParticipation:
                    event = form.instance
                    self._ensure_legacy_seminar(event)
                    instances = formset.save(commit=False)
                    for instance in instances:
                        if not instance.seminar_id:
                            instance.seminar = event
                        if not instance.event_id:
                            instance.event = event
                        instance.save()
                    formset.save_m2m()
                    for obj in formset.deleted_objects:
                        obj.delete()
                    return
                return super().save_formset(request, form, formset, change)
        
        APILandingEventAdmin = type(
            'APILandingEventAdmin',
            (CustomEventAdmin,),
            {}
        )
        admin.site.register(Event, APILandingEventAdmin)
        # Completely unregister LandingEvent from admin to prevent access via /admin/landing/event/
        # We only want Events managed through the API proxy at /admin/api/event/
        try:
            admin.site.unregister(LandingEvent)
        except Exception:
            pass
        # Note: AthleteTrainingSeminarParticipationInline is readonly, so autocomplete
        # is not needed. The event field is shown as readonly text.
    except Exception:
        # Fall back to registering using the original LandingEventAdmin; keep startup stable
        try:
            admin.site.register(Event, LandingEventAdmin)
            # Completely unregister LandingEvent - only manage via API proxy
            try:
                admin.site.unregister(LandingEvent)
            except Exception:
                pass
        except Exception:
            pass
except Exception:
    # If landing or the proxy model isn't importable at module import time
    # (e.g., during migrations), skip registration.
    pass
    
# Register a dedicated ModelAdmin for TrainingSeminarParticipation so the
# "Add enrolled event" button on the Athlete page can open the add form with
# the athlete prefilled via ?athlete=<id>.
try:
    class TrainingSeminarParticipationAdmin(admin.ModelAdmin):
        # Prefer showing the linked Event rather than the legacy Seminar
        list_display = ('athlete', 'event', 'status', 'submitted_date')
        # Event model uses `title` for its human readable field
        search_fields = ('athlete__first_name', 'athlete__last_name', 'event__title')

        class TrainingSeminarParticipationAdminForm(forms.ModelForm):
            class Meta:
                model = TrainingSeminarParticipation
                fields = '__all__'

            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                # Hide the legacy `seminar` field in the admin form for both add
                # and change pages so the `event` field is the primary control.
                # We keep the model field in place but render it hidden to avoid
                # import/migration-time KeyErrors that occurred when removing the
                # field from forms entirely.
                if 'seminar' in self.fields:
                    try:
                        self.fields['seminar'].widget = forms.HiddenInput()
                        self.fields['seminar'].required = False
                    except Exception:
                        # Best-effort: ensure it's not required so admin doesn't error
                        self.fields['seminar'].required = False
                    # Ensure no accidental value is posted
                    self.fields['seminar'].initial = None

            def clean(self):
                """Ensure a valid legacy `seminar` value exists for DB integrity.

                The project uses `event` as the canonical link but the DB still
                requires `seminar` (non-null). For add forms we accept `event`
                and attempt to resolve or create a matching TrainingSeminar so
                the model save does not fail.
                """
                cleaned = super().clean()
                seminar = cleaned.get('seminar')
                event = cleaned.get('event')

                if not seminar and event:
                    # Legacy DB schema expects seminar_id to exist in api_trainingseminar.
                    # Ensure a matching row exists, then mirror the event id.
                    try:
                        from django.db import connection
                        ev_start = getattr(event, 'start_date', None)
                        ev_end = getattr(event, 'end_date', None)
                        if hasattr(ev_start, 'date'):
                            ev_start = ev_start.date()
                        if hasattr(ev_end, 'date'):
                            ev_end = ev_end.date()
                        ev_place = getattr(event, 'address', '') or ''
                        with connection.cursor() as cursor:
                            cursor.execute(
                                "INSERT OR IGNORE INTO api_trainingseminar (id, name, start_date, end_date, place) VALUES (?, ?, ?, ?, ?)",
                                [event.pk, getattr(event, 'title', '') or f"Event {event.pk}", ev_start, ev_end, ev_place]
                            )
                    except Exception:
                        pass
                    cleaned['seminar'] = event

                # If we still don't have a seminar, raise a validation error so
                # the admin user can correct the form rather than triggering a
                # DB IntegrityError on save.
                # If mapping/creation failed but we're editing an existing
                # instance that already had a seminar, preserve it so the
                # change form can save without forcing destructive updates.
                if not cleaned.get('seminar'):
                    try:
                        instance = getattr(self, 'instance', None)
                        if instance and getattr(instance, 'seminar', None):
                            cleaned['seminar'] = instance.seminar
                    except Exception:
                        pass

                # Only block if neither event nor seminar is provided.
                if not cleaned.get('seminar') and not cleaned.get('event'):
                    raise ValidationError({'event': 'Please select an event.'})

                return cleaned

        form = TrainingSeminarParticipationAdminForm

        def get_changeform_initial_data(self, request):
            # Allow prefilling either athlete or event (or both) via query params
            initial = super().get_changeform_initial_data(request) or {}
            athlete_id = request.GET.get('athlete')
            event_id = request.GET.get('event') or request.GET.get('seminar')
            if athlete_id:
                initial['athlete'] = athlete_id
            if event_id:
                # accept both ?event= and legacy ?seminar=
                initial['event'] = event_id
            return initial

    try:
        # Unregister legacy registration if present so we can expose the
        # proxy `EventParticipation` as the admin resource with a nicer URL
        try:
            admin.site.unregister(TrainingSeminarParticipation)
        except Exception:
            pass

        # Import proxy model and register it under the admin so the URL
        # becomes /admin/api/eventparticipation/ instead of the legacy
        # /admin/api/trainingseminarparticipation/.
        try:
            from .models import EventParticipation
            admin.site.register(EventParticipation, TrainingSeminarParticipationAdmin)
        except Exception:
            # If proxy import fails (during migrations), fall back to
            # registering the original model to avoid admin breakage.
            try:
                admin.site.register(TrainingSeminarParticipation, TrainingSeminarParticipationAdmin)
            except Exception:
                pass
    except Exception:
        # Ignore registration errors during migration/import time
        pass
except Exception:
    pass

class MatchInline(admin.TabularInline):
    model = Match
    extra = 0
    autocomplete_fields = ['red_corner', 'blue_corner']  # Winner is now computed
    # Show a quick link to open the full Match change page so admins can view/edit
    # the match details directly from the Category change form.
    fields = ('match_type', 'red_corner', 'blue_corner', 'winner_display', 'match_link')  # Do not show referees
    readonly_fields = ('winner_display', 'match_link')
    show_change_link = False
    verbose_name = "Match"
    verbose_name_plural = "Matches"

    def winner_display(self, obj):
        """Display computed winner from scoring system"""
        if obj.pk:
            winner = obj.winner
            if winner:
                return f"{winner.first_name} {winner.last_name}"
            return "No winner yet"
        return "-"
    winner_display.short_description = "Winner"

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        """
        Restrict athlete selection to those enrolled in the category for red_corner and blue_corner.
        """
        if db_field.name in ['red_corner', 'blue_corner']:
            # Check if the parent object (Category) is available in the request
            if hasattr(request, 'parent_model') and request.parent_model == Category:
                category_id = request.resolver_match.kwargs.get('object_id')  # Get the category ID from the URL
                if category_id:
                    kwargs['queryset'] = Athlete.objects.filter(categories__id=category_id)  # Filter athletes by category
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def match_link(self, obj):
        """Render a small 'View' link to the match change page for this inline row."""
        try:
            if not obj or not getattr(obj, 'pk', None):
                return ''
            url = reverse('admin:api_match_change', args=(obj.pk,))
            return format_html('<a href="{}" class="related-link" target="_blank">View</a>', url)
        except Exception:
            return ''
    match_link.short_description = _('Match details')

class RefereeScoreInline(admin.TabularInline):
    model = RefereeScore
    extra = 0
    # Show per-round columns (3 rounds default) plus totals and adjusted totals
    # Use a custom form so per-round fields are editable and saved as events.
    class RefereeScoreForm(forms.ModelForm):
        red_round_1 = forms.IntegerField(required=False, min_value=0, label='Red R1', widget=forms.NumberInput(attrs={'style': 'width: 50px;'}))
        red_round_2 = forms.IntegerField(required=False, min_value=0, label='Red R2', widget=forms.NumberInput(attrs={'style': 'width: 50px;'}))
        red_round_3 = forms.IntegerField(required=False, min_value=0, label='Red R3', widget=forms.NumberInput(attrs={'style': 'width: 50px;'}))
        blue_round_1 = forms.IntegerField(required=False, min_value=0, label='Blue R1', widget=forms.NumberInput(attrs={'style': 'width: 50px;'}))
        blue_round_2 = forms.IntegerField(required=False, min_value=0, label='Blue R2', widget=forms.NumberInput(attrs={'style': 'width: 50px;'}))
        blue_round_3 = forms.IntegerField(required=False, min_value=0, label='Blue R3', widget=forms.NumberInput(attrs={'style': 'width: 50px;'}))

        class Meta:
            model = RefereeScore
            fields = ('referee', 'winner')
        
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            # Make referee not required to allow null (if field exists)
            if 'referee' in self.fields:
                self.fields['referee'].required = False
                self.fields['referee'].widget.attrs = {'style': 'width: 150px;'}
            try:
                # Populate per-round initial values from existing score events
                inst = getattr(self, 'instance', None)
                if inst and getattr(inst, 'pk', None):
                    from .models import RefereePointEvent
                    
                    evs = RefereePointEvent.objects.filter(match=inst.match, referee=inst.referee, event_type='score')
                    # Prefer metadata stored round, default 1
                    by_round = {}
                    for e in evs:
                        try:
                            rd = int(e.metadata.get('round')) if isinstance(e.metadata, dict) and e.metadata.get('round') is not None else 1
                        except Exception:
                            rd = 1
                        by_round.setdefault(rd, {'red': 0, 'blue': 0})
                        by_round[rd][e.side] = (by_round[rd].get(e.side, 0) or 0) + (e.points or 0)

                    for rd in (1, 2, 3):
                        r = by_round.get(rd)
                        if r:
                            self.fields.get(f'red_round_{rd}').initial = r.get('red')
                            self.fields.get(f'blue_round_{rd}').initial = r.get('blue')
            except Exception:
                pass
        
        def save(self, commit=True):
            """Auto-populate referee from ref_position if not already set"""
            instance = super().save(commit=False)
            
            # If ref_position is selected and referee is not set, set it from MatchRefereeAssignment
            if self.cleaned_data.get('ref_position') and not instance.referee_id:
                try:
                    from .models import MatchRefereeAssignment
                    pos = int(self.cleaned_data['ref_position'])
                    assignment = MatchRefereeAssignment.objects.get(match=instance.match)
                    ref_field = f'referee_{pos}'
                    instance.referee = getattr(assignment, ref_field, None)
                except:
                    pass
            
            if commit:
                instance.save()
            return instance

    form = RefereeScoreForm
    extra = 5
    max_num = 5
    can_delete = False
    verbose_name = ''
    verbose_name_plural = 'Referee Scores'
    fields = (
        'referee',
        'red_round_1', 'blue_round_1',  # ROUND 1
        'red_round_2', 'blue_round_2',  # ROUND 2
        'red_round_3', 'blue_round_3',  # ROUND 3
        'red_total', 'blue_total',
        'winner_combined',
    )
    autocomplete_fields = ['referee']
    # per-round inputs are editable on the form; totals and computed displays are read-only
    readonly_fields = ('red_total', 'blue_total', 'winner_combined')
    
    def ref_number(self, obj):
        """Display REF 1-5 based on the form position"""
        if obj and hasattr(obj, 'pk') and obj.pk:
            # For existing objects, try to determine position from match assignment
            try:
                from .models import MatchRefereeAssignment
                assignment = MatchRefereeAssignment.objects.get(match=obj.match)
                for i in range(1, 6):
                    if getattr(assignment, f'referee_{i}') == obj.referee:
                        return f'REF {i}'
            except:
                pass
        # For new forms or unknown position, return empty (will be set via CSS counter)
        return ''
    ref_number.short_description = 'REFEREE'
    
    def get_formset(self, request, obj=None, **kwargs):
        """Customize formset to always show exactly 5 forms"""
        formset = super().get_formset(request, obj, **kwargs)
        return formset

    def red_total(self, obj):
        """Computed RED TOTAL: sum of round scores minus central penalties (read-only)."""
        if obj is None:
            return ''
        try:
            from api.scoring import compute_match_results
            res = compute_match_results(obj.match)
            per = res.get('per_ref', {})
            p = per.get(obj.referee_id)
            if not p:
                return obj.red_corner_score or ''
            return p.get('adj_red', '')
        except Exception:
            return obj.red_corner_score or ''
    red_total.short_description = _('RED TOTAL')

    def red_round_1(self, obj):
        return self._red_round(obj, 1)
    red_round_1.short_description = _('RED')

    def red_round_2(self, obj):
        return self._red_round(obj, 2)
    red_round_2.short_description = _('RED')

    def red_round_3(self, obj):
        return self._red_round(obj, 3)
    red_round_3.short_description = _('RED')

    def _red_round(self, obj, rd):
        try:
            from api.scoring import compute_match_results
            res = compute_match_results(obj.match)
            per = res.get('per_ref', {})
            p = per.get(obj.referee_id, {})
            rounds = p.get('rounds', {}) or {}
            r = rounds.get(rd)
            if not r:
                return ''
            return r.get('red', '')
        except Exception:
            return ''

    def blue_total(self, obj):
        """Computed BLUE TOTAL: sum of round scores minus central penalties (read-only)."""
        if obj is None:
            return ''
        try:
            from api.scoring import compute_match_results
            res = compute_match_results(obj.match)
            per = res.get('per_ref', {})
            p = per.get(obj.referee_id)
            if not p:
                return obj.blue_corner_score or ''
            return p.get('adj_blue', '')
        except Exception:
            return obj.blue_corner_score or ''
    blue_total.short_description = _('BLUE TOTAL')

    def blue_round_1(self, obj):
        return self._blue_round(obj, 1)
    blue_round_1.short_description = _('BLUE')

    def blue_round_2(self, obj):
        return self._blue_round(obj, 2)
    blue_round_2.short_description = _('BLUE')

    def blue_round_3(self, obj):
        return self._blue_round(obj, 3)
    blue_round_3.short_description = _('BLUE')

    def _blue_round(self, obj, rd):
        try:
            from api.scoring import compute_match_results
            res = compute_match_results(obj.match)
            per = res.get('per_ref', {})
            p = per.get(obj.referee_id, {})
            rounds = p.get('rounds', {}) or {}
            r = rounds.get(rd)
            if not r:
                return ''
            return r.get('blue', '')
        except Exception:
            return ''

    def winner_display(self, obj):
        """Display the computed winner based on adjusted scores (Red (adj) vs Blue (adj))."""
        if obj is None:
            return ''
        try:
            from api.scoring import compute_match_results
            res = compute_match_results(obj.match)
            per = res.get('per_ref', {})
            p = per.get(obj.referee_id)
            if not p:
                return ''
            w = p.get('winner')
            if w == 'red':
                return 'Red'
            elif w == 'blue':
                return 'Blue'
            return ''
        except Exception:
            return ''
    winner_display.short_description = _('Winner (adj)')

    def winner_combined(self, obj):
        """Single read-only Winner column.

        Prefer an explicitly stored winner on the RefereeScore row; if not
        present, fall back to the computed (adjusted) winner from scoring.
        """
        try:
            # Prefer the persisted winner if present
            if obj is not None:
                w = getattr(obj, 'winner', None)
                if w == 'red':
                    return 'Red'
                elif w == 'blue':
                    return 'Blue'

            # Otherwise compute adjusted winner
            from api.scoring import compute_match_results
            res = compute_match_results(obj.match)
            per = res.get('per_ref', {})
            p = per.get(obj.referee_id)
            if not p:
                return ''
            w = p.get('winner')
            if w == 'red':
                return 'Red'
            elif w == 'blue':
                return 'Blue'
            return ''
        except Exception:
            return ''
    winner_combined.short_description = _('Winner')
    
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        """Filter referee dropdown to show only approved athletes with is_referee=True"""
        if db_field.name == 'referee':
            kwargs["queryset"] = Athlete.objects.filter(is_referee=True, status='approved')
        return super().formfield_for_foreignkey(db_field, request, **kwargs)
    
    class Media:
        css = {
            'all': ('/static/admin/css/referee_scores_compact.css',)
        }


class CentralPenaltyInlineFormSet(forms.models.BaseInlineFormSet):
    """Custom formset to enforce penalty semantics for inline-created events.

    Ensures event_type is set to 'penalty' and metadata['central']=True
    for both new and existing inline objects saved from the admin.
    """
    def save_new(self, form, commit=True):
        obj = super().save_new(form, commit=False)
        try:
            obj.event_type = 'penalty'
            md = obj.metadata or {}
            if isinstance(md, dict):
                md['central'] = True
            else:
                # best-effort: if metadata stored as string, leave as-is
                md = {'central': True}
            obj.metadata = md
        except Exception:
            pass
        if commit:
            obj.save()
        return obj

    def save_existing(self, form, obj, commit=True):
        try:
            obj.event_type = 'penalty'
            md = obj.metadata or {}
            if isinstance(md, dict):
                md['central'] = True
            else:
                md = {'central': True}
            obj.metadata = md
        except Exception:
            pass
        return super().save_existing(form, obj, commit=commit)


class CentralPenaltyInlineForm(forms.ModelForm):
    """Custom form with intuitive fields for central penalty metadata."""
    
    penalty_round = forms.IntegerField(
        required=False,
        min_value=1,
        max_value=3,
        label='Round',
        help_text='Which round (1, 2, or 3)',
        widget=forms.NumberInput(attrs={'style': 'width: 80px;'})
    )
    
    penalty_reason = forms.CharField(
        required=False,
        max_length=200,
        label='Reason',
        help_text='E.g., "excessive contact", "illegal technique", "unsportsmanlike conduct"',
        widget=forms.TextInput(attrs={'style': 'width: 250px;', 'placeholder': 'excessive contact'})
    )
    
    class Meta:
        model = RefereePointEvent
        fields = '__all__'
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Pre-populate fields from metadata if editing existing object
        if self.instance and self.instance.pk and self.instance.metadata:
            metadata = self.instance.metadata
            if isinstance(metadata, dict):
                self.initial['penalty_round'] = metadata.get('round')
                self.initial['penalty_reason'] = metadata.get('reason')
    
    def save(self, commit=True):
        instance = super().save(commit=False)
        
        # Build metadata JSON from intuitive fields
        metadata = instance.metadata or {}
        if not isinstance(metadata, dict):
            metadata = {}
        
        # Set values from form fields
        if self.cleaned_data.get('penalty_round'):
            metadata['round'] = self.cleaned_data['penalty_round']
        if self.cleaned_data.get('penalty_reason'):
            metadata['reason'] = self.cleaned_data['penalty_reason']
        
        # Always mark as central penalty and from admin
        metadata['central'] = True
        metadata['origin'] = 'admin'
        
        instance.metadata = metadata
        
        if commit:
            instance.save()
        return instance


class CentralPenaltyInline(admin.TabularInline):
    """Editable inline on Match for creating and editing central penalty events.

    Inline enforces that saved rows are penalty events and marks them as
    central in metadata so the scoring helper treats them accordingly.
    """
    model = RefereePointEvent
    form = CentralPenaltyInlineForm
    extra = 1
    fields = ('referee', 'side', 'points', 'penalty_round', 'penalty_reason', 'created_by', 'timestamp')
    readonly_fields = ('created_by', 'timestamp')
    autocomplete_fields = ['referee']
    formset = CentralPenaltyInlineFormSet
    can_delete = True
    verbose_name = _('Central penalty')
    verbose_name_plural = _('Central penalties')

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        try:
            return qs.filter(event_type='penalty').order_by('-timestamp')
        except Exception:
            return qs.none()

class CategoryRefereeAssignmentForm(forms.ModelForm):
    """Custom form to handle polymorphic category assignment"""
    class Meta:
        model = CategoryRefereeAssignment
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for i in range(1, 6):
            field_name = f'referee_{i}'
            if field_name in self.fields:
                self.fields[field_name].label = f'Referee {i} (REF {i}):'
                self.fields[field_name].help_text = ''
    
    def clean(self):
        """Validate all referee assignments"""
        cleaned_data = super().clean()
        # Check that all referee foreign keys reference valid athletes
        for i in range(1, 6):
            ref_field = f'referee_{i}'
            ref_id = cleaned_data.get(ref_field)
            if ref_id:
                # Verify the referee exists
                if not Athlete.objects.filter(pk=ref_id.pk).exists():
                    raise ValidationError(f"Referee {i} (ID {ref_id.pk}) does not exist in database")
        return cleaned_data
    
    def save(self, commit=True):
        instance = super().save(commit=False)
        if commit:
            instance.save()
        return instance


class CategoryRefereeAssignmentInline(admin.StackedInline):
    """Inline to assign 5 referees (R1-R5) to a category"""
    model = CategoryRefereeAssignment
    form = CategoryRefereeAssignmentForm
    extra = 1
    max_num = 1
    can_delete = False
    autocomplete_fields = ('referee_1', 'referee_2', 'referee_3', 'referee_4', 'referee_5')
    fields = ('referee_1', 'referee_2', 'referee_3', 'referee_4', 'referee_5')
    verbose_name = _('Referees')
    verbose_name_plural = _('Referees')
    
    class Media:
        css = {
            'all': ('/static/admin/css/referee_assignment_compact.css?v=20260206',)
        }
    
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        """Filter autocomplete to show only approved athletes with is_referee=True"""
        if db_field.name.startswith('referee_'):
            kwargs["queryset"] = Athlete.objects.filter(is_referee=True, status='approved')
            formfield = super().formfield_for_foreignkey(db_field, request, **kwargs)
            formfield.widget = autocomplete.ModelSelect2(
                url='athlete-autocomplete',
                forward=['category', forward.Const('1', 'only_referees')]
            )
            return formfield
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

class CategoryAthleteScoreInlineForm(forms.ModelForm):
    """Custom form for CategoryAthleteScore inline with editable R1-R5 fields"""
    r1_score_field = forms.DecimalField(
        max_digits=5, 
        decimal_places=2, 
        required=False,
        label='R1',
        initial=0
    )
    r2_score_field = forms.DecimalField(
        max_digits=5, 
        decimal_places=2, 
        required=False,
        label='R2',
        initial=0
    )
    r3_score_field = forms.DecimalField(
        max_digits=5, 
        decimal_places=2, 
        required=False,
        label='R3',
        initial=0
    )
    r4_score_field = forms.DecimalField(
        max_digits=5, 
        decimal_places=2, 
        required=False,
        label='R4',
        initial=0
    )
    r5_score_field = forms.DecimalField(
        max_digits=5, 
        decimal_places=2, 
        required=False,
        label='R5',
        initial=0
    )
    
    class Meta:
        model = CategoryAthleteScore
        fields = '__all__'
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Populate existing scores if instance exists and has a pk
        if self.instance and self.instance.pk:
            try:
                for i in range(1, 6):
                    score = self.instance.get_referee_score(i)
                    if score is not None:
                        self.fields[f'r{i}_score_field'].initial = score
            except Exception:
                # Skip if there's any issue accessing referee scores
                pass

class CategoryAthleteScoreInline(admin.TabularInline):
    model = CategoryAthleteScore
    form = CategoryAthleteScoreInlineForm
    extra = 1
    autocomplete_fields = ['athlete']
    fields = ('athlete', 'r1_score_field', 'r2_score_field', 'r3_score_field', 'r4_score_field', 'r5_score_field', 'get_total_score', 'status', 'referee_assignment_display')
    readonly_fields = ('get_total_score', 'referee_assignment_display')
    ordering = ('-submitted_date',)
    verbose_name = _('Athlete Score')
    verbose_name_plural = _('Athlete Scores (Solo Category)')
    
    def referee_assignment_display(self, obj):
        """Display the assigned referees for this category"""
        if not obj.category:
            return "No category assigned"
        
        try:
            assignment = obj.category.referee_assignment
            referees = []
            for i in range(1, 6):
                ref_attr = f'referee_{i}'
                ref = getattr(assignment, ref_attr, None)
                if ref:
                    referees.append(f"R{i}: {ref.first_name} {ref.last_name}")
                else:
                    referees.append(f"R{i}: Not assigned")
            return format_html('<div style="font-size: 11px; color: #666; white-space: nowrap;">' + '<br>'.join(referees) + '</div>')
        except:
            return "No referees assigned"
    
    referee_assignment_display.short_description = 'Referees'

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'athlete':
            formfield = super().formfield_for_foreignkey(db_field, request, **kwargs)
            formfield.widget = autocomplete.ModelSelect2(
                url='athlete-autocomplete',
                forward=['category']
            )
            return formfield
        return super().formfield_for_foreignkey(db_field, request, **kwargs)
    
    @admin.display(description='Total Score')
    def get_total_score(self, obj):
        """Display the calculated total score"""
        if obj.pk:
            return obj.calculated_score or '-'
        return '-'

class CategoryTeamScoreInlineForm(forms.ModelForm):
    """Custom form for team enrollment (CategoryAthleteScore with type='teams')"""
    team_name_select = forms.ChoiceField(
        required=False,
        label='Team Name',
        help_text='Select from enrolled teams'
    )
    
    class Meta:
        model = CategoryAthleteScore
        fields = ('team_name', 'status', 'notes')
        widgets = {
            'notes': forms.Textarea(attrs={'rows': 2, 'cols': 40}),
        }
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        instance = kwargs.get('instance')
        
        # Get the category from instance or parent form
        category = None
        if instance and instance.category:
            category = instance.category
        elif hasattr(self, 'parent_instance'):
            category = self.parent_instance
        
        # Populate team choices from enrolled teams
        team_choices = [('', '---------')]
        if category:
            enrolled_teams = category.enrolled_teams.select_related('team').all()
            team_choices.extend([(ct.team.name, ct.team.name) for ct in enrolled_teams])
        
        self.fields['team_name_select'].choices = team_choices
        
        # Pre-select current team name if editing
        if instance and instance.team_name:
            self.fields['team_name_select'].initial = instance.team_name
    
    def clean(self):
        cleaned_data = super().clean()
        team_name_select = cleaned_data.get('team_name_select')
        
        # Copy selected team name to the actual team_name field
        if team_name_select:
            cleaned_data['team_name'] = team_name_select
        
        return cleaned_data
    
    def save(self, commit=True):
        instance = super().save(commit=False)
        
        # Ensure team_name is set from team_name_select
        team_name_select = self.cleaned_data.get('team_name_select')
        if team_name_select:
            instance.team_name = team_name_select
        
        # Ensure type is set to 'teams'
        if not instance.type:
            instance.type = 'teams'
        
        if commit:
            instance.save()
            self.save_m2m()
        
        return instance


class CategoryTeamScoreInline(admin.TabularInline):
    """Inline to add team entries to a team category"""
    model = CategoryAthleteScore
    form = CategoryTeamScoreInlineForm
    extra = 1
    fields = ('team_name_select', 'get_r1_score', 'get_r2_score', 'get_r3_score', 'get_r4_score', 'get_r5_score', 'get_total_score', 'status', 'notes')
    readonly_fields = ('get_r1_score', 'get_r2_score', 'get_r3_score', 'get_r4_score', 'get_r5_score', 'get_total_score', 'referee_assignment_display')
    ordering = ('-submitted_date',)
    verbose_name = _('Team Entry')
    verbose_name_plural = _('Team Entries')
    fk_name = 'category'
    
    def get_queryset(self, request):
        """Filter to show only team-type scores"""
        qs = super().get_queryset(request)
        return qs.filter(type='teams')
    
    def referee_assignment_display(self, obj):
        """Display the assigned referees for this category"""
        if not obj.category:
            return "No category assigned"
        
        try:
            assignment = obj.category.referee_assignment
            referees = []
            for i in range(1, 6):
                ref_attr = f'referee_{i}'
                ref = getattr(assignment, ref_attr, None)
                if ref:
                    referees.append(f"R{i}: {ref.first_name} {ref.last_name}")
                else:
                    referees.append(f"R{i}: Not assigned")
            return format_html('<div style="font-size: 12px; color: #666;">' + '<br>'.join(referees) + '</div>')
        except:
            return "No referees assigned to this category"
    
    referee_assignment_display.short_description = 'Assigned Referees'
    
    def get_formset(self, request, obj=None, **kwargs):
        """Pass the category instance to the form"""
        formset = super().get_formset(request, obj, **kwargs)
        # Store category in formset for access in form __init__
        if obj:
            formset.category = obj
            # Monkey patch form __init__ to pass category
            original_init = formset.form.__init__
            def patched_init(form_self, *args, **kwargs):
                original_init(form_self, *args, **kwargs)
                form_self.parent_instance = obj
                # Rebuild team choices now that we have the category
                if obj:
                    enrolled_teams = obj.enrolled_teams.select_related('team').all()
                    team_choices = [('', '---------')]
                    team_choices.extend([(ct.team.name, ct.team.name) for ct in enrolled_teams])
                    form_self.fields['team_name_select'].choices = team_choices
            formset.form.__init__ = patched_init
        return formset
    
    @admin.display(description='R1')
    def get_r1_score(self, obj):
        """Display R1 score with edit link"""
        if obj.pk:
            score = obj.get_referee_score(1)
            if score is not None:
                return format_html('{:.2f}', score)
            return format_html('<a href="{}?athlete_score={}" style="color: #417690;">Add Score</a>', 
                             '/admin/api/categoryscore/add/', obj.pk)
        return '-'
    
    @admin.display(description='R2')
    def get_r2_score(self, obj):
        """Display R2 score with edit link"""
        if obj.pk:
            score = obj.get_referee_score(2)
            if score is not None:
                return format_html('{:.2f}', score)
            return format_html('<a href="{}?athlete_score={}" style="color: #417690;">Add Score</a>', 
                             '/admin/api/categoryscore/add/', obj.pk)
        return '-'
    
    @admin.display(description='R3')
    def get_r3_score(self, obj):
        """Display R3 score with edit link"""
        if obj.pk:
            score = obj.get_referee_score(3)
            if score is not None:
                return format_html('{:.2f}', score)
            return format_html('<a href="{}?athlete_score={}" style="color: #417690;">Add Score</a>', 
                             '/admin/api/categoryscore/add/', obj.pk)
        return '-'
    
    @admin.display(description='R4')
    def get_r4_score(self, obj):
        """Display R4 score with edit link"""
        if obj.pk:
            score = obj.get_referee_score(4)
            if score is not None:
                return format_html('{:.2f}', score)
            return format_html('<a href="{}?athlete_score={}" style="color: #417690;">Add Score</a>', 
                             '/admin/api/categoryscore/add/', obj.pk)
        return '-'
    
    @admin.display(description='R5')
    def get_r5_score(self, obj):
        """Display R5 score with edit link"""
        if obj.pk:
            score = obj.get_referee_score(5)
            if score is not None:
                return format_html('{:.2f}', score)
            return format_html('<a href="{}?athlete_score={}" style="color: #417690;">Add Score</a>', 
                             '/admin/api/categoryscore/add/', obj.pk)
        return '-'
    
    @admin.display(description='Total')
    def get_total_score(self, obj):
        """Display the calculated total score"""
        if obj.pk:
            return obj.calculated_score or '-'
        return '-'
    
    def save_formset(self, request, form, formset, change):
        """Save team entries and auto-create empty referee scores"""
        # Save instances without committing to DB yet
        instances = formset.save(commit=False)
        
        # Save all instances with proper category and type
        for instance in instances:
            if not instance.category_id:
                instance.category = form.instance
            if not instance.type:
                instance.type = 'teams'
            instance.save()
        
        # Delete any instances marked for deletion
        for obj in formset.deleted_objects:
            obj.delete()
        
        formset.save_m2m()
        
        # Auto-create empty CategoryRefereeScore records for this team entry
        # Get the referee assignment for this category
        try:
            referee_assignment = CategoryRefereeAssignment.objects.get(
                category=form.instance
            )
            
            # For each newly saved team entry, create empty scores for all 5 referees
            for instance in instances:
                if instance.pk:  # Only for saved instances
                    for i in range(1, 6):
                        referee = getattr(referee_assignment, f'referee_{i}', None)
                        if referee:
                            CategoryRefereeScore.objects.get_or_create(
                                athlete_score=instance,
                                referee=referee,
                                defaults={'score': 0}
                            )
        except CategoryRefereeAssignment.DoesNotExist:
            pass


class TeamMemberInline(admin.TabularInline):
    model = TeamMember
    extra = 1  # Allow adding new athletes to the team
    autocomplete_fields = ['athlete']
    verbose_name = _('Team Member')
    verbose_name_plural = _('Team Members')

class EnrolledTeamsInline(admin.TabularInline):
    model = CategoryTeam
    extra = 1  # Allow adding new teams
    autocomplete_fields = ['team']  # Add autocomplete for team selection
    fields = ('team', 'ref1_score', 'ref2_score', 'ref3_score', 'ref4_score', 'ref5_score', 'total_display', 'place', 'disqualified')
    readonly_fields = ('total_display',)
    verbose_name_plural = _('Teams Enrolled')  # Rename the section title
    
    class Media:
        css = {
            'all': ('/static/admin/css/enrolled_teams_compact.css?v=20260206',)
        }
    
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        """Style foreign key fields, especially team autocomplete"""
        formfield = super().formfield_for_foreignkey(db_field, request, **kwargs)
        
        # Set width for team field
        if db_field.name == 'team':
            formfield.widget.attrs.update({
                'style': 'width: 200px !important; max-width: 200px !important; min-width: 200px !important;',
                'class': 'vForeignKeyRawIdAdminField'
            })
        
        return formfield
    
    def formfield_for_dbfield(self, db_field, request, **kwargs):
        """Add inline styles to narrow down columns"""
        formfield = super().formfield_for_dbfield(db_field, request, **kwargs)
        
        # Set width for team field
        if db_field.name == 'team':
            formfield.widget.attrs.update({
                'style': 'width: 200px !important; max-width: 200px !important; min-width: 200px !important;'
            })
        # Set width for referee score fields
        elif db_field.name.startswith('ref') and db_field.name.endswith('_score'):
            formfield.widget.attrs.update({
                'style': 'width: 80px !important; max-width: 80px !important;'
            })
        # Set width for other fields
        elif db_field.name in ('place', 'disqualified'):
            formfield.widget.attrs.update({
                'style': 'width: 80px !important; max-width: 80px !important;'
            })
        
        return formfield
    
    def total_display(self, obj):
        """Display calculated total score"""
        if obj and obj.total_score is not None:
            return f"{obj.total_score:.2f}"
        return "-"
    total_display.short_description = 'Total'

class AthleteSoloResultsInline(admin.TabularInline):
    """
    Inline to display results for solo categories.
    """
    model = CategoryAthlete
    extra = 0
    verbose_name = _('Solo Results')
    verbose_name_plural = _('Solo Results')
    can_add = False  # Disable the "Add another" button
    can_delete = False  # Disable the "Delete" button
    show_change_link = False  # Hide the "Change" link
    fields = ('category_name', 'competition_name', 'results')  # Fields to display
    readonly_fields = ('category_name', 'competition_name', 'results')  # Make fields read-only
    
    def has_add_permission(self, request, obj=None):
        return False

    def get_queryset(self, request):
        """
        Filter the queryset to include only results for solo categories.
        """
        qs = super().get_queryset(request)
        return qs.filter(category__solocategory__isnull=False)  # Filter by SoloCategory type

    def category_name(self, obj):
        """
        Display the category name.
        """
        return obj.category.name
    category_name.short_description = _('Category Name')

    def competition_name(self, obj):
        """
        Display the event name.
        """
        if obj.category and obj.category.event:
            return obj.category.event.title
        return _('N/A')
    competition_name.short_description = _('Event Name')

    def results(self, obj):
        """
        Display the results of the athlete for solo categories.
        """
        if obj.category.first_place == obj.athlete:
            return _('1st Place')
        elif obj.category.second_place == obj.athlete:
            return _('2nd Place')
        elif obj.category.third_place == obj.athlete:
            return _('3rd Place')
        return _('No Placement')
    results.short_description = _('Place Obtained')


class AthleteTeamResultsInline(admin.TabularInline):
    """Compact tabular inline to show team results related to this athlete.

    Uses CategoryAthleteScore (team results model) filtered to type='teams'.
    Displayed as a single inline on the Athlete change form so there are no
    nested or duplicate inlines.
    """
    model = CategoryAthleteScore
    extra = 0
    verbose_name = _('Team Result')
    verbose_name_plural = _('Team Results')
    can_add = False
    can_delete = False
    show_change_link = True
    fields = ('competition_name', 'category_name', 'team_name', 'team_members_display', 'placement_claimed', 'status')
    readonly_fields = ('competition_name', 'category_name', 'team_name', 'team_members_display', 'placement_claimed', 'status')

    fk_name = 'athlete'
    
    def has_add_permission(self, request, obj=None):
        return False

    def get_formset(self, request, obj=None, **kwargs):
        """Wrap the formset so its queryset includes team entries where this
        athlete is a team member (team_members M2M) in addition to rows where
        they are the primary `athlete` FK.
        """
        FormSet = super().get_formset(request, obj, **kwargs)

        class WrappedFormSet(FormSet):
            def __init__(self, *args, **kw):
                super().__init__(*args, **kw)
                try:
                    # self.queryset is already limited to athlete=<parent>
                    qs = self.queryset
                    if obj is not None:
                        from .models import CategoryAthleteScore
                        extra = CategoryAthleteScore.objects.filter(type='teams', team_members=obj)
                        # Combine and deduplicate
                        self.queryset = (qs | extra).distinct().select_related('category__event').prefetch_related('team_members')
                except Exception:
                    pass

        return WrappedFormSet

    def competition_name(self, obj):
        return obj.category.event.title if obj.category and obj.category.event else 'N/A'
    competition_name.short_description = _('Event')

    def category_name(self, obj):
        return obj.category.name if obj.category else 'N/A'
    category_name.short_description = _('Category')

    def team_members_display(self, obj):
        return ', '.join([f"{m.first_name} {m.last_name}" for m in obj.team_members.all()])
    team_members_display.short_description = _('Team Members')


class AthleteFightResultsInline(admin.TabularInline):
    """
    Inline to display results for fight categories.
    """
    model = CategoryAthlete
    extra = 0
    verbose_name = "Fight Results"
    verbose_name_plural = "Fight Results"
    can_add = False  # Disable the "Add another" button
    can_delete = False  # Disable the "Delete" button
    show_change_link = False  # Hide the "Change" link
    fields = ('category_name', 'competition_name', 'results')  # Fields to display
    readonly_fields = ('category_name', 'competition_name', 'results')  # Make fields read-only
    
    def has_add_permission(self, request, obj=None):
        return False

    def get_queryset(self, request):
        """
        Filter the queryset to include only results for fight categories.
        """
        qs = super().get_queryset(request)
        return qs.filter(category__fightcategory__isnull=False)  # Filter by FightCategory type

    def category_name(self, obj):
        """
        Display the category name.
        """
        return obj.category.name
    category_name.short_description = "Category Name"

    def competition_name(self, obj):
        """
        Display the event name.
        """
        return obj.category.event.title if obj.category.event else "N/A"
    competition_name.short_description = "Event Name"

    def results(self, obj):
        """
        Display the results of the athlete for fight categories.
        """
        if obj.category.first_place == obj.athlete:
            return "1st Place"
        elif obj.category.second_place == obj.athlete:
            return "2nd Place"
        elif obj.category.third_place == obj.athlete:
            return "3rd Place"
        return "No Placement"
    results.short_description = "Place Obtained"


# Register City model
@admin.register(City)
class CityAdmin(admin.ModelAdmin):
    list_display = ('name', 'created', 'modified')
    search_fields = ('name',)
    ordering = ('name',)

    def get_search_results(self, request, queryset, search_term):
        queryset, use_distinct = super().get_search_results(request, queryset, search_term)
        if search_term:
            import unicodedata

            def normalize(value: str) -> str:
                if not value:
                    return ''
                normalized = unicodedata.normalize('NFKD', value)
                return ''.join(ch for ch in normalized if not unicodedata.combining(ch)).lower()

            norm_query = normalize(search_term.strip())
            if norm_query:
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
@admin.register(Club)
class ClubAdmin(admin.ModelAdmin):
    list_display = ('name', 'city', 'athlete_count', 'coach_count', 'address', 'mobile_number', 'website', 'created', 'modified')
    search_fields = ('name', 'city__name')
    autocomplete_fields = ('city',)
    filter_horizontal = ('coaches',)  # Add horizontal filter for ManyToManyField
    inlines = [AthleteInline]

    # Organize fields in the admin form
    fieldsets = (
        ('Club Details', {
            'fields': ('name', 'logo', 'city', 'address', 'mobile_number', 'website')
        }),
        ('Coaches', {
            'fields': ('coaches',),
            'description': 'Select athletes who are coaches for this club. Only athletes marked as coaches will appear in the list.'
        }),
        ('Timestamps', {
            'fields': ('modified',)  # Only include editable fields
        }),
    )

    readonly_fields = ('created', 'modified')  # Mark non-editable fields as read-only

    class Media:
        js = ('/static/admin/js/club_tabs.js?v=20260206',)
    
    def athlete_count(self, obj):
        """Display the number of athletes in this club"""
        return obj.athletes.count()
    athlete_count.short_description = _('Athletes')
    athlete_count.admin_order_field = 'athletes__count'
    
    def coach_count(self, obj):
        """Display the number of coaches in this club"""
        return obj.coaches.count()
    coach_count.short_description = _('Coaches')
    
    def get_queryset(self, request):
        """Optimize queryset to include athlete count for sorting"""
        qs = super().get_queryset(request)
        return qs.annotate(Count('athletes'))
    
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
                    inline.verbose_name_plural = f"Athletes ({athlete_count})"
        return inlines


# ---- Admin dashboard view -------------------------------------------------
def get_dashboard_context():
    """Return a dict with dashboard data for templates (JSON-ready strings)."""
    # Top clubs by athlete count
    clubs = Club.objects.annotate(num_athletes=Count('athletes')).order_by('-num_athletes')[:10]
    club_labels = [c.name for c in clubs]
    club_counts = [c.num_athletes for c in clubs]

    # Visa stats: annual visas valid vs expired
    from .models import Visa
    annual_visas = Visa.objects.filter(visa_type='annual')
    # Use case-insensitive matching to tolerate capitalization changes
    expired_count = annual_visas.filter(visa_status__iexact='expired').count()
    valid_count = annual_visas.filter(visa_status__iexact='valid').count()
    not_available = annual_visas.filter(visa_status__iregex=r'not\s*available|not_available').count()

    # New athletes per month (last 6 months)
    now = datetime.date.today()

    # Build a simple timeseries (last 6 months)
    series_labels = []
    series_counts = []
    athlete_months = (
        Athlete.objects
        .annotate(month=TruncMonth('submitted_date'))
        .values('month')
        .annotate(count=Count('id'))
        .order_by('month')
    )
    for i in range(5, -1, -1):
        month = (now.replace(day=1) - datetime.timedelta(days=30 * i)).replace(day=1)
        label = month.strftime('%Y-%m')
        series_labels.append(label)
        found = next((a['count'] for a in athlete_months if a['month'] and a['month'].strftime('%Y-%m') == label), 0)
        series_counts.append(found)

    # Clubs by city (top 8)
    clubs_by_city_qs = (
        Club.objects.values('city__name')
        .annotate(count=Count('id'))
        .order_by('-count')[:8]
    )
    city_labels = [c['city__name'] or 'Unknown' for c in clubs_by_city_qs]
    city_counts = [c['count'] for c in clubs_by_city_qs]

    context = {
        'club_labels': mark_safe(json.dumps(club_labels)),
        'club_counts': mark_safe(json.dumps(club_counts)),
        'visa_stats': mark_safe(json.dumps({'expired': expired_count, 'valid': valid_count, 'not_available': not_available})),
        'new_athlete_labels': mark_safe(json.dumps(series_labels)),
        'new_athlete_counts': mark_safe(json.dumps(series_counts)),
        'city_labels': mark_safe(json.dumps(city_labels)),
        'city_counts': mark_safe(json.dumps(city_counts)),
    }
    # Ensure templates that iterate over app lists won't render modules in the
    # content area. Provide empty structures as a defensive measure.
    context['app_list'] = []
    context['ordered_apps'] = []
    context['available_apps'] = []
    return context


def dashboard_view(request):
    """Dashboard route kept for direct access; renders template with context."""
    context = get_dashboard_context()
    return render(request, 'admin/api/dashboard.html', context)


# Register the dashboard URL on the admin site
def _get_admin_urls(original_get_urls):
    def get_urls():
        urls = original_get_urls()
        my_urls = [
            path('api-dashboard/', admin.site.admin_view(dashboard_view), name='api-dashboard'),
        ]
        return my_urls + urls
    return get_urls

# Patch admin site urls once
admin.site.get_urls = _get_admin_urls(admin.site.get_urls)
# Replace the default admin index template with our dashboard so /admin/ shows charts
try:
    admin.site.index_template = 'admin/api/dashboard.html'
except Exception:
    # Older Django versions may not support index_template assignment; ignore safely
    pass


# Provide a custom admin index view that supplies our dashboard context so
# the template has the JSON variables it expects when Django renders /admin/.
def _admin_index_with_dashboard(request, extra_context=None):
    """Admin index replacement that injects the dashboard context."""
    context = get_dashboard_context()
    # Merge standard admin context (site header/title, etc.) so the template
    # can render the usual admin chrome (and app list for the sidebar).
    try:
        std = admin.site.each_context(request)
        context.update(std)
    except Exception:
        pass

    # Provide the app_list (models grouped by app) like the default index view
    try:
        # Provide a separate app list for the sidebar to avoid rendering the
        # same modules inside the content area. `app_list` is intentionally
        # set empty so default index content doesn't render module blocks.
        context['sidebar_app_list'] = admin.site.get_app_list(request)
        context['app_list'] = []
    except Exception:
        context['sidebar_app_list'] = []
        context['app_list'] = []

    if extra_context:
        try:
            context.update(extra_context)
        except Exception:
            pass
    return render(request, 'admin/api/dashboard.html', context)

# Register the custom index view on the admin site (wrapped with admin_view)
try:
    admin.site.index = admin.site.admin_view(_admin_index_with_dashboard)
except Exception:
    # If assignment fails for some Django versions, the index_template fallback
    # remains and the /admin/api-dashboard/ route still works.
    pass


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
            from .models import TrainingSeminarParticipation

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
    image_preview.short_description = 'Image Preview'

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
@admin.register(Title)
class TitleAdmin(admin.ModelAdmin):
    list_display = ('name',)
    search_fields = ('name',)

# Register FederationRole model
@admin.register(FederationRole)
class FederationRoleAdmin(admin.ModelAdmin):
    list_display = ('name', 'get_associated_athletes')
    search_fields = ('name',)

    def get_associated_athletes(self, obj):
        """
        Custom method to display athletes associated with the federation role.
        """
        athletes = Athlete.objects.filter(federation_role=obj)
        return ", ".join([f"{athlete.first_name} {athlete.last_name}" for athlete in athletes]) if athletes else "None"
    get_associated_athletes.short_description = _('Associated Athletes')


# Competition model is now represented as an Event (event_type='competition').
# To avoid duplicate/confusing admin UI we do not register Competition here.
# The legacy Competition model remains in code for compatibility but admin users
# should manage events via the Landing > Event admin.

class CategoryTeamInline(admin.TabularInline):
    model = CategoryTeam
    extra = 0
    autocomplete_fields = ['category']
    fields = ('category', 'place_obtained')
    readonly_fields = ('place_obtained',)
    verbose_name_plural = "TEAM ENROLLED TO FOLLOWING CATEGORIES"  # Rename the section title
    def place_obtained(self, obj):
        """
        Display the place obtained by the team in the category.
        """
        if obj.category.first_place_team == obj.team:
            return "1st Place"
        elif obj.category.second_place_team == obj.team:
            return "2nd Place"
        elif obj.category.third_place_team == obj.team:
            return "3rd Place"
        return "No Placement"
    place_obtained.short_description = "Place Obtained"

class GroupInline(admin.TabularInline):
    """
    Inline configuration for managing groups within a category.
    """
    model = Group
    extra = 1  # Number of empty forms to display
    fields = ('name',)  # Only display the name field
    verbose_name = "Group"
    verbose_name_plural = "Groups"

class CategoryAdminForm(forms.ModelForm):
    class Meta:
        model = Category
        exclude = ('category_number',)

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    """Admin for base Category model to support autocomplete"""
    form = CategoryAdminForm
    list_display = ('id', 'name_link', 'group', 'event')
    search_fields = ('name', 'event__title')
    list_filter = ('event', 'group')

    def name_link(self, obj):
        url = reverse('admin:api_category_change', args=(obj.pk,))
        return format_html('<a href="{}" style="font-weight: 500;">{}</a>', url, obj.name)
    name_link.short_description = 'Name'
    name_link.admin_order_field = 'name'
    
@admin.register(SoloCategory)
class SoloCategoryAdmin(VersionAdmin, admin.ModelAdmin):
    list_display = ('category_id_display', 'category_name_display', 'event', 'get_group_display', 'gender', 'status', 'display_winners')
    search_fields = ('name', 'event__title', 'gender', 'group__name')
    list_filter = ('event', 'gender', 'group', 'status')
    autocomplete_fields = ['group']
    competition_field = 'event'
    
    fieldsets = [
        ('Category Details', {
            'fields': ('event', 'group', 'name', 'gender', 'status'),
            'description': 'Group organizes categories by age range (e.g., athletes born 2015-2018). Assign places directly in the Athletes inline below.'
        }),
    ]
    
    def category_id_display(self, obj):
        """Display category ID as read-only"""
        return obj.pk
    category_id_display.short_description = 'ID'
    category_id_display.admin_order_field = 'pk'
    
    def category_name_display(self, obj):
        """Display category name as bold clickable link"""
        url = reverse('admin:api_solocategory_change', args=(obj.pk,))
        return format_html('<a href="{}" style="font-weight: 500;">{}</a>', url, obj.name)
    category_name_display.short_description = 'Category Name'
    category_name_display.admin_order_field = 'name'
    
    def get_group_display(self, obj):
        """Display group with age range"""
        if obj.group:
            if obj.group.birth_year_start and obj.group.birth_year_end:
                return f"{obj.group.name} ({obj.group.birth_year_start}-{obj.group.birth_year_end})"
            return obj.group.name
        return "No Group"
    get_group_display.short_description = 'Age Group'
    get_group_display.admin_order_field = 'group__name'
    
    def get_inlines(self, request, obj=None):
        """Include referees and athletes for solo categories"""
        inlines = []
        if obj:
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
        return f"1st: {obj.first_place}, 2nd: {obj.second_place}, 3rd: {obj.third_place}"
    display_winners.short_description = _('Winners')

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
    list_display = ('category_id_display', 'category_name_display', 'event', 'get_group_display', 'gender', 'status', 'display_winners')
    search_fields = ('name', 'event__title', 'gender', 'group__name')
    list_filter = ('event', 'gender', 'group', 'status')
    autocomplete_fields = ['group']
    competition_field = 'event'
    
    fieldsets = [
        ('Category Details', {
            'fields': ('event', 'group', 'name', 'gender', 'status'),
            'description': 'Group organizes categories by age range (e.g., athletes born 2015-2018). Assign places directly in the Teams inline below.'
        }),
    ]
    
    def category_id_display(self, obj):
        """Display category ID as read-only"""
        return obj.pk
    category_id_display.short_description = 'ID'
    category_id_display.admin_order_field = 'pk'
    
    def category_name_display(self, obj):
        """Display category name as bold clickable link"""
        url = reverse('admin:api_teamcategory_change', args=(obj.pk,))
        return format_html('<a href="{}" style="font-weight: 500;">{}</a>', url, obj.name)
    category_name_display.short_description = 'Category Name'
    category_name_display.admin_order_field = 'name'
    
    def get_group_display(self, obj):
        """Display group with age range"""
        if obj.group:
            if obj.group.birth_year_start and obj.group.birth_year_end:
                return f"{obj.group.name} ({obj.group.birth_year_start}-{obj.group.birth_year_end})"
            return obj.group.name
        return "No Group"
    get_group_display.short_description = 'Age Group'
    get_group_display.admin_order_field = 'group__name'
    
    def get_inlines(self, request, obj=None):
        """Include referees and teams for team categories"""
        inlines = []
        if obj:
            inlines.append(CategoryRefereeAssignmentInline)
            inlines.append(EnrolledTeamsInline)
        return inlines

    def display_winners(self, obj):
        """Display the team winners"""
        return f"1st: {obj.first_place_team}, 2nd: {obj.second_place_team}, 3rd: {obj.third_place_team}"
    display_winners.short_description = _('Winners')

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


class FightAthleteWeightInline(admin.TabularInline):
    """Inline for managing enrolled athletes and their weight data in fight categories"""
    model = FightAthleteWeight
    extra = 1
    fields = ('athlete', 'pre_weight_kg', 'current_weight_kg', 'is_disqualified', 'disqualification_reason', 'place')
    autocomplete_fields = ['athlete']
    verbose_name = _('Enrolled Athlete')
    verbose_name_plural = _('Enrolled Athletes')

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'athlete':
            formfield = super().formfield_for_foreignkey(db_field, request, **kwargs)
            formfield.widget = autocomplete.ModelSelect2(
                url='athlete-autocomplete',
                forward=['category']
            )
            return formfield
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


@admin.register(FightCategory)
class FightCategoryAdmin(VersionAdmin, admin.ModelAdmin):
    list_display = ('category_id_display', 'category_name_display', 'event', 'get_group_display', 'gender', 'status', 'display_winners', 'match_progress')
    search_fields = ('name', 'event__title', 'gender', 'group__name')
    list_filter = ('event', 'gender', 'group', 'status')
    autocomplete_fields = ['group']
    competition_field = 'event'
    
    fieldsets = [
        ('Category Details', {
            'fields': ('event', 'group', 'name', 'gender', 'status'),
            'description': 'Group organizes categories by age range (e.g., athletes born 2015-2018). Assign places directly in the Athletes inline below.'
        }),
        ('Brackets', {
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
        group_name = obj.group.name if obj.group else 'No Group'
        display_name = f"{obj.name} ({group_name})"
        return format_html('<a href="{}" style="font-weight: 500;">{}</a>', url, display_name)
    category_name_display.short_description = 'Category Name'
    category_name_display.admin_order_field = 'name'
    
    def get_group_display(self, obj):
        """Display group with age range"""
        if obj.group:
            if obj.group.birth_year_start and obj.group.birth_year_end:
                return f"{obj.group.name} ({obj.group.birth_year_start}-{obj.group.birth_year_end})"
            return obj.group.name
        return "No Group"
    get_group_display.short_description = 'Age Group'
    get_group_display.admin_order_field = 'group__name'
    
    def match_progress(self, obj):
        """Display match completion progress in list view"""
        stats = BracketStats.get_stats(obj)
        if stats['total_matches'] == 0:
            return format_html('<span style="color: #999;">—</span>')
        
        return format_html(
            '<div style="width: 100px; height: 20px; background: #f0f0f0; border-radius: 3px; overflow: hidden; position: relative;">'
            '<div style="background: #28a745; height: 100%; width: {}%; transition: width 0.3s;"></div>'
            '<span style="position: absolute; top: 2px; left: 5px; font-size: 11px; font-weight: bold; color: #333;">{}/{}</span>'
            '</div>',
            stats['completion_percentage'],
            stats['completed'],
            stats['total_matches']
        )
    match_progress.short_description = 'Progress'
    
    def bracket_display(self, obj):
        """Display tournament bracket visualization"""
        return bracket_visualization_readonly_field(self, obj)
    bracket_display.short_description = "Tournament Bracket"
    
    def bracket_stats_display(self, obj):
        """Display bracket statistics"""
        return BracketStats.get_stats_display(obj)
    bracket_stats_display.short_description = "Bracket Statistics"
    
    def get_inlines(self, request, obj=None):
        """Include enrolled athletes with weights and matches for fight categories"""
        inlines = []
        if obj:
            inlines.append(FightAthleteWeightInline)
            inlines.append(MatchInline)
        return inlines

    def display_winners(self, obj):
        """Display the fight winners"""
        return f"1st: {obj.first_place}, 2nd: {obj.second_place}, 3rd: {obj.third_place}"
    display_winners.short_description = _('Winners')

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
        ('Athlete & Category', {
            'fields': ('category', 'athlete')
        }),
        ('Weight Measurements', {
            'fields': ('pre_weight_kg', 'current_weight_kg', 'weight_loss_percentage')
        }),
        ('Disqualification', {
            'fields': ('is_disqualified', 'disqualification_reason')
        }),
        ('Record', {
            'fields': ('recorded_at',),
            'classes': ('collapse',)
        }),
    )
    readonly_fields = ('weight_loss_percentage', 'recorded_at')
    ordering = ['-recorded_at']


class TeamAdminForm(forms.ModelForm):
    """Custom form for Team that excludes the name property"""
    class Meta:
        model = Team
        exclude = ['categories']  # Only exclude many-to-many, name is handled automatically as property

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
        return ", ".join([category.name for category in categories]) if categories else "No Categories Assigned"
    assigned_categories.short_description = _('Assigned Categories')

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

class RefereePointEventInline(admin.TabularInline):
    from .models import RefereePointEvent
    model = RefereePointEvent
    extra = 0
    # Allow creating/editing penalty events inline using a friendly form
    extra = 1
    fields = ('referee', 'side', 'points', 'reason')
    readonly_fields = ()
    verbose_name = 'Central referee penalty'
    verbose_name_plural = 'Central referee penalties'
    can_delete = True

    # No custom Media for metadata editor â€” keep plain textarea behavior

    class RefereePointEventForm(forms.ModelForm):
        # Provide a structured JSON editor widget for the metadata field so admins
        # can see and insert the expected keys (round, central, reason, origin)
        reason = forms.CharField(required=False, label='Reason (optional)')
        round = forms.IntegerField(min_value=1, required=False, initial=1, label='Round')

        # metadata remains stored on the model; we don't expose a guided widget here

        class Meta:
            model = RefereePointEvent
            fields = ('referee', 'side', 'points')

        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            # Make side a choice select and ensure choices match model
            try:
                self.fields['side'].widget = forms.Select(choices=getattr(self.fields['side'], 'choices', []))
            except Exception:
                pass
            # reason and round are optional form helpers; keep them present for admin convenience

        def clean(self):
            """Validate the composed metadata (round, reason, central) against the schema
            so admins see immediate errors on the inline form instead of at model save time.
            """
            cleaned = super().clean()
            rd = cleaned.get('round')
            reason = cleaned.get('reason')
            meta = {}
            if rd is not None and rd != '':
                try:
                    meta['round'] = int(rd)
                except Exception:
                    # let schema/validator catch type errors
                    meta['round'] = rd
            if reason:
                meta['reason'] = reason
            # Inline-created penalties are treated as central by save(), validate accordingly
            meta['central'] = True
            try:
                from .validators import validate_referee_point_event_metadata
                validate_referee_point_event_metadata(meta)
            except Exception as e:
                from django.core.exceptions import ValidationError as DjangoValidationError
                if isinstance(e, DjangoValidationError):
                    raise forms.ValidationError(e.messages)
                raise forms.ValidationError(str(e))
            return cleaned
            # no custom widget setup for metadata

        def save(self, commit=True):
            inst = super().save(commit=False)
            # Always mark this event as a penalty when created through this inline
            inst.event_type = 'penalty'
            # Map reason and round into metadata JSON
            reason = self.cleaned_data.get('reason')
            rd = self.cleaned_data.get('round')
            inst.metadata = inst.metadata or {}
            if reason:
                try:
                    inst.metadata['reason'] = reason
                except Exception:
                    inst.metadata = {'reason': reason}
            if rd:
                try:
                    inst.metadata['round'] = int(rd)
                except Exception:
                    pass
            # Mark events created through this inline as central penalties so the
            # scoring helper treats them as central even if the referee field
            # was not set to the match.central_referee (admin convenience).
            try:
                inst.metadata['central'] = True
            except Exception:
                inst.metadata = (inst.metadata or {})
                inst.metadata['central'] = True
            if commit:
                inst.save()
                # If the match doesn't have a central_referee yet, set it to this referee
                try:
                    m = getattr(inst, 'match', None)
                    if m is not None and not getattr(m, 'central_referee_id', None):
                        m.central_referee = inst.referee
                        m.save(update_fields=['central_referee'])
                except Exception:
                    pass
            return inst

    def has_add_permission(self, request, obj=None):
        # Allow staff/superusers to add penalties. Non-staff may add only if they are
        # the athlete linked to the match.central_referee.
        try:
            if request.user.is_staff or request.user.is_superuser:
                return True
            if obj is None:
                return False
            central = getattr(obj, 'central_referee', None)
            if not central:
                return False
            from .models import Athlete
            athlete = Athlete.objects.filter(user=request.user).first()
            return athlete is not None and athlete.pk == central.pk
        except Exception:
            return False

    def has_change_permission(self, request, obj=None):
        return self.has_add_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        return self.has_add_permission(request, obj)

    form = RefereePointEventForm

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        try:
            object_id = request.resolver_match.kwargs.get('object_id')
        except Exception:
            object_id = None

        # Show only penalty events; prefer those linked to the match central referee
        if object_id:
            try:
                match = Match.objects.filter(pk=object_id).first()
                if match and getattr(match, 'central_referee_id', None):
                    return qs.filter(event_type='penalty')
            except Exception:
                pass
        return qs.filter(event_type='penalty')

    def get_formset(self, request, obj=None, **kwargs):
        """Prefill new inline forms with the match.central_referee when available."""
        FormSet = super().get_formset(request, obj, **kwargs)

        class PrefilledFormSet(FormSet):
            def __init__(self, *a, **kw):
                super().__init__(*a, **kw)
                try:
                    if obj is not None and getattr(obj, 'central_referee_id', None):
                        # For empty forms, set initial referee to the central referee
                        for form in self.forms:
                            if not form.initial and not form.instance.pk:
                                form.initial.setdefault('referee', obj.central_referee_id)
                except Exception:
                    pass

        return PrefilledFormSet


class CentralPenaltyForm(forms.Form):
    SIDE_CHOICES = [('red', 'Red Corner'), ('blue', 'Blue Corner')]
    side = forms.ChoiceField(choices=SIDE_CHOICES, label='Penalty side')
    points = forms.IntegerField(min_value=1, initial=1, label='Penalty points')
    reason = forms.CharField(required=False, widget=forms.Textarea, label='Reason (optional)')


# ============================================================================
# VIDEO RECORDING INLINE CLASSES (used by Match and Category admins)
# ============================================================================

class AthletePerformanceVideoInline(admin.TabularInline):
    """Inline for adding performance videos to individual athletes in Solo categories"""
    model = AthletePerformanceVideo
    extra = 0
    fields = ('athlete_display', 'video_file', 'video_url', 'recorded_at', 'is_public')
    readonly_fields = ('athlete_display',)
    verbose_name = _('Solo Performance Video')
    verbose_name_plural = _('Solo Performance Videos')
    show_change_link = True
    
    def athlete_display(self, obj):
        """Display athlete name"""
        if obj.athlete_score and obj.athlete_score.athlete:
            athlete = obj.athlete_score.athlete
            return f"{athlete.first_name} {athlete.last_name}"
        return '-'
    athlete_display.short_description = 'Athlete'
    
    def get_queryset(self, request):
        """Filter videos by category from parent object"""
        qs = super().get_queryset(request)
        # Get category_id from the parent object (SoloCategory)
        if hasattr(self, 'parent_obj') and self.parent_obj:
            qs = qs.filter(athlete_score__category_id=self.parent_obj.id)
        return qs


class AthletePerformanceVideoForm(forms.ModelForm):
    class Meta:
        model = AthletePerformanceVideo
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        field = self.fields.get('athlete_score')
        if field:
            def label_from_instance(obj):
                athlete = obj.athlete
                category = obj.category
                
                if not athlete:
                    return f"{category.name if category else 'Unknown'}"
                
                group = category.group if category else None
                event = category.event if category else None
                group_name = group.name if group else 'No Group'
                event_title = event.title if event else 'No Competition'
                return (
                    f"{athlete.first_name} {athlete.last_name} - "
                    f"{category.name} - {group_name} - {event_title}"
                )
            field.label_from_instance = label_from_instance


class TeamPerformanceVideoForm(forms.ModelForm):
    class Meta:
        model = TeamPerformanceVideo
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        field = self.fields.get('category_team')
        if field:
            def label_from_instance(obj):
                team = obj.team
                category = obj.category
                
                if not team or not category:
                    return f"{team.name if team else 'Unknown'}"
                
                group = category.group if category else None
                event = category.event if category else None
                group_name = group.name if group else 'No Group'
                event_title = event.title if event else 'No Competition'
                return (
                    f"{team.name} - "
                    f"{category.name} - {group_name} - {event_title}"
                )
            field.label_from_instance = label_from_instance


class MatchVideoRecordingForm(forms.ModelForm):
    class Meta:
        model = MatchVideoRecording
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        field = self.fields.get('match')
        if field:
            def label_from_instance(obj):
                category = obj.category
                
                if not category:
                    return obj.name
                
                group = category.group if category else None
                event = category.event if category else None
                group_name = group.name if group else 'No Group'
                event_title = event.title if event else 'No Competition'
                return (
                    f"{obj.name} - "
                    f"{category.name} - {group_name} - {event_title}"
                )
            field.label_from_instance = label_from_instance


class TeamPerformanceVideoInline(admin.TabularInline):
    """Inline for adding performance videos to teams in Team categories"""
    model = TeamPerformanceVideo
    extra = 0
    fields = ('team_display', 'video_file', 'video_url', 'recorded_at', 'is_public')
    readonly_fields = ('team_display',)
    verbose_name = _('Performance Video')
    verbose_name_plural = _('Performance Videos')
    show_change_link = True
    
    def team_display(self, obj):
        """Display team name"""
        if obj.category_team and obj.category_team.team:
            return obj.category_team.team.name
        return '-'
    team_display.short_description = 'Team'
    
    def get_queryset(self, request):
        """Filter videos by category from parent object"""
        qs = super().get_queryset(request)
        # Get category_id from the parent object (TeamCategory)
        if hasattr(self, 'parent_obj') and self.parent_obj:
            qs = qs.filter(category_team__category_id=self.parent_obj.id)
        return qs


class MatchVideoRecordingInline(admin.TabularInline):
    """Inline for adding videos to Fight matches"""
    model = MatchVideoRecording
    extra = 0
    fields = ('video_file', 'video_url', 'recorded_at', 'is_public')
    verbose_name = _('Video Recording')
    verbose_name_plural = _('Video Recordings (Optional)')
    show_change_link = True


class MatchRefereeAssignmentInline(admin.TabularInline):
    """Inline for assigning referees to matches in fight categories"""
    model = MatchRefereeAssignment
    extra = 0
    fields = ('referee_1', 'referee_2', 'referee_3', 'referee_4', 'referee_5')
    autocomplete_fields = ['referee_1', 'referee_2', 'referee_3', 'referee_4', 'referee_5']
    verbose_name = _('Referee Assignment')
    verbose_name_plural = _('Referee Assignments')


@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    list_display = ('get_id_display', 'name_with_corners', 'match_type', 'status', 'get_winner', 'category_link')
    search_fields = ('name', 'red_corner__first_name', 'red_corner__last_name', 'blue_corner__first_name', 'blue_corner__last_name', 'category__name', 'category__event__title')
    list_filter = ('match_type', 'status', 'category__event')
    competition_field = 'category'  # Will be filled from category's event

    # Use a custom change form template so we can add a quick 'Add central penalty' button
    change_form_template = 'admin/api/match/change_form.html'

    fieldsets = (
        ('MATCH DETAILS', {
            # Central referee is selected in the Central Penalties inline below
            # Winner is read-only and computed from referee scores/penalties
            'fields': ('category', 'match_type', 'red_corner', 'blue_corner', 'status', 'winner_display'),
            'description': 'Identify matches by their primary key (ID). Winner is automatically computed from referee scores and penalties.'
        } ),
    )

    autocomplete_fields = ['red_corner', 'blue_corner']  # Winner is computed and read-only

    readonly_fields = ('winner_display',)
    
    def get_changeform_initial_data(self, request):
        """Pre-fill category from current competition if available"""
        initial = super().get_changeform_initial_data(request) or {}
        current_comp_id = request.session.get('current_competition_id')
        
        if current_comp_id and 'category' not in initial:
            try:
                from .models import Category
                # Get first category from this competition
                category = Category.objects.filter(event_id=current_comp_id).first()
                if category:
                    initial['category'] = category
            except Exception:
                pass
        
        return initial
    
    def get_id_display(self, obj):
        """Display match ID"""
        return obj.pk
    get_id_display.short_description = 'ID'
    get_id_display.admin_order_field = 'pk'

    # Show referee scores, central penalties, and video recordings
    inlines = [RefereeScoreInline, CentralPenaltyInline, MatchVideoRecordingInline]

    class Media:
        js = ('/static/api/js/referee_inline_winner.js', '/static/api/js/recompute_match_results.js', '/static/api/js/category_scores.js',)
        css = {
            'all': ('/static/api/css/category_scores.css',)
        }

    def name_with_corners(self, obj):
        """
        Display the full names of the athletes with their corner in parentheses as a clickable bold link.
        """
        url = reverse('admin:api_match_change', args=(obj.pk,))
        match_name = f"{obj.red_corner.first_name} {obj.red_corner.last_name} (Red Corner) vs {obj.blue_corner.first_name} {obj.blue_corner.last_name} (Blue Corner)"
        return format_html('<a href="{}" style="font-weight: bold;">{}</a>', url, match_name)
    name_with_corners.short_description = _('Match Name')

    def central_referee_display(self, obj):
        """
        Display the central referee in the change list.
        """
        if obj.central_referee:
            return f"{obj.central_referee.first_name} {obj.central_referee.last_name}"
        return "TBD"
    central_referee_display.short_description = _('Central Referee')

    def competition(self, obj):
        """
        Display the event name associated with the match.
        """
        return obj.category.event.title if obj.category.event else "N/A"
    competition.short_description = _('Event')

    def category_link(self, obj):
        """
        Display the category name as a bold clickable link.
        """
        return format_html('<a href="/admin/api/category/{}/change/" style="font-weight: bold;">{}</a>', obj.category.id, obj.category.name)
    category_link.short_description = _('Category')

    def get_winner(self, obj):
        """
        Display the full name of the winner in the admin interface.
        """
        try:
            # Prefer the computed winner from referee aggregates so the change-list
            # reflects the same logic as the change form.
            from api.scoring import compute_match_results
            results = compute_match_results(obj)
            mw = results.get('match_winner')
            if mw:
                return f"{mw.first_name} {mw.last_name}"
        except Exception:
            # fall back to stored winner
            pass
        return f"{obj.winner.first_name} {obj.winner.last_name}" if obj.winner else "TBD"
    get_winner.short_description = _('Winner')

    def winner_display(self, obj):
        """Computed winner display for the change form.

        Uses the shared scoring helper to determine the match winner based on
        referee scores and central penalties. Returns the athlete's full name
        or 'TBD' when no winner can be determined.
        """
        try:
            from api.scoring import compute_match_results
            results = compute_match_results(obj)
            mw = results.get('match_winner')
            if mw:
                return f"{mw.first_name} {mw.last_name}"
            return 'TBD'
        except Exception:
            # Fall back to stored winner if compute fails
            try:
                return f"{obj.winner.first_name} {obj.winner.last_name}" if obj.winner else 'TBD'
            except Exception:
                return 'TBD'
    winner_display.short_description = _('Winner')

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        """
        Restrict athlete selection to those within the selected category for red_corner, blue_corner, and winner.
        """
        if db_field.name in ['red_corner', 'blue_corner']:
            if hasattr(request, 'obj') and isinstance(request.obj, Match):
                kwargs['queryset'] = request.obj.category.athletes.all()
        elif db_field.name == 'winner':
            if hasattr(request, 'obj') and isinstance(request.obj, Match):
                kwargs['queryset'] = Athlete.objects.filter(pk__in=[request.obj.red_corner.pk, request.obj.blue_corner.pk])
        elif db_field.name == 'central_referee':
            # Prefer central referee choices from the match.referees if the match exists
            try:
                if hasattr(request, 'obj') and isinstance(request.obj, Match) and getattr(request.obj, 'pk', None):
                    kwargs['queryset'] = request.obj.referees.all()
                else:
                    kwargs['queryset'] = Athlete.objects.filter(is_referee=True)
            except Exception:
                kwargs['queryset'] = Athlete.objects.filter(is_referee=True)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                '<path:object_id>/add-central-penalty/',
                self.admin_site.admin_view(self.add_central_penalty_view),
                name='api_match_add_central_penalty',
            ),
            path(
                '<path:object_id>/recompute-results/',
                self.admin_site.admin_view(self.recompute_results_view),
                name='api_match_recompute_results',
            ),
        ]
        return custom_urls + urls

    def add_central_penalty_view(self, request, object_id, *args, **kwargs):
        """Admin view to create a central-referee penalty for the given match.

        The form pre-fills referee to the match.central_referee and requires side and points.
        """
        from django.shortcuts import get_object_or_404, redirect
        from .models import RefereePointEvent

        match = get_object_or_404(Match, pk=object_id)
        central = getattr(match, 'central_referee', None)

        if central is None:
            # For AJAX, return JSON error; for normal requests redirect back with a message
            if request.headers.get('x-requested-with') == 'XMLHttpRequest':
                return JsonResponse({'ok': False, 'error': 'No central referee set'}, status=400)
            messages.error(request, 'This match does not have a central referee set.')
            return redirect(reverse('admin:api_match_change', args=[object_id]))

        if request.method == 'POST':
            form = CentralPenaltyForm(request.POST)
            if form.is_valid():
                side = form.cleaned_data['side']
                points = form.cleaned_data['points']
                reason = form.cleaned_data.get('reason')

                # Create the penalty event attributed to the central referee
                ev = RefereePointEvent.objects.create(
                    match=match,
                    referee=central,
                    side=side,
                    points=points,
                    event_type='penalty',
                    created_by=request.user if request.user.is_authenticated else None,
                    metadata={'reason': reason} if reason else None,
                )
                # After creating the event, run a best-effort recompute (non-blocking)
                try:
                    from django.db import transaction
                    from .models import RefereeScore

                    with transaction.atomic():
                        # Recompute totals using all events for this match
                        events_all = list(RefereePointEvent.objects.filter(match=match).order_by('timestamp'))
                        per_ref = {}
                        central_penalties = {'red': 0, 'blue': 0}
                        central_id = getattr(match, 'central_referee_id', None)
                        for e in events_all:
                            rid = e.referee_id
                            if rid not in per_ref:
                                per_ref[rid] = {'red': 0, 'blue': 0}
                            per_ref[rid][e.side] = per_ref[rid].get(e.side, 0) + (e.points or 0)
                            if central_id and e.referee_id == central_id and e.event_type == 'penalty':
                                central_penalties[e.side] = central_penalties.get(e.side, 0) + (e.points or 0)

                        referee_scores = []
                        for rid, sums in per_ref.items():
                            red = sums.get('red', 0)
                            blue = sums.get('blue', 0)
                            adj_red = red - central_penalties.get('red', 0)
                            adj_blue = blue - central_penalties.get('blue', 0)
                            if adj_red > adj_blue:
                                winner = 'red'
                            elif adj_blue > adj_red:
                                winner = 'blue'
                            else:
                                winner = None
                            rs, _ = RefereeScore.objects.update_or_create(
                                match=match,
                                referee_id=rid,
                                defaults={'red_corner_score': red, 'blue_corner_score': blue, 'winner': winner}
                            )
                            referee_scores.append(rs)

                        # Determine match winner by majority votes
                        votes_red = sum(1 for r in referee_scores if r.winner == 'red')
                        votes_blue = sum(1 for r in referee_scores if r.winner == 'blue')
                        chosen_winner = None
                        if votes_red >= 3 and votes_red > votes_blue:
                            chosen_winner = match.red_corner
                        elif votes_blue >= 3 and votes_blue > votes_red:
                            chosen_winner = match.blue_corner
                        else:
                            total_red = sum(r.red_corner_score for r in referee_scores) - (central_penalties.get('red', 0) * len(referee_scores))
                            total_blue = sum(r.blue_corner_score for r in referee_scores) - (central_penalties.get('blue', 0) * len(referee_scores))
                            if total_red > total_blue:
                                chosen_winner = match.red_corner
                            elif total_blue > total_red:
                                chosen_winner = match.blue_corner
                            else:
                                chosen_winner = None

                        if match.winner != chosen_winner:
                            match.winner = chosen_winner
                            match.save()
                except Exception:
                    # Best-effort: don't crash the admin UI if recompute fails
                    pass

                # Build a compact match_winner summary for AJAX responses
                mv = None
                try:
                    if match.winner:
                        mv = {'id': match.winner.pk, 'name': f"{match.winner.first_name} {match.winner.last_name}"}
                except Exception:
                    mv = None

                # If this is an AJAX request, return JSON so client-side can update in-place
                if request.headers.get('x-requested-with') == 'XMLHttpRequest':
                    return JsonResponse({'ok': True, 'id': ev.pk, 'match_winner': mv})

                messages.success(request, f'Created central penalty (id={ev.pk}) for {central}.')
                return redirect(reverse('admin:api_match_change', args=[object_id]))
        else:
            form = CentralPenaltyForm(initial={'points': 1})

        context = dict(
            self.admin_site.each_context(request),
            title='Add central referee penalty',
            match=match,
            central_referee=central,
            form=form,
            opts=self.model._meta,
        )
        return render(request, 'admin/api/match/add_central_penalty.html', context)

    def save_formset(self, request, form, formset, change):
        """Handle saving of RefereeScore inline plus create/update per-round score events.

        We let Django save the inline instances first, then we translate any
        per-round form fields (red_round_X / blue_round_X) into RefereePointEvent
        rows of type 'score' so the shared aggregator can compute adjusted
        totals consistently in save_related.
        """
        # Let Django save the inlines first
        super().save_formset(request, form, formset, change)
        super().save_formset(request, form, formset, change)

        # If this was the RefereeScore inline, map per-round fields into score events
        from .models import RefereePointEvent
        if formset.model == RefereeScore:
            match = getattr(form, 'instance', None)
            if not match:
                return

            # Iterate through forms to read per-round inputs and persist score events
            for f in formset.forms:
                # Skip deleted forms
                try:
                    if f.cleaned_data.get('DELETE'):
                        continue
                except Exception:
                    # If cleaned_data isn't present (unlikely), skip
                    pass

                # Ensure the instance/referee exists
                inst = getattr(f, 'instance', None)
                if not inst or not getattr(inst, 'referee_id', None):
                    continue
                rid = inst.referee_id

                # For rounds 1..3, handle red and blue per-round scores
                # Use POST data as a robust source (fallback to cleaned_data) so
                # inline custom fields are persisted even if cleaned_data is
                # unexpectedly missing in some admin flows.
                for rd in (1, 2, 3):
                    # Red
                    field_name = f'red_round_{rd}'
                    val = None
                    try:
                        # Prefer explicit POST value using the form prefix
                        pref = getattr(f, 'prefix', None)
                        if pref:
                            raw = request.POST.get(f"{pref}-{field_name}")
                            if raw is not None and raw != '':
                                try:
                                    val = int(raw)
                                except Exception:
                                    val = raw
                        # Fallback to validated cleaned_data when available
                        if val is None and hasattr(f, 'cleaned_data'):
                            val = f.cleaned_data.get(field_name)
                    except Exception:
                        val = None
                    try:
                        existing_qs = RefereePointEvent.objects.filter(match=match, referee_id=rid, event_type='score', side='red')
                        # Try to filter by metadata.round when supported
                        try:
                            existing_qs = existing_qs.filter(metadata__round=rd)
                        except Exception:
                            # metadata lookup may not be supported; fall back to metadata__contains
                            try:
                                existing_qs = existing_qs.filter(metadata__contains={'round': rd})
                            except Exception:
                                pass
                    except Exception:
                        existing_qs = None

                    if val is None:
                        # delete any existing score events for this round
                        try:
                            if existing_qs is not None:
                                existing_qs.delete()
                        except Exception:
                            pass
                    else:
                        # replace existing events with the provided value
                        try:
                            if existing_qs is not None and existing_qs.exists():
                                existing_qs.delete()
                            RefereePointEvent.objects.create(
                                match=match,
                                referee_id=rid,
                                side='red',
                                points=int(val),
                                event_type='score',
                                metadata={'round': rd},
                                created_by=request.user if request.user.is_authenticated else None,
                            )
                        except Exception:
                            pass

                    # Blue
                    field_name_b = f'blue_round_{rd}'
                    valb = None
                    try:
                        if pref:
                            rawb = request.POST.get(f"{pref}-{field_name_b}")
                            if rawb is not None and rawb != '':
                                try:
                                    valb = int(rawb)
                                except Exception:
                                    valb = rawb
                        if valb is None and hasattr(f, 'cleaned_data'):
                            valb = f.cleaned_data.get(field_name_b)
                    except Exception:
                        valb = None
                    try:
                        existing_qs_b = RefereePointEvent.objects.filter(match=match, referee_id=rid, event_type='score', side='blue')
                        try:
                            existing_qs_b = existing_qs_b.filter(metadata__round=rd)
                        except Exception:
                            try:
                                existing_qs_b = existing_qs_b.filter(metadata__contains={'round': rd})
                            except Exception:
                                pass
                    except Exception:
                        existing_qs_b = None

                    if valb is None:
                        try:
                            if existing_qs_b is not None:
                                existing_qs_b.delete()
                        except Exception:
                            pass
                    else:
                        try:
                            if existing_qs_b is not None and existing_qs_b.exists():
                                existing_qs_b.delete()
                            RefereePointEvent.objects.create(
                                match=match,
                                referee_id=rid,
                                side='blue',
                                points=int(valb),
                                event_type='score',
                                metadata={'round': rd},
                                created_by=request.user if request.user.is_authenticated else None,
                            )
                        except Exception:
                            pass

            # After creating/deleting score events for this formset, run a local
            # recompute so that the inline winner fields reflect the new values
            # immediately after saving. This mirrors the authoritative recompute
            # done in save_related but gives faster feedback in the same save
            # operation (the full recompute still runs in save_related).
            try:
                from api.scoring import compute_match_results
                results = compute_match_results(match)
                for (rid, red, blue, winner) in results.get('referee_scores_data', []):
                    try:
                        existing = RefereeScore.objects.filter(match=match, referee_id=rid).first()
                        if existing and existing.winner:
                            RefereeScore.objects.update_or_create(
                                match=match,
                                referee_id=rid,
                                defaults={'red_corner_score': red, 'blue_corner_score': blue, 'winner': existing.winner}
                            )
                        else:
                            RefereeScore.objects.update_or_create(
                                match=match,
                                referee_id=rid,
                                defaults={'red_corner_score': red, 'blue_corner_score': blue, 'winner': winner}
                            )
                    except Exception:
                        try:
                            RefereeScore.objects.update_or_create(
                                match=match,
                                referee_id=rid,
                                defaults={'red_corner_score': red, 'blue_corner_score': blue, 'winner': winner}
                            )
                        except Exception:
                            pass
            except Exception:
                pass

    def save_related(self, request, form, formsets, change):
        """After all inlines are saved, run a single recompute to persist winners.

        This ensures that when admins save the match change form (including any
        combination of RefereeScore and RefereePointEvent inlines), the
        authoritative computation runs once using the fully persisted state,
        avoiding the need to save multiple times.
        """
        # First let Django save all related inlines as usual
        super().save_related(request, form, formsets, change)

        # Then run the shared helper and persist winners based on the saved DB state
        try:
            from .models import RefereePointEvent, RefereeScore
            from api.scoring import compute_match_results
            match = form.instance
            events_qs = RefereePointEvent.objects.filter(match=match)
            results = compute_match_results(match, events_qs)

            # Persist per-referee winners/scores. Do not overwrite an explicit
            # referee winner that was provided via the inline form: prefer the
            # existing stored winner if present.
            for (rid, red, blue, winner) in results.get('referee_scores_data', []):
                try:
                    existing = RefereeScore.objects.filter(match=match, referee_id=rid).first()
                    if existing and existing.winner:
                        # Preserve the explicitly set winner
                        RefereeScore.objects.update_or_create(
                            match=match,
                            referee_id=rid,
                            defaults={'red_corner_score': red, 'blue_corner_score': blue, 'winner': existing.winner}
                        )
                    else:
                        RefereeScore.objects.update_or_create(
                            match=match,
                            referee_id=rid,
                            defaults={'red_corner_score': red, 'blue_corner_score': blue, 'winner': winner}
                        )
                except Exception:
                    # Best-effort per-row persistence
                    try:
                        RefereeScore.objects.update_or_create(
                            match=match,
                            referee_id=rid,
                            defaults={'red_corner_score': red, 'blue_corner_score': blue, 'winner': winner}
                        )
                    except Exception:
                        pass

            # Persist match winner
            match_winner = results.get('match_winner')
            if match.winner != match_winner:
                match.winner = match_winner
                match.save()
        except Exception:
            # Best-effort: don't block saving if recompute fails
            pass

    def recompute_results_view(self, request, object_id, *args, **kwargs):
        """Admin AJAX view to recompute match results and persist winners.

        This can be triggered from the admin UI to sync stored winners without
        requiring the admin to save inlines. Returns JSON with a brief summary.
        """
        from django.shortcuts import get_object_or_404
        from django.views.decorators.http import require_POST
        from .models import RefereePointEvent, RefereeScore

        match = get_object_or_404(Match, pk=object_id)

        # Check permissions: only allow users who can change the match
        if not self.has_change_permission(request, match):
            return JsonResponse({'ok': False, 'error': 'Permission denied'}, status=403)

        # Only accept POST for side-effecting operation
        if request.method != 'POST':
            return JsonResponse({'ok': False, 'error': 'Invalid method'}, status=405)

        try:
            # Recompute using the shared helper and persist per-referee winners
            from api.scoring import compute_match_results
            events_qs = RefereePointEvent.objects.filter(match=match)
            results = compute_match_results(match, events_qs)

            persisted = []
            for (rid, red, blue, winner) in results.get('referee_scores_data', []):
                rs, _ = RefereeScore.objects.update_or_create(
                    match=match,
                    referee_id=rid,
                    defaults={'red_corner_score': red, 'blue_corner_score': blue, 'winner': winner}
                )
                persisted.append({'referee_id': rid, 'winner': winner})

            # Persist match winner
            match_winner = results.get('match_winner')
            if match.winner != match_winner:
                match.winner = match_winner
                match.save()

            # Return a compact summary for the admin UI to render
            mv = None
            if match.winner:
                mv = {'id': match.winner.pk, 'name': f"{match.winner.first_name} {match.winner.last_name}"}

            return JsonResponse({'ok': True, 'match_winner': mv, 'per_ref': persisted})
        except Exception as exc:
            return JsonResponse({'ok': False, 'error': str(exc)}, status=500)

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
        ('Basic Information', {
            'fields': ('name', 'event')
        }),
        ('Age Range', {
            'fields': ('birth_year_start', 'birth_year_end'),
            'description': 'Define the birth year range for athletes in this group (e.g., 2015-2018)'
        }),
    )
    
    def get_age_range(self, obj):
        """Display the age range for this group"""
        if obj.birth_year_start and obj.birth_year_end:
            return f"{obj.birth_year_start} - {obj.birth_year_end}"
        elif obj.birth_year_start:
            return f"{obj.birth_year_start}+"
        elif obj.birth_year_end:
            return f"up to {obj.birth_year_end}"
        return "Not set"
    get_age_range.short_description = 'Birth Year Range'
    
    def get_category_count(self, obj):
        """Display number of categories in this group"""
        count = obj.categories.count()
        return f"{count} categories"
    get_category_count.short_description = 'Categories'


# User Admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, UserProxy

@admin.register(UserProxy)
class UserAdmin(BaseUserAdmin):
    """Custom User admin with role management."""
    list_display = ('email', 'first_name', 'last_name', 'role', 'is_active', 'date_joined')
    list_filter = ('role', 'is_active', 'is_staff', 'is_superuser', 'date_joined')
    search_fields = ('email', 'first_name', 'last_name', 'username')
    ordering = ('-date_joined',)
    
    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Personal info', {'fields': ('first_name', 'last_name', 'email')}),
        ('Role & Permissions', {'fields': ('role', 'is_active', 'is_staff', 'is_superuser')}),
        ('Groups & Permissions', {'fields': ('groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )
    
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'email', 'first_name', 'last_name', 'password1', 'password2', 'role'),
        }),
    )


# Athlete Profile Management Admin
@admin.register(Athlete)
class AthleteAdmin(admin.ModelAdmin):
    # Merge photo and name into a single narrow column (no header label).
    # Also show referee/coach flags, compact grade name, club, and action buttons on the far right.
    list_display = [
        'photo_and_name', 'status', 'is_referee', 'is_coach', 'grade_display', 'club', 'get_action_buttons'
    ]
    list_filter = ['status', 'current_grade', 'club', 'city', 'is_coach', 'is_referee', 'submitted_date', 'reviewed_date']
    autocomplete_fields = ('club', 'city', 'current_grade', 'federation_role', 'title')
    search_fields = ['first_name', 'last_name', 'user__email', 'user__username', 'current_grade__name', 'club__name', 'city__name']
    readonly_fields = ['submitted_date', 'reviewed_date', 'current_grade', 'add_enrolled_event_link', 'add_grade_history_link']
    ordering = ['-submitted_date']
    inlines = [
        GradeHistoryInline,
    VisaInline,
        AthleteTrainingSeminarParticipationInline,
        AthleteSoloResultsInline,
        AthleteFightResultsInline,
        AthleteTeamResultsInline,
        # Team results displayed via custom method in fieldsets instead of inline
        # (team results are now shown via AthleteTeamResultsInline)
    ]
    
    fieldsets = (
        ('Personal Information', {
            'fields': ('user', 'first_name', 'last_name', 'date_of_birth', 'address', 'mobile_number', 'profile_image')
        }),
        ('Sports & Club Information', {
            'fields': ('club', 'city', 'current_grade', 'federation_role', 'title', 'registered_date', 'expiration_date', 'is_coach', 'is_referee')
        }),
        ('Emergency Contact', {
            'fields': ('emergency_contact_name', 'emergency_contact_phone')
        }),
        # Team results are shown via the AthleteTeamResultsInline instead of a custom field
        ('Approval Workflow', {
            'fields': ('status', 'submitted_date', 'reviewed_date', 'reviewed_by', 'add_enrolled_event_link', 'add_grade_history_link')
        }),
    )
    
    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}"
    get_full_name.short_description = _('Name')
    get_full_name.admin_order_field = 'first_name'

    def photo_and_name(self, obj):
        """Render a small photo (or initials SVG) next to the athlete name.

        The column intentionally has an empty header (short_description='') so
        the table header remains compact and the photo doesn't add an extra
        labelled column.
        """
        try:
            url = reverse('admin:api_athlete_change', args=(obj.pk,))
        except Exception:
            url = '#'

        # Determine if the profile_image is the default placeholder
        img_html = ''
        try:
            img_name = getattr(obj.profile_image, 'name', '') or ''
            is_default = img_name.endswith('default.png') or img_name.endswith('/default.png')
            if obj.profile_image and hasattr(obj.profile_image, 'url') and not is_default:
                img_html = format_html(
                    '<img src="{}" style="width:28px; height:28px; object-fit:cover; border-radius:4px; margin-right:8px; vertical-align:middle;" />',
                    obj.profile_image.url
                )
            else:
                # Render initials SVG inline
                fn = (obj.first_name or '').strip()
                ln = (obj.last_name or '').strip()
                initials = ''
                if fn and ln:
                    initials = (fn[0] + ln[0]).upper()
                elif fn:
                    initials = fn[0].upper()
                elif ln:
                    initials = ln[0].upper()
                svg = (
                    '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" '
                    'style="width:28px; height:28px; display:inline-block; vertical-align:middle; border-radius:4px; overflow:hidden; margin-right:8px;">'
                    '<rect width="100%" height="100%" fill="#e0e0e0" rx="4"/>'
                    '<text x="50%" y="50%" dy="0.35em" text-anchor="middle" '
                    'font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" '
                    'font-size="12" fill="#424242">'
                    f'{initials}'
                    '</text>'
                    '</svg>'
                )
                img_html = mark_safe(svg)
        except Exception:
            img_html = mark_safe('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" style="width:28px; height:28px; display:inline-block; vertical-align:middle; border-radius:4px; overflow:hidden; margin-right:8px;"></svg>')

        name_html = format_html('<span style="vertical-align:middle">{}</span>', f"{obj.first_name} {obj.last_name}")
        return format_html('<a href="{}" style="display:inline-flex; align-items:center;">{} {}</a>', url, img_html, name_html)
    photo_and_name.short_description = ''
    photo_and_name.admin_order_field = 'first_name'

    def grade_display(self, obj):
        """Show only the grade name (avoid verbose Grade.__str__ with Rank/Type)."""
        try:
            return obj.current_grade.name if obj.current_grade else ''
        except Exception:
            return ''
    grade_display.short_description = 'Grade'
    # Order by the underlying grade rank if available
    grade_display.admin_order_field = 'current_grade__rank_order'

    def profile_image_thumbnail(self, obj):
        try:
            if obj.profile_image and hasattr(obj.profile_image, 'url'):
                return format_html('<img src="{}" style="width:40px; height:40px; object-fit:cover; border-radius:20%" />', obj.profile_image.url)
        except Exception:
            pass
        # Render a small inline SVG avatar with initials (computed from first/last name)
        try:
            fn = (obj.first_name or '').strip()
            ln = (obj.last_name or '').strip()
            initials = ''
            if fn and ln:
                initials = (fn[0] + ln[0]).upper()
            elif fn:
                initials = fn[0].upper()
            elif ln:
                initials = ln[0].upper()
            else:
                initials = ''
            # Keep SVG small and legible for 40x40 thumb
            svg = (
                '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">'
                '<rect width="100%" height="100%" fill="#e0e0e0" rx="6"/>'
                '<text x="50%" y="50%" dy="0.35em" text-anchor="middle" '
                'font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" '
                'font-size="14" fill="#616161">'
                f'{initials}'
                '</text>'
                '</svg>'
            )
        except Exception:
            svg = (
                '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">'
                '<rect width="100%" height="100%" fill="#e0e0e0" rx="6"/>'
                '</svg>'
            )
        # Embed the SVG directly into the HTML instead of using a data: URI.
        # Some environments or CSP rules may block data: URIs; inline SVG avoids that.
        try:
            svg_el = svg.replace('<svg ', '<svg style="width:40px; height:40px; display:block; border-radius:6px; overflow:hidden;" ')
            return mark_safe(svg_el)
        except Exception:
            # Fallback to a plain gray rectangle if something unexpected happens
            fallback = (
                '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" '
                'style="width:40px; height:40px; display:block; border-radius:6px; overflow:hidden;"'>
                '<rect width="100%" height="100%" fill="#e0e0e0" rx="6"/>'
                '</svg>'
            )
            return mark_safe(fallback)
    profile_image_thumbnail.short_description = _('Photo')
    profile_image_thumbnail.allow_tags = True
    
    def user_email(self, obj):
        return obj.user.email if obj.user else 'No user'
    user_email.short_description = _('Email')
    user_email.admin_order_field = 'user__email'
    
    def get_action_buttons(self, obj):
        if obj.status == 'pending':
            approve_url = reverse('admin:api_athlete_approve', args=(obj.pk,))
            reject_url = reverse('admin:api_athlete_reject', args=(obj.pk,))
            revision_url = reverse('admin:api_athlete_request_revision', args=(obj.pk,))
            return format_html(
                '<a class="button" href="{}">{}</a> '
                '<a class="button" href="{}">{}</a> '
                '<a class="button" href="{}">{}</a>',
                approve_url, _('Approve'), reject_url, _('Reject'), revision_url, _('Request Revision')
            )
        return obj.get_status_display()
    get_action_buttons.short_description = _('Actions')
    
    # Team results are now displayed via AthleteTeamResultsInline above.

    def get_search_results(self, request, queryset, search_term):
        """
        Override search results so that when the admin autocomplete is used from
        GradeHistory (examiner_1/examiner_2) we only return athletes who are coaches.

        Detection strategy:
        - Prefer explicit 'field' GET param (admin autocomplete sends it), or
        - Fallback to checking HTTP_REFERER for the GradeHistory admin URL.
        """
        referer = request.META.get('HTTP_REFERER', '')
        field = request.GET.get('field') or request.GET.get('name')
        # If autocomplete is being called for examiner_1/examiner_2 (or referer points to GradeHistory), restrict to coaches
        if field in ('examiner_1', 'examiner_2') or 'admin/api/gradehistory' in referer.lower():
            queryset = queryset.filter(is_coach=True)
        return super().get_search_results(request, queryset, search_term)

    def save_model(self, request, obj, form, change):
        """
        Override save_model to update current_grade after saving the athlete.
        """
        super().save_model(request, obj, form, change)
        obj.update_current_grade()  # Automatically update current_grade
    
    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path('<int:pk>/approve/', self.admin_site.admin_view(self.approve_profile), name='api_athlete_approve'),
            path('<int:pk>/reject/', self.admin_site.admin_view(self.reject_profile), name='api_athlete_reject'),
            path('<int:pk>/request_revision/', self.admin_site.admin_view(self.request_revision), name='api_athlete_request_revision'),
            path('import-excel/', self.admin_site.admin_view(self.import_excel), name='api_athlete_import_excel'),
            path('download-excel-template/', self.admin_site.admin_view(self.download_excel_template), name='api_athlete_download_template'),
        ]
        return custom_urls + urls
    
    def download_excel_template(self, request):
        """Download Excel template for athlete import."""
        from django.http import HttpResponse
        from .excel_sync import ExcelTemplateGenerator
        
        wb = ExcelTemplateGenerator.create_athlete_template()
        
        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = 'attachment; filename=athlete_import_template.xlsx'
        wb.save(response)
        return response
    
    def import_excel(self, request):
        """Import athletes from Excel file with dry run option."""
        from django.http import HttpResponse
        from .excel_sync import ExcelImportService
        
        if request.method == 'POST':
            excel_file = request.FILES.get('excel_file')
            dry_run = request.POST.get('dry_run') == 'true'
            
            if not excel_file:
                messages.error(request, 'Please select an Excel file to upload.')
                return render(request, 'admin/athlete_import_excel.html', {
                    'title': 'Import Athletes from Excel',
                })
            
            try:
                service = ExcelImportService()
                result = service.import_athletes(excel_file, dry_run=dry_run)
                
                if dry_run:
                    messages.info(request, f"Validation Complete (No data saved):")
                    messages.success(request, f"✓ {result['created']} athletes ready to create")
                    messages.success(request, f"✓ {result['updated']} athletes ready to update")
                    if result['errors']:
                        messages.warning(request, f"⚠ {len(result['errors'])} errors found")
                        for error in result['errors'][:10]:  # Show first 10 errors
                            messages.error(request, f"Row {error.get('row', '?')}: {error.get('error', 'Unknown error')}")
                else:
                    messages.success(request, f"Import Complete!")
                    messages.success(request, f"✓ Created {result['created']} new athletes")
                    messages.success(request, f"✓ Updated {result['updated']} existing athletes")
                    if result['errors']:
                        messages.warning(request, f"⚠ {len(result['errors'])} rows had errors")
                        for error in result['errors'][:10]:
                            messages.error(request, f"Row {error.get('row', '?')}: {error.get('error', 'Unknown error')}")
                
                # Show detailed results
                context = {
                    'title': 'Import Results',
                    'result': result,
                    'dry_run': dry_run,
                }
                return render(request, 'admin/athlete_import_results.html', context)
                
            except Exception as e:
                messages.error(request, f'Import failed: {str(e)}')
                return render(request, 'admin/athlete_import_excel.html', {
                    'title': 'Import Athletes from Excel',
                })
        
        # GET request - show upload form
        return render(request, 'admin/athlete_import_excel.html', {
            'title': 'Import Athletes from Excel',
        })

    def add_enrolled_event_link(self, obj):
        """Render a button that opens the TrainingSeminarParticipation add form with this athlete pre-filled."""
        if not obj or not obj.pk:
            return ''
        try:
            url = reverse('admin:api_trainingseminarparticipation_add') + f'?athlete={obj.pk}'
            return format_html('<a class="button" href="{}">Add enrolled event</a>', url)
        except Exception:
            return ''
    add_enrolled_event_link.short_description = _('Add Enrollment')

    def add_grade_history_link(self, obj):
        """Render a button that opens the GradeHistory add form with this athlete pre-filled."""
        if not obj or not obj.pk:
            return ''
        try:
            url = reverse('admin:api_gradehistory_add') + f'?athlete={obj.pk}'
            return format_html('<a class="button" href="{}">Add grade history</a>', url)
        except Exception:
            return ''
    add_grade_history_link.short_description = _('Add Grade')
    
    def approve_profile(self, request, pk):
        from django.shortcuts import get_object_or_404, redirect
        from django.contrib import messages
        from django.utils import timezone
        
        athlete = get_object_or_404(Athlete, pk=pk)
        
        if athlete.status != 'pending':
            messages.error(request, f'Athlete profile is not in pending status (current: {athlete.status})')
            return redirect('admin:api_athlete_changelist')
        
        try:
            # Use the approve method from the consolidated model
            athlete.approve(request.user)
            
            messages.success(request, f'Successfully approved athlete profile for {athlete.first_name} {athlete.last_name}')
            
        except Exception as e:
            messages.error(request, f'Error approving athlete profile: {str(e)}')
        
        return redirect('admin:api_athlete_changelist')
    
    def reject_profile(self, request, pk):
        from django.shortcuts import get_object_or_404, redirect
        from django.contrib import messages
        from django.utils import timezone
        
        athlete = get_object_or_404(Athlete, pk=pk)
        
        if athlete.status != 'pending':
            messages.error(request, f'Athlete profile is not in pending status (current: {athlete.status})')
            return redirect('admin:api_athlete_changelist')
        
        if request.method == 'POST':
            rejection_reason = request.POST.get('admin_notes', '')
            
            # Use the reject method from the consolidated model
            athlete.reject(request.user, rejection_reason)
            
            messages.success(request, f'Successfully rejected athlete profile for {athlete.first_name} {athlete.last_name}')
            return redirect('admin:api_athlete_changelist')
        
        # Show rejection form
        context = {
            'profile': athlete,
            'title': f'Reject Profile: {athlete.first_name} {athlete.last_name}',
        }
        return render(request, 'admin/reject_profile.html', context)
    
    def request_revision(self, request, pk):
        from django.shortcuts import get_object_or_404, redirect
        from django.contrib import messages
        from django.utils import timezone
        
        athlete = get_object_or_404(Athlete, pk=pk)
        
        if athlete.status != 'pending':
            messages.error(request, f'Athlete profile is not in pending status (current: {athlete.status})')
            return redirect('admin:api_athlete_changelist')
        
        if request.method == 'POST':
            revision_notes = request.POST.get('admin_notes', '')
            
            # Use the request_revision method from the consolidated model
            athlete.request_revision(request.user, revision_notes)
            
            messages.success(request, f'Successfully requested revision for {athlete.first_name} {athlete.last_name}')
            return redirect('admin:api_athlete_changelist')
        
        # Show revision request form
        context = {
            'profile': athlete,
            'title': f'Request Revision: {athlete.first_name} {athlete.last_name}',
        }
        return render(request, 'admin/request_revision.html', context)


# Enhanced CategoryAthleteScore admin with approval workflow
class CategoryRefereeScoreInline(admin.TabularInline):
    """Inline for managing individual referee scores for solo/team categories"""
    model = CategoryRefereeScore
    extra = 0
    max_num = 5  # Exactly 5 referees should score
    fields = ('referee', 'score', 'notes', 'submitted_date')
    readonly_fields = ('submitted_date',)
    autocomplete_fields = ['referee']
    verbose_name = _('Referee Score')
    verbose_name_plural = _('Referee Scores (5 Required)')
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('referee')
    
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        """Filter referee dropdown to show only approved athletes with is_referee=True"""
        if db_field.name == "referee":
            kwargs["queryset"] = Athlete.objects.filter(is_referee=True, status='approved')
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


class CategoryAthleteScoreAdminForm(forms.ModelForm):
    """Custom form for CategoryAthleteScore to allow selecting existing teams"""
    
    existing_team = forms.ModelChoiceField(
        queryset=None,
        required=False,
        label='Team',
        help_text='Select an existing team for team categories'
    )
    
    class Meta:
        model = CategoryAthleteScore
        fields = '__all__'
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from .models import Team
        
        # Populate existing teams
        self.fields['existing_team'].queryset = Team.objects.all().order_by('id')
        
        # Make athlete optional (for team scores)
        self.fields['athlete'].required = False
        self.fields['athlete'].help_text = 'Select athlete for solo/fight categories. Leave blank for team scores.'
        
        # Hide team_name and team_members fields (they'll be auto-populated)
        if 'team_name' in self.fields:
            self.fields['team_name'].widget = forms.HiddenInput()
        if 'team_members' in self.fields:
            self.fields['team_members'].widget = forms.HiddenInput()
    
    def clean(self):
        cleaned_data = super().clean()
        score_type = cleaned_data.get('type')
        athlete = cleaned_data.get('athlete')
        existing_team = cleaned_data.get('existing_team')
        
        # Validate based on type
        if score_type == 'teams':
            if not existing_team:
                raise forms.ValidationError('For team scores, you must select a team.')
        elif score_type in ['solo', 'fight']:
            if not athlete:
                raise forms.ValidationError(f'For {score_type} categories, you must select an athlete.')
        
        # If existing team is selected, populate team_members and team_name
        if existing_team:
            cleaned_data['team_members'] = list(existing_team.members.all())
            # Auto-generate team name from members
            member_names = [f"{m.athlete.first_name} {m.athlete.last_name}" for m in existing_team.members.all()[:3]]
            if member_names:
                auto_name = ', '.join(member_names)
                if existing_team.members.count() > 3:
                    auto_name += f" (+{existing_team.members.count() - 3} more)"
                cleaned_data['team_name'] = auto_name
        
        return cleaned_data


@admin.register(CategoryAthleteScore)
class CategoryAthleteScoreAdmin(admin.ModelAdmin):
    form = CategoryAthleteScoreAdminForm
    list_display = [
        'get_athlete_name', 'get_competition_name', 'get_category_name', 'get_submission_type', 
        'type', 'group', 'placement_claimed', 'get_calculated_score', 'status', 'submitted_date', 'get_action_buttons'
    ]
    list_filter = ['status', 'type', 'group', 'submitted_by_athlete', 'submitted_date', 'category__event__start_date']
    search_fields = [
    'athlete__first_name', 'athlete__last_name', 'category__name', 'category__event__title',
        'team_members__first_name', 'team_members__last_name', 'team_name'
    ]
    readonly_fields = ['submitted_date', 'reviewed_date', 'get_calculated_score_display', 'get_referee_count']
    ordering = ['-submitted_date']
    inlines = [CategoryRefereeScoreInline, AthletePerformanceVideoInline]
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('category', 'type', 'group', 'submitted_by_athlete')
        }),
        ('Select Participant', {
            'fields': ('athlete', 'existing_team'),
            'description': 'For solo/fight: select athlete. For teams: select existing team (create teams via Team admin)',
        }),
        ('Referee Scoring', {
            'fields': ('get_calculated_score_display', 'get_referee_count'),
            'description': 'Add referee scores in the inline section below. Final score excludes highest and lowest.',
        }),
        ('Athlete Submission Details', {
            'fields': ('placement_claimed', 'notes', 'certificate_image', 'result_document'),
            'description': 'Used when athletes submit their own results with placement claims',
            'classes': ('collapse',)
        }),
        ('Approval Status', {
            'fields': ('status', 'submitted_date', 'reviewed_date', 'reviewed_by', 'admin_notes')
        }),
    )
    
    def get_queryset(self, request):
        # Show athlete-submitted results first, include team members
        return super().get_queryset(request).select_related('athlete', 'category__event', 'reviewed_by').prefetch_related('team_members')
    
    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        
        # If this is an athlete submission, make score field optional and add help text
        if obj and obj.submitted_by_athlete:
            if 'score' in form.base_fields:
                form.base_fields['score'].required = False
                form.base_fields['score'].help_text = 'Score not required for athlete self-submissions - focus on placement_claimed instead'
        
        return form
    
    def get_athlete_name(self, obj):
        """Display athlete name or team name"""
        if obj.team_name and obj.team_members.exists():
            member_count = obj.team_members.count()
            return f"Team: {obj.team_name} ({member_count} members)" if member_count > 0 else f"Team: {obj.team_name}"
        elif obj.athlete:
            return f"{obj.athlete.first_name} {obj.athlete.last_name}"
        return "N/A"
    get_athlete_name.short_description = _('Athlete / Team')
    get_athlete_name.admin_order_field = 'athlete__first_name'
    
    def get_competition_name(self, obj):
        if obj.category and obj.category.event:
            return obj.category.event.title
        return "N/A"
    get_competition_name.short_description = _('Event')
    # Keep admin ordering keyed to the legacy competition name for now; Event ordering could be added later
    get_competition_name.admin_order_field = 'category__competition__name'
    
    def get_category_name(self, obj):
        return obj.category.name
    get_category_name.short_description = _('Category')
    get_category_name.admin_order_field = 'category__name'
    
    def get_submission_type(self, obj):
        if obj.submitted_by_athlete:
            return f"ðŸ… Self-Submitted ({obj.placement_claimed or 'No placement'})"
        else:
            return f"ðŸ¥‹ Referee Score ({obj.score})"
    get_submission_type.short_description = _('Type')
    
    def get_calculated_score(self, obj):
        """Display calculated score in list view"""
        from .models import FightCategory
        if isinstance(obj.category, FightCategory):
            return f'⚠ {obj.referee_score_count}/5 scores'
        score = obj.calculated_score
        if score is None:
            return 'N/A'
        return f'✓ {score:.2f}'
    get_calculated_score.short_description = _('Final Score')

    
    def get_calculated_score_display(self, obj):
        """Display calculated score with details in change form"""
        from .models import FightCategory
        if isinstance(obj.category, FightCategory):
            return format_html('<em>Not applicable (only for solo/team categories)</em>')
        
        score = obj.calculated_score
        count = obj.referee_score_count
        
        if score is None:
            if count == 0:
                return format_html('<strong style="color: red;">No referee scores submitted yet</strong>')
            else:
                return format_html(
                    '<strong style="color: orange;">Incomplete: {}/{} referee scores submitted</strong><br>'
                    '<em>Need at least 3 scores to calculate (ideally 5)</em>',
                    count, 5
                )
        
        # Get all scores to show breakdown
        scores = list(obj.referee_scores.values_list('score', flat=True))
        sorted_scores = sorted(scores)
        
        if len(scores) >= 5:
            excluded = [sorted_scores[0], sorted_scores[-1]]
            breakdown = f'Scores: {", ".join(str(s) for s in sorted_scores)} | Excluded: {excluded[0]}, {excluded[1]}'
        elif len(scores) == 4:
            excluded = [sorted_scores[-1]]
            breakdown = f'Scores: {", ".join(str(s) for s in sorted_scores)} | Excluded highest: {excluded[0]}'
        else:
            breakdown = f'Scores: {", ".join(str(s) for s in sorted_scores)} | All counted (need 5 for proper calculation)'
        
        return format_html(
            '<strong style="font-size: 16px;">Final Score: {:.2f}</strong><br>'
            '<em style="color: #666;">{}</em>',
            score, breakdown
        )
    get_calculated_score_display.short_description = _('Calculated Final Score')
    
    def get_referee_count(self, obj):
        """Display referee score count with validation status"""
        from .models import FightCategory
        if isinstance(obj.category, FightCategory):
            return format_html('<em>N/A</em>')
        
        count = obj.referee_score_count
        if count == 5:
            return format_html('<strong style="color: green;">âœ“ Complete ({}/5)</strong>', count)
        elif count >= 3:
            return format_html('<strong style="color: orange;">âš  Partial ({}/5)</strong>', count)
        else:
            return format_html('<strong style="color: red;">âœ— Incomplete ({}/5)</strong>', count)
    get_referee_count.short_description = _('Referee Scores')
    
    def get_action_buttons(self, obj):
        if obj.submitted_by_athlete and obj.status == 'pending':
            return format_html(
                '<a class="button" href="{}/approve/">Approve</a> '
                '<a class="button" href="{}/reject/">Reject</a> '
                '<a class="button" href="{}/request_revision/">Request Revision</a>',
                obj.pk, obj.pk, obj.pk
            )
        elif obj.status == 'approved':
            return format_html('<span style="color: green;">âœ“ Approved</span>')
        elif obj.status == 'rejected':
            return format_html('<span style="color: red;">âœ— Rejected</span>')
        elif obj.status == 'revision_required':
            return format_html('<span style="color: orange;">âš  Revision Required</span>')
        elif not obj.submitted_by_athlete:
            return format_html('<span style="color: blue;">Referee Entry</span>')
        return ''
    get_action_buttons.short_description = _('Actions')
    
    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path('<int:pk>/approve/', self.admin_site.admin_view(self.approve_score), name='api_categoryathletescore_approve'),
            path('<int:pk>/reject/', self.admin_site.admin_view(self.reject_score), name='api_categoryathletescore_reject'),
            path('<int:pk>/request_revision/', self.admin_site.admin_view(self.request_revision), name='api_categoryathletescore_request_revision'),
        ]
        return custom_urls + urls
    
    def approve_score(self, request, pk):
        from django.shortcuts import get_object_or_404, redirect
        from django.contrib import messages
        
        score = get_object_or_404(CategoryAthleteScore, pk=pk)
        
        if score.status != 'pending':
            messages.error(request, f'Score is not in pending status (current: {score.status})')
            return redirect('admin:api_categoryathletescore_changelist')
        
        try:
            score.approve(request.user)
            messages.success(request, f'Successfully approved result for {score.athlete}')
        except Exception as e:
            messages.error(request, f'Error approving result: {str(e)}')
        
        return redirect('admin:api_categoryathletescore_changelist')
    
    def reject_score(self, request, pk):
        from django.shortcuts import get_object_or_404, redirect
        from django.contrib import messages
        
        score = get_object_or_404(CategoryAthleteScore, pk=pk)
        
        if score.status != 'pending':
            messages.error(request, f'Score is not in pending status (current: {score.status})')
            return redirect('admin:api_categoryathletescore_changelist')
        
        if request.method == 'POST':
            rejection_reason = request.POST.get('admin_notes', '')
            score.reject(request.user, rejection_reason)
            messages.success(request, f'Successfully rejected result for {score.athlete}')
            return redirect('admin:api_categoryathletescore_changelist')
        
        # Show rejection form
        context = {
            'score': score,
            'title': f'Reject Result: {score.category.name} - {score.athlete}',
        }
        return render(request, 'admin/reject_score.html', context)
    
    def request_revision(self, request, pk):
        from django.shortcuts import get_object_or_404, redirect
        from django.contrib import messages
        
        score = get_object_or_404(CategoryAthleteScore, pk=pk)
        
        if score.status != 'pending':
            messages.error(request, f'Score is not in pending status (current: {score.status})')
            return redirect('admin:api_categoryathletescore_changelist')
        
        if request.method == 'POST':
            revision_notes = request.POST.get('admin_notes', '')
            score.request_revision(request.user, revision_notes)
            messages.success(request, f'Successfully requested revision for {score.athlete}')
            return redirect('admin:api_categoryathletescore_changelist')
        
        # Show revision request form
        context = {
            'score': score,
            'title': f'Request Revision: {score.category.name} - {score.athlete}',
        }
        return render(request, 'admin/request_score_revision.html', context)


# Hide CategoryAthleteScore from admin for now
try:
    admin.site.unregister(CategoryAthleteScore)
except admin.sites.NotRegistered:
    pass


# ============================================================================
# Note: CategoryAthleteScore already registered above with @admin.register
# Removed duplicate admin.site.register to avoid conflicts
# ============================================================================


@admin.register(SupporterAthleteRelation)
class SupporterAthleteRelationAdmin(admin.ModelAdmin):
    list_display = ['supporter', 'athlete', 'relationship', 'can_edit', 'can_register_competitions', 'created']
    list_filter = ['relationship', 'can_edit', 'can_register_competitions', 'created']
    search_fields = ['supporter__username', 'supporter__email', 'athlete__first_name', 'athlete__last_name']
    ordering = ['-created']


# ============================================================================
# SCORING SUMMARY:
# - CategoryAthleteScoreAdmin: Main results (registered above with @admin.register)
# - CategoryRefereeScoreInline: 5 referee scores (inline in CategoryAthleteScoreAdmin)
#
# Removed: ScoreHistoryProxy, duplicate admin registrations, complex forms, activity logs
# ============================================================================


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
        ('VIDEO SOURCE', {
            'fields': ('match', 'video_file', 'video_url'),
            'description': 'Provide either a video file OR a video URL (YouTube, Vimeo, etc.)'
        }),
        ('METADATA', {
            'fields': ('recorded_at', 'duration_seconds', 'is_public'),
        }),
    ]
    
    def match_display(self, obj):
        """Display match name"""
        return obj.match.name
    match_display.short_description = 'Match'
    match_display.admin_order_field = 'match__name'
    
    def duration_display(self, obj):
        """Display duration in human-readable format"""
        if obj.duration_seconds:
            minutes = obj.duration_seconds // 60
            seconds = obj.duration_seconds % 60
            return f"{minutes}m {seconds}s"
        return '-'
    duration_display.short_description = 'Duration'

    def category_display(self, obj):
        """Display category name"""
        return obj.match.category.name if obj.match.category else 'No Category'
    category_display.short_description = 'Category'
    category_display.admin_order_field = 'match__category__name'

    def group_display(self, obj):
        """Display category group"""
        if obj.match.category and obj.match.category.group:
            return obj.match.category.group.name
        return 'No Group'
    group_display.short_description = 'Group'
    group_display.admin_order_field = 'match__category__group__name'

    def competition_display(self, obj):
        """Display competition/event title"""
        if obj.match.category and obj.match.category.event:
            return obj.match.category.event.title
        return 'No Competition'
    competition_display.short_description = 'Competition'
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
        ('SOLO CATEGORY', {
            'fields': ('athlete_score',),
        }),
        ('VIDEO SOURCE', {
            'fields': ('video_file', 'video_url'),
            'description': 'Provide either a video file OR a video URL (YouTube, Vimeo, etc.)'
        }),
        ('METADATA', {
            'fields': ('recorded_at', 'duration_seconds', 'is_public'),
        }),
    ]
    
    def athlete_display(self, obj):
        """Display athlete name"""
        athlete = obj.athlete_score.athlete
        return f"{athlete.first_name} {athlete.last_name}"
    athlete_display.short_description = 'Athlete'
    
    def category_display(self, obj):
        """Display category name"""
        return obj.athlete_score.category.name
    category_display.short_description = 'Category'
    category_display.admin_order_field = 'athlete_score__category__name'

    def group_display(self, obj):
        """Display category group"""
        group = obj.athlete_score.category.group
        return group.name if group else 'No Group'
    group_display.short_description = 'Group'
    group_display.admin_order_field = 'athlete_score__category__group__name'

    def competition_display(self, obj):
        """Display competition/event title"""
        event = obj.athlete_score.category.event
        return event.title if event else 'No Competition'
    competition_display.short_description = 'Competition'
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
        ('TEAM & CATEGORY', {
            'fields': ('category_team',),
        }),
        ('VIDEO SOURCE', {
            'fields': ('video_file', 'video_url'),
            'description': 'Provide either a video file OR a video URL (YouTube, Vimeo, etc.)'
        }),
        ('METADATA', {
            'fields': ('recorded_at', 'duration_seconds', 'is_public'),
        }),
    ]
    
    def team_display(self, obj):
        """Display team name"""
        return obj.category_team.team.name
    team_display.short_description = 'Team'
    
    def category_display(self, obj):
        """Display category name"""
        return obj.category_team.category.name
    category_display.short_description = 'Category'
    category_display.admin_order_field = 'category_team__category__name'

    def group_display(self, obj):
        """Display category group"""
        group = obj.category_team.category.group
        return group.name if group else 'No Group'
    group_display.short_description = 'Group'
    group_display.admin_order_field = 'category_team__category__group__name'

    def competition_display(self, obj):
        """Display competition/event title"""
        event = obj.category_team.category.event
        return event.title if event else 'No Competition'
    competition_display.short_description = 'Competition'
    competition_display.admin_order_field = 'category_team__category__event__title'


# @admin.register(CategoryTeam)  # Disabled - manage teams via TeamCategory admin inline
class CategoryTeamAdmin(admin.ModelAdmin):
    """Admin for managing individual team enrollments in team categories"""
    list_display = ('team_display', 'category_display', 'place', 'total_score_display', 'disqualified')
    list_filter = ('category__event', 'place', 'disqualified')
    search_fields = ('team__members__athlete__first_name', 'team__members__athlete__last_name', 'category__name', 'category__event__title')
    autocomplete_fields = ['team']
    readonly_fields = ('total_score_display', 'ref1_score', 'ref2_score', 'ref3_score', 'ref4_score', 'ref5_score')
    inlines = [TeamPerformanceVideoInline]
    
    fieldsets = [
        ('TEAM & CATEGORY', {
            'fields': ('team', 'category'),
        }),
        ('RESULTS', {
            'fields': ('place', 'disqualified'),
            'description': 'Note: Scoring is managed in the Team Category admin page where referee assignments are visible.'
        }),
        ('SCORES (READ-ONLY)', {
            'fields': ('ref1_score', 'ref2_score', 'ref3_score', 'ref4_score', 'ref5_score', 'total_score_display'),
            'classes': ('collapse',),
            'description': 'View-only scores. To edit scores, go to the Team Category page.'
        }),
    ]
    
    def team_display(self, obj):
        """Display team name"""
        return obj.team.name
    team_display.short_description = 'Team'
    team_display.admin_order_field = 'team__name'
    
    def category_display(self, obj):
        """Display category name"""
        return obj.category.name
    category_display.short_description = 'Category'
    category_display.admin_order_field = 'category__name'
    
    def total_score_display(self, obj):
        """Display calculated total score"""
        if obj.total_score is not None:
            return f"{obj.total_score:.2f}"
        return '-'
    total_score_display.short_description = 'Total Score'
