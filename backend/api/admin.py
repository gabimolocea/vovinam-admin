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
from .bracket_visualization import bracket_visualization_readonly_field, BracketStats
from django.db import models
from django.db.models import Count, Case, When, IntegerField
from django.db.models.functions import TruncMonth
import datetime
import json
import urllib.parse
from django.utils.safestring import mark_safe
from django.template.response import TemplateResponse
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
    ExternalAPIClient,
    Visa,
    Event,
    EventParticipation,
    UserProxy,
)


admin.site.enable_nav_sidebar = False


def _apply_admin_model_labels():
    labels = {
        City: ('oraș', 'orașe'),
        Club: ('club', 'cluburi'),
        Athlete: ('sportiv', 'sportivi'),
        SupporterAthleteRelation: ('relație susținător-sportiv', 'relații susținător-sportiv'),
        TrainingSeminarParticipation: ('participare la seminar', 'participări la seminare'),
        EventParticipation: ('participare la eveniment', 'participări la evenimente'),
        Grade: ('grad', 'grade'),
        GradeHistory: ('istoric grad', 'istoric grade'),
        Title: ('titlu', 'titluri'),
        FederationRole: ('rol în federație', 'roluri în federație'),
        Visa: ('viză', 'vize'),
        Event: ('eveniment', 'evenimente'),
        Category: ('categorie', 'categorii'),
        SoloCategory: ('categorie individuală', 'categorii individuale'),
        TeamCategory: ('categorie pe echipe', 'categorii pe echipe'),
        FightCategory: ('categorie de luptă', 'categorii de luptă'),
        FightAthleteWeight: ('greutate sportiv luptă', 'greutăți sportivi luptă'),
        Team: ('echipă', 'echipe'),
        CategoryTeam: ('echipă în categorie', 'echipe în categorie'),
        CategoryAthlete: ('sportiv în categorie', 'sportivi în categorii'),
        Match: ('meci', 'meciuri'),
        MatchEvent: ('eveniment meci', 'evenimente meci'),
        MatchRefereeScore: ('scor arbitru meci', 'scoruri arbitri meci'),
        RefereeScore: ('scor arbitru', 'scoruri arbitri'),
        RefereePointEvent: ('eveniment punctaj arbitru', 'evenimente punctaj arbitru'),
        CategoryAthleteScore: ('rezultat sportiv', 'rezultate sportivi'),
        CategoryRefereeScore: ('scor arbitru categorie', 'scoruri arbitri categorie'),
        CategoryRefereeAssignment: ('alocare arbitri categorie', 'alocări arbitri categorie'),
        MatchRefereeAssignment: ('alocare arbitri meci', 'alocări arbitri meci'),
        CategoryTeamScore: ('rezultat echipă', 'rezultate echipe'),
        TeamMember: ('membru echipă', 'membri echipă'),
        Group: ('grup', 'grupuri'),
        MatchVideoRecording: ('înregistrare video meci', 'înregistrări video meci'),
        AthletePerformanceVideo: ('video probă individuală', 'video-uri probe individuale'),
        TeamPerformanceVideo: ('video probă pe echipe', 'video-uri probe pe echipe'),
        CompetitionField: ('teren de concurs', 'terenuri de concurs'),
        CategoryFieldAssignment: ('alocare teren categorie', 'alocări teren categorie'),
        MatchFieldAssignment: ('alocare teren meci', 'alocări teren meci'),
        MatchRound: ('rundă meci', 'runde meci'),
        CompetitionReferee: ('arbitru competiție', 'arbitri competiție'),
        DisplayMonitorSession: ('sesiune monitor afișaj', 'sesiuni monitor afișaj'),
        ExternalAPIClient: ('client API extern', 'clienți API externi'),
        UserProxy: ('utilizator', 'utilizatori'),
    }

    for model, (singular, plural) in labels.items():
        model._meta.verbose_name = singular
        model._meta.verbose_name_plural = plural


_apply_admin_model_labels()


def get_event_referee_queryset_for_match(match=None, event_id=None):
    qs = Athlete.objects.filter(is_referee=True, status='approved')

    resolved_event_id = event_id
    if resolved_event_id is None and match is not None:
        try:
            resolved_event_id = getattr(getattr(match, 'category', None), 'event_id', None)
        except Exception:
            resolved_event_id = None

    if not resolved_event_id:
        return qs.distinct().order_by('last_name', 'first_name')

    roster_ids = CompetitionReferee.objects.filter(event_id=resolved_event_id).values_list('athlete_id', flat=True)
    roster_qs = qs.filter(pk__in=roster_ids)
    if roster_qs.exists():
        return roster_qs.distinct().order_by('last_name', 'first_name')

    return qs.distinct().order_by('last_name', 'first_name')

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
        'ExternalAPIClient',
    ],
    'ADMINISTRARE COMPETIȚII': [
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


def _wrap_related_autocomplete_widget(formfield, db_field, admin_site, widget):
    current_widget = formfield.widget
    return RelatedFieldWidgetWrapper(
        widget,
        db_field.remote_field,
        admin_site,
        can_add_related=getattr(current_widget, 'can_add_related', False),
        can_change_related=getattr(current_widget, 'can_change_related', False),
        can_delete_related=getattr(current_widget, 'can_delete_related', False),
        can_view_related=getattr(current_widget, 'can_view_related', False),
    )


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
    verbose_name = _('Sportiv')
    verbose_name_plural = _('Sportivi')
    can_delete = True  # Allow removing athletes from the club

    def current_grade_display(self, obj):
        if obj and obj.current_grade:
            return obj.current_grade.name
        return '—'
    current_grade_display.short_description = _('Grad')
    
    def get_athlete_link(self, obj):
        """Display athlete name as clickable link to their detail page"""
        if obj and obj.pk:
            try:
                url = reverse('admin:api_athlete_change', args=(obj.pk,))
                return format_html('<a href="{}" target="_blank">{} {}</a>', url, obj.first_name, obj.last_name)
            except Exception:
                return f"{obj.first_name} {obj.last_name}"
        return '-'
    get_athlete_link.short_description = _('Nume')
    
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
    verbose_name = _('Sportiv')
    verbose_name_plural = _('Sportivi')

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
            widget = autocomplete.ModelSelect2(
                url='athlete-autocomplete',
                forward=['category']
            )
            widget.attrs.update({
                'style': 'width: 200px !important; max-width: 200px !important; min-width: 200px !important;',
                'class': 'vForeignKeyRawIdAdminField'
            })
            formfield.widget = _wrap_related_autocomplete_widget(formfield, db_field, self.admin_site, widget)
        
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
                self.verbose_name = _('Sportiv')
                self.verbose_name_plural = _('SPORTIVI ÎNSCRIȘI')
                self.fields = ('athlete', 'place')
            elif isinstance(obj, SoloCategory):
                self.verbose_name = _('Sportiv înscris')
                self.verbose_name_plural = _('Sportivi înscriși')
                self.fields = ('athlete', 'ref1_score', 'ref2_score', 'ref3_score', 'ref4_score', 'ref5_score', 'total_display', 'place', 'disqualified')
                self.readonly_fields = ('total_display',)
            else:
                # For generic Category views (shouldn't happen often)
                self.verbose_name = _('Sportiv')
                self.verbose_name_plural = _('Sportivi')
                self.fields = ('athlete', 'place')
        return super().get_formset(request, obj, **kwargs)
    
    def total_display(self, obj):
        """Display calculated total score"""
        if obj and obj.total_score is not None:
            return f"{obj.total_score:.2f}"
        return "-"
    total_display.short_description = _('Total')

    def athlete_with_club(self, obj):
        """
        Display the athlete's name along with their club.
        """
        if obj.athlete.club:
            return f"{obj.athlete.first_name} {obj.athlete.last_name} ({obj.athlete.club.name})"
        return f"{obj.athlete.first_name} {obj.athlete.last_name}"
    athlete_with_club.short_description = _('Sportiv (Club)')

    def category_with_event(self, obj):
        """
        Display the category name along with its event.
        """
        if obj.category and obj.category.event:
            return f"{obj.category.name} ({obj.category.event.title})"
        elif obj.category:
            return f"{obj.category.name} (Fără eveniment)"
        return "N/A"
    category_with_event.short_description = _('Categorie (Eveniment)')

    def category_type(self, obj):
        """
        Display the type of the category.
        """
        from .models import FightCategory, SoloCategory, TeamCategory
        if isinstance(obj.category, FightCategory):
            return 'Luptă'
        elif isinstance(obj.category, SoloCategory):
            return 'Solo'
        elif isinstance(obj.category, TeamCategory):
            return 'Echipă'
        return 'Necunoscut'
    category_type.short_description = _('Tip categorie')


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
                    link = format_html('<a href="{}">vezi înregistrarea existentă</a>', url)
                    message = format_html('Există deja o înregistrare pentru acest sportiv și acest grad. {}', link)
                except Exception:
                    # Fallback to plain text message if reverse fails
                    message = 'Există deja o înregistrare pentru acest sportiv și acest grad.'
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
                raise ValidationError({'health_status': 'Starea de sănătate este obligatorie pentru vizele medicale.'})
            return cleaned
    @admin.register(Visa)
    class VisaAdmin(admin.ModelAdmin):
        form = VisaAdminForm
        list_display = ('athlete_with_club', 'visa_type', 'issued_date', 'visa_status', 'status', 'submitted_date')
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
        athlete_with_club.short_description = _('Sportiv')
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
    verbose_name = _('Viză')
    verbose_name_plural = _('Vize')
    
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
    verbose_name = _('Participare la eveniment')
    verbose_name_plural = _('Participări la eveniment')
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
    athlete_link.short_description = _('Sportiv')

class AthleteTrainingSeminarParticipationInline(admin.TabularInline):
    """Inline on Athlete admin to show the athlete's approved seminar enrollments."""
    model = TrainingSeminarParticipation
    fk_name = 'athlete'
    extra = 0
    show_change_link = True
    verbose_name = _('Eveniment înscris')
    verbose_name_plural = _('Evenimente înscrise')
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

            def get_urls(self):
                urls = super().get_urls()
                custom_urls = [
                    path(
                        '<int:event_id>/generate-standard-structure/',
                        self.admin_site.admin_view(self.generate_standard_structure),
                        name='api_event_generate_standard_structure',
                    ),
                ]
                return custom_urls + urls

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
                    return "Salvează mai întâi evenimentul pentru a vedea acțiunile rapide."
                
                from django.urls import reverse
                links = []
                
                # Link to add Solo Category
                solo_add_url = reverse('admin:api_solocategory_add') + f'?event={obj.pk}'
                links.append(f'<a class="button" href="{solo_add_url}">+ Adaugă categorie solo</a>')
                
                # Link to add Team Category
                team_add_url = reverse('admin:api_teamcategory_add') + f'?event={obj.pk}'
                links.append(f'<a class="button" href="{team_add_url}">+ Adaugă categorie echipe</a>')
                
                # Link to add Fight Category
                fight_add_url = reverse('admin:api_fightcategory_add') + f'?event={obj.pk}'
                links.append(f'<a class="button" href="{fight_add_url}">+ Adaugă categorie luptă</a>')
                
                # Link to view categories for this event
                categories_url = reverse('admin:api_solocategory_changelist') + f'?event={obj.pk}'
                links.append(f'<a class="button" href="{categories_url}">Vezi toate categoriile</a>')
                
                # Link to view matches for this event
                matches_url = reverse('admin:api_match_changelist') + f'?category__event__id={obj.pk}'
                links.append(f'<a class="button" href="{matches_url}">Vezi toate meciurile</a>')

                generate_url = reverse('admin:api_event_generate_standard_structure', args=[obj.pk])
                links.append(
                    f'<a class="button" href="{generate_url}" '
                    f'onclick="return confirm(\'Generez grupele și categoriile standard lipsă pentru această competiție?\')">'
                    f'Generează grupele și categoriile standard</a>'
                )
                
                html = '<div style="margin-top: 10px;">' + ' '.join(links) + '</div>'
                return mark_safe(html)
            
            quick_add_links.short_description = 'Acțiuni rapide'
            
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

            def generate_standard_structure(self, request, event_id):
                from .competition_defaults import ensure_standard_competition_groups_and_categories

                event = Event.objects.filter(pk=event_id).first()
                if not event:
                    self.message_user(request, 'Competiția nu a fost găsită.', level=messages.ERROR)
                    return HttpResponseRedirect(reverse('admin:api_event_changelist'))

                result = ensure_standard_competition_groups_and_categories(event)
                self.message_user(
                    request,
                    (
                        'Structura standard a fost sincronizată. '
                        f"Grupe create: {result['groups_created']}, actualizate: {result['groups_updated']}; "
                        f"categorii create: {result['categories_created']}, actualizate: {result['categories_updated']}."
                    ),
                    level=messages.SUCCESS,
                )
                return HttpResponseRedirect(reverse('admin:api_event_change', args=[event.pk]))
        
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
                    raise ValidationError({'event': 'Selectează un eveniment.'})

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
    extra = 1
    autocomplete_fields = ['red_corner', 'blue_corner']  # Winner is now computed
    # Show a quick link to open the full Match change page so admins can view/edit
    # the match details directly from the Category change form.
    fields = ('match_type', 'red_corner', 'blue_corner', 'winner_display', 'match_link')  # Do not show referees
    exclude = ('field',)
    readonly_fields = ('winner_display', 'match_link')
    show_change_link = False
    verbose_name = "Meci"
    verbose_name_plural = "Meciuri"

    def winner_display(self, obj):
        """Display computed winner from scoring system"""
        if obj.pk:
            winner = obj.winner
            if winner:
                return f"{winner.first_name} {winner.last_name}"
            return "Fără câștigător încă"
        return "-"
    winner_display.short_description = "Câștigător"

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
        """Render a small link to the match change page for this inline row."""
        try:
            if not obj or not getattr(obj, 'pk', None):
                return ''
            url = reverse('admin:api_match_change', args=(obj.pk,))
            return format_html('<a href="{}" class="related-link" target="_blank">Deschide</a>', url)
        except Exception:
            return ''
    match_link.short_description = _('Detalii meci')

class RefereeScoreInline(admin.TabularInline):
    model = RefereeScore
    extra = 0
    classes = ('collapse',)
    # Show per-round columns (3 rounds default) plus totals and adjusted totals
    # Use a custom form so per-round fields are editable and saved as events.
    class RefereeScoreForm(forms.ModelForm):
        red_round_1 = forms.IntegerField(required=False, label='Roșu R1', widget=forms.NumberInput(attrs={'style': 'width: 50px;'}))
        red_round_2 = forms.IntegerField(required=False, label='Roșu R2', widget=forms.NumberInput(attrs={'style': 'width: 50px;'}))
        red_round_3 = forms.IntegerField(required=False, label='Roșu R3', widget=forms.NumberInput(attrs={'style': 'width: 50px;'}))
        blue_round_1 = forms.IntegerField(required=False, label='Albastru R1', widget=forms.NumberInput(attrs={'style': 'width: 50px;'}))
        blue_round_2 = forms.IntegerField(required=False, label='Albastru R2', widget=forms.NumberInput(attrs={'style': 'width: 50px;'}))
        blue_round_3 = forms.IntegerField(required=False, label='Albastru R3', widget=forms.NumberInput(attrs={'style': 'width: 50px;'}))

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
                    inst = getattr(self, 'instance', None)
                    match = getattr(inst, 'match', None) if inst else None
                    self.fields['referee'].queryset = get_event_referee_queryset_for_match(match=match)
                except Exception:
                    pass
            try:
                # Populate per-round initial values from adjusted scoring,
                # so penalties can visibly push a round below zero.
                inst = getattr(self, 'instance', None)
                if inst and getattr(inst, 'pk', None):
                    from api.scoring import compute_match_results
                    res = compute_match_results(inst.match)
                    by_round = (res.get('per_ref', {}).get(inst.referee_id, {}) or {}).get('rounds', {}) or {}
                    for rd in (1, 2, 3):
                        r = by_round.get(rd)
                        if r:
                            self.fields.get(f'red_round_{rd}').initial = r.get('adj_red')
                            self.fields.get(f'blue_round_{rd}').initial = r.get('adj_blue')
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
    verbose_name = 'Scor arbitru vechi'
    verbose_name_plural = 'Scoruri arbitri vechi (sincronizate / opționale)'
    fields = (
        'referee',
        'red_round_1', 'blue_round_1',  # ROUND 1
        'red_round_2', 'blue_round_2',  # ROUND 2
        'red_round_3', 'blue_round_3',  # ROUND 3
        'red_total', 'blue_total',
        'winner_combined',
    )
    autocomplete_fields = []
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
    ref_number.short_description = 'ARBITRU'
    
    def get_formset(self, request, obj=None, **kwargs):
        """Customize formset to always show exactly 5 forms"""
        formset = super().get_formset(request, obj, **kwargs)
        if not hasattr(formset, '_unique_referee_wrapped'):
            original_clean = formset.clean

            def clean(formset_self):
                original_clean(formset_self)
                selected = []
                for form in formset_self.forms:
                    if not hasattr(form, 'cleaned_data'):
                        continue
                    if form.cleaned_data.get('DELETE'):
                        continue
                    ref = form.cleaned_data.get('referee')
                    if ref:
                        if ref.pk in selected:
                            raise ValidationError('Each referee can be selected only once.')
                        selected.append(ref.pk)

            formset.clean = clean
            formset._unique_referee_wrapped = True
        try:
            if obj:
                qs = get_event_referee_queryset_for_match(match=obj)
                if 'referee' in formset.form.base_fields:
                    formset.form.base_fields['referee'].queryset = qs
        except Exception:
            pass
        return formset

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'referee':
            qs = Athlete.objects.filter(is_referee=True, status='approved')
            try:
                match_id = request.resolver_match.kwargs.get('object_id') if request.resolver_match else None
                if match_id:
                    match = Match.objects.filter(pk=match_id).select_related('category__event').first()
                    qs = get_event_referee_queryset_for_match(match=match)
            except Exception:
                pass
            kwargs['queryset'] = qs.distinct()
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

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
    red_total.short_description = _('TOTAL ROȘU')

    def red_round_1(self, obj):
        return self._red_round(obj, 1)
    red_round_1.short_description = _('ROȘU')

    def red_round_2(self, obj):
        return self._red_round(obj, 2)
    red_round_2.short_description = _('ROȘU')

    def red_round_3(self, obj):
        return self._red_round(obj, 3)
    red_round_3.short_description = _('ROȘU')

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
    blue_total.short_description = _('TOTAL ALBASTRU')

    def blue_round_1(self, obj):
        return self._blue_round(obj, 1)
    blue_round_1.short_description = _('ALBASTRU')

    def blue_round_2(self, obj):
        return self._blue_round(obj, 2)
    blue_round_2.short_description = _('ALBASTRU')

    def blue_round_3(self, obj):
        return self._blue_round(obj, 3)
    blue_round_3.short_description = _('ALBASTRU')

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
                return 'Roșu'
            elif w == 'blue':
                return 'Albastru'
            return ''
        except Exception:
            return ''
    winner_display.short_description = _('Câștigător (ajustat)')

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
                    return 'Roșu'
                elif w == 'blue':
                    return 'Albastru'

            # Otherwise compute adjusted winner
            from api.scoring import compute_match_results
            res = compute_match_results(obj.match)
            per = res.get('per_ref', {})
            p = per.get(obj.referee_id)
            if not p:
                return ''
            w = p.get('winner')
            if w == 'red':
                return 'Roșu'
            elif w == 'blue':
                return 'Albastru'
            return ''
        except Exception:
            return ''
    winner_combined.short_description = _('Câștigător')
    
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
        label='Rundă',
        help_text='Ce rundă este vizată (1, 2 sau 3)',
        widget=forms.NumberInput(attrs={'style': 'width: 80px;'})
    )
    
    penalty_reason = forms.CharField(
        required=False,
        max_length=200,
        label='Motiv',
        help_text='Ex.: „contact excesiv”, „tehnică ilegală”, „comportament nesportiv”',
        widget=forms.TextInput(attrs={'style': 'width: 250px;', 'placeholder': 'contact excesiv'})
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
    classes = ('collapse',)
    fields = ('referee', 'side', 'points', 'penalty_round', 'penalty_reason', 'created_by', 'timestamp')
    readonly_fields = ('created_by', 'timestamp')
    formset = CentralPenaltyInlineFormSet
    can_delete = True
    verbose_name = _('Penalizare centrală veche')
    verbose_name_plural = _('Penalizări centrale vechi (sincronizate / opționale)')

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'referee':
            qs = Athlete.objects.filter(is_referee=True, status='approved')
            try:
                match_id = request.resolver_match.kwargs.get('object_id') if request.resolver_match else None
                if match_id:
                    match = Match.objects.filter(pk=match_id).select_related('category__event').first()
                    qs = get_event_referee_queryset_for_match(match=match)
            except Exception:
                pass
            kwargs['queryset'] = qs
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

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
        selected = []
        for i in range(1, 6):
            ref_field = f'referee_{i}'
            ref_id = cleaned_data.get(ref_field)
            if ref_id:
                if ref_id.pk in selected:
                    raise ValidationError('Each referee can be selected only once.')
                selected.append(ref_id.pk)
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
    verbose_name = _('Arbitru')
    verbose_name_plural = _('Arbitri')
    
    class Media:
        css = {
            'all': ('/static/admin/css/referee_assignment_compact.css?v=20260206',)
        }
    
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        """Filter autocomplete to show only approved athletes with is_referee=True"""
        if db_field.name.startswith('referee_'):
            kwargs["queryset"] = Athlete.objects.filter(is_referee=True, status='approved')
            formfield = super().formfield_for_foreignkey(db_field, request, **kwargs)
            widget = autocomplete.ModelSelect2(
                url='athlete-autocomplete',
                forward=['category', forward.Const('1', 'only_referees')]
            )
            formfield.widget = _wrap_related_autocomplete_widget(formfield, db_field, self.admin_site, widget)
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
    verbose_name = _('Scor sportiv')
    verbose_name_plural = _('Scoruri sportivi (categorie solo)')
    
    def referee_assignment_display(self, obj):
        """Display the assigned referees for this category"""
        if not obj.category:
            return "Nicio categorie atribuită"
        
        try:
            assignment = obj.category.referee_assignment
            referees = []
            for i in range(1, 6):
                ref_attr = f'referee_{i}'
                ref = getattr(assignment, ref_attr, None)
                if ref:
                    referees.append(f"R{i}: {ref.first_name} {ref.last_name}")
                else:
                    referees.append(f"R{i}: Nealocat")
            return format_html(
                '<div style="font-size: 11px; color: #666; white-space: nowrap;">{}</div>',
                mark_safe('<br>'.join(referees))
            )
        except:
            return "Niciun arbitru alocat"
    
    referee_assignment_display.short_description = 'Arbitri'

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'athlete':
            formfield = super().formfield_for_foreignkey(db_field, request, **kwargs)
            widget = autocomplete.ModelSelect2(
                url='athlete-autocomplete',
                forward=['category']
            )
            formfield.widget = _wrap_related_autocomplete_widget(formfield, db_field, self.admin_site, widget)
            return formfield
        return super().formfield_for_foreignkey(db_field, request, **kwargs)
    
    @admin.display(description='Scor total')
    def get_total_score(self, obj):
        """Display the calculated total score"""
        if obj.pk:
            return obj.calculated_score or '-'
        return '-'

class CategoryTeamScoreInlineForm(forms.ModelForm):
    """Custom form for team enrollment (CategoryAthleteScore with type='teams')"""
    team_name_select = forms.ChoiceField(
        required=False,
        label='Nume echipă',
        help_text='Selectează dintre echipele înscrise'
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
    verbose_name = _('Înscriere echipă')
    verbose_name_plural = _('Înscrieri echipe')
    fk_name = 'category'
    
    def get_queryset(self, request):
        """Filter to show only team-type scores"""
        qs = super().get_queryset(request)
        return qs.filter(type='teams')
    
    def referee_assignment_display(self, obj):
        """Display the assigned referees for this category"""
        if not obj.category:
            return "Nicio categorie atribuită"
        
        try:
            assignment = obj.category.referee_assignment
            referees = []
            for i in range(1, 6):
                ref_attr = f'referee_{i}'
                ref = getattr(assignment, ref_attr, None)
                if ref:
                    referees.append(f"R{i}: {ref.first_name} {ref.last_name}")
                else:
                    referees.append(f"R{i}: Nealocat")
            return format_html(
                '<div style="font-size: 12px; color: #666;">{}</div>',
                mark_safe('<br>'.join(referees))
            )
        except:
            return "Niciun arbitru alocat acestei categorii"
    
    referee_assignment_display.short_description = 'Arbitri alocați'
    
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
            return format_html('<a href="{}?athlete_score={}" style="color: #417690;">Adaugă scor</a>', 
                             '/admin/api/categoryscore/add/', obj.pk)
        return '-'
    
    @admin.display(description='R2')
    def get_r2_score(self, obj):
        """Display R2 score with edit link"""
        if obj.pk:
            score = obj.get_referee_score(2)
            if score is not None:
                return format_html('{:.2f}', score)
            return format_html('<a href="{}?athlete_score={}" style="color: #417690;">Adaugă scor</a>', 
                             '/admin/api/categoryscore/add/', obj.pk)
        return '-'
    
    @admin.display(description='R3')
    def get_r3_score(self, obj):
        """Display R3 score with edit link"""
        if obj.pk:
            score = obj.get_referee_score(3)
            if score is not None:
                return format_html('{:.2f}', score)
            return format_html('<a href="{}?athlete_score={}" style="color: #417690;">Adaugă scor</a>', 
                             '/admin/api/categoryscore/add/', obj.pk)
        return '-'
    
    @admin.display(description='R4')
    def get_r4_score(self, obj):
        """Display R4 score with edit link"""
        if obj.pk:
            score = obj.get_referee_score(4)
            if score is not None:
                return format_html('{:.2f}', score)
            return format_html('<a href="{}?athlete_score={}" style="color: #417690;">Adaugă scor</a>', 
                             '/admin/api/categoryscore/add/', obj.pk)
        return '-'
    
    @admin.display(description='R5')
    def get_r5_score(self, obj):
        """Display R5 score with edit link"""
        if obj.pk:
            score = obj.get_referee_score(5)
            if score is not None:
                return format_html('{:.2f}', score)
            return format_html('<a href="{}?athlete_score={}" style="color: #417690;">Adaugă scor</a>', 
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
    verbose_name = _('Membru echipă')
    verbose_name_plural = _('Membri echipă')

class EnrolledTeamsInline(admin.TabularInline):
    model = CategoryTeam
    extra = 1  # Allow adding new teams
    autocomplete_fields = ['team']  # Add autocomplete for team selection
    fields = ('team', 'ref1_score', 'ref2_score', 'ref3_score', 'ref4_score', 'ref5_score', 'total_display', 'place', 'disqualified')
    readonly_fields = ('total_display',)
    verbose_name_plural = _('Echipe înscrise')  # Rename the section title
    
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
    verbose_name = _('Rezultat solo')
    verbose_name_plural = _('Rezultate solo')
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
    category_name.short_description = _('Nume categorie')

    def competition_name(self, obj):
        """
        Display the event name.
        """
        if obj.category and obj.category.event:
            return obj.category.event.title
        return _('N/A')
    competition_name.short_description = _('Nume eveniment')

    def results(self, obj):
        """
        Display the results of the athlete for solo categories.
        """
        if obj.category.first_place == obj.athlete:
            return _('Locul 1')
        elif obj.category.second_place == obj.athlete:
            return _('Locul 2')
        elif obj.category.third_place == obj.athlete:
            return _('Locul 3')
        return _('Fără clasare')
    results.short_description = _('Loc obținut')


class AthleteTeamResultsInline(admin.TabularInline):
    """Compact tabular inline to show team results related to this athlete.

    Uses CategoryAthleteScore (team results model) filtered to type='teams'.
    Displayed as a single inline on the Athlete change form so there are no
    nested or duplicate inlines.
    """
    model = CategoryAthleteScore
    extra = 0
    verbose_name = _('Rezultat echipă')
    verbose_name_plural = _('Rezultate echipe')
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
    competition_name.short_description = _('Eveniment')

    def category_name(self, obj):
        return obj.category.name if obj.category else 'N/A'
    category_name.short_description = _('Categorie')

    def team_members_display(self, obj):
        return ', '.join([f"{m.first_name} {m.last_name}" for m in obj.team_members.all()])
    team_members_display.short_description = _('Membri echipă')


class AthleteFightResultsInline(admin.TabularInline):
    """
    Inline to display results for fight categories.
    """
    model = CategoryAthlete
    extra = 0
    verbose_name = "Rezultat luptă"
    verbose_name_plural = "Rezultate luptă"
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
    category_name.short_description = "Nume categorie"

    def competition_name(self, obj):
        """
        Display the event name.
        """
        return obj.category.event.title if obj.category.event else "N/A"
    competition_name.short_description = "Nume eveniment"

    def results(self, obj):
        """
        Display the results of the athlete for fight categories.
        """
        if obj.category.first_place == obj.athlete:
            return "Locul 1"
        elif obj.category.second_place == obj.athlete:
            return "Locul 2"
        elif obj.category.third_place == obj.athlete:
            return "Locul 3"
        return "Fără clasare"
    results.short_description = "Loc obținut"


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
        """Display the number of athletes in this club"""
        return obj.athletes.count()
    athlete_count.short_description = _('Sportivi')
    athlete_count.admin_order_field = 'athletes__count'
    
    def coach_count(self, obj):
        """Display the number of coaches in this club"""
        return obj.coaches.count()
    coach_count.short_description = _('Antrenori')
    
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
        'club_labels': club_labels,
        'club_counts': club_counts,
        'visa_stats': {'expired': expired_count, 'valid': valid_count, 'not_available': not_available},
        'new_athlete_labels': series_labels,
        'new_athlete_counts': series_counts,
        'city_labels': city_labels,
        'city_counts': city_counts,
    }
    return context


def dashboard_view(request):
    """Dashboard route kept for direct access; renders template with context."""
    context = get_dashboard_context()
    context.update(admin.site.each_context(request))
    context['app_list'] = admin.site.get_app_list(request)
    return render(request, 'admin/index.html', context)


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
    image_preview.short_description = 'Previzualizare imagine'


class GradeHistoryAdminForm(forms.ModelForm):
    class Meta:
        model = GradeHistory
        fields = '__all__'

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
        return ", ".join([f"{athlete.first_name} {athlete.last_name}" for athlete in athletes]) if athletes else "Niciunul"
    get_associated_athletes.short_description = _('Sportivi asociați')


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
    verbose_name_plural = "ECHIPĂ ÎNSCRISĂ ÎN URMĂTOARELE CATEGORII"  # Rename the section title
    def place_obtained(self, obj):
        """
        Display the place obtained by the team in the category.
        """
        if obj.category.first_place_team == obj.team:
            return "Locul 1"
        elif obj.category.second_place_team == obj.team:
            return "Locul 2"
        elif obj.category.third_place_team == obj.team:
            return "Locul 3"
        return "Fără clasare"
    place_obtained.short_description = "Loc obținut"

class GroupInline(admin.TabularInline):
    """
    Inline configuration for managing groups within a category.
    """
    model = Group
    extra = 1  # Number of empty forms to display
    fields = ('name',)  # Only display the name field
    verbose_name = "Grupă"
    verbose_name_plural = "Grupe"

class CategoryAdminForm(forms.ModelForm):
    class Meta:
        model = Category
        exclude = ('category_number',)


class CategoryFieldAssignmentInline(admin.StackedInline):
    model = CategoryFieldAssignment
    extra = 0
    verbose_name = 'Programare teren'
    verbose_name_plural = 'Programări teren'
    fields = (
        'field',
        'status',
        'scheduled_start_time',
        'actual_start_time',
        'actual_end_time',
        'order',
    )

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        formfield = super().formfield_for_foreignkey(db_field, request, **kwargs)
        if db_field.name == 'field':
            qs = CompetitionField.objects.filter(field_number__in=[1, 2, 3])
            try:
                object_id = request.resolver_match.kwargs.get('object_id')
                if object_id:
                    category = Category.objects.filter(pk=object_id).select_related('event').first()
                    if category and category.event_id:
                        qs = qs.filter(event_id=category.event_id)
            except Exception:
                pass
            formfield.queryset = qs
            formfield.label_from_instance = lambda obj: f"Teren {obj.field_number}"
        return formfield

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


class FightAthleteWeightInline(admin.TabularInline):
    """Inline for managing enrolled athletes and their weight data in fight categories"""
    model = FightAthleteWeight
    extra = 1
    fields = ('athlete', 'pre_weight_kg', 'current_weight_kg', 'is_disqualified', 'disqualification_reason', 'place')
    autocomplete_fields = ['athlete']
    verbose_name = _('Sportiv înscris')
    verbose_name_plural = _('Sportivi înscriși')


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

class RefereePointEventInline(admin.TabularInline):
    from .models import RefereePointEvent
    model = RefereePointEvent
    extra = 0
    # Allow creating/editing penalty events inline using a friendly form
    extra = 1
    fields = ('referee', 'side', 'points', 'reason')
    readonly_fields = ()
    verbose_name = 'Penalizare arbitru central'
    verbose_name_plural = 'Penalizări arbitru central'
    can_delete = True

    # No custom Media for metadata editor â€” keep plain textarea behavior

    class RefereePointEventForm(forms.ModelForm):
        # Provide a structured JSON editor widget for the metadata field so admins
        # can see and insert the expected keys (round, central, reason, origin)
        reason = forms.CharField(required=False, label='Motiv (opțional)')
        round = forms.IntegerField(min_value=1, required=False, initial=1, label='Rundă')

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
    verbose_name = _('Video prestație solo')
    verbose_name_plural = _('Videoclipuri prestație solo')
    show_change_link = True
    
    def athlete_display(self, obj):
        """Display athlete name"""
        if obj.athlete_score and obj.athlete_score.athlete:
            athlete = obj.athlete_score.athlete
            return f"{athlete.first_name} {athlete.last_name}"
        return '-'
    athlete_display.short_description = 'Sportiv'
    
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
                group_name = group.name if group else 'Fără grupă'
                event_title = event.title if event else 'Fără competiție'
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
                    return f"{team.name if team else 'Necunoscut'}"
                
                group = category.group if category else None
                event = category.event if category else None
                group_name = group.name if group else 'Fără grupă'
                event_title = event.title if event else 'Fără competiție'
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
                group_name = group.name if group else 'Fără grupă'
                event_title = event.title if event else 'Fără competiție'
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
    verbose_name = _('Video prestație')
    verbose_name_plural = _('Videoclipuri prestație')
    show_change_link = True
    
    def team_display(self, obj):
        """Display team name"""
        if obj.category_team and obj.category_team.team:
            return obj.category_team.team.name
        return '-'
    team_display.short_description = 'Echipă'
    
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
    verbose_name = _('Înregistrare video')
    verbose_name_plural = _('Înregistrări video (opțional)')
    show_change_link = True


class MatchRefereeAssignmentForm(forms.ModelForm):
    class Meta:
        model = MatchRefereeAssignment
        fields = '__all__'

    def clean(self):
        cleaned_data = super().clean()
        selected = []
        for i in range(1, 6):
            ref_field = f'referee_{i}'
            ref = cleaned_data.get(ref_field)
            if ref:
                if ref.pk in selected:
                    raise ValidationError('Each referee can be selected only once.')
                selected.append(ref.pk)
        return cleaned_data


class MatchRefereeAssignmentInline(admin.TabularInline):
    """Inline for assigning referees to matches in fight categories"""
    model = MatchRefereeAssignment
    form = MatchRefereeAssignmentForm
    extra = 0
    fields = ('referee_1', 'referee_2', 'referee_3', 'referee_4', 'referee_5')
    verbose_name = _('Atribuire arbitri')
    verbose_name_plural = _('Atribuire arbitri')

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name.startswith('referee_'):
            qs = Athlete.objects.filter(is_referee=True, status='approved')
            try:
                match_id = request.resolver_match.kwargs.get('object_id') if request.resolver_match else None
                if match_id:
                    match = Match.objects.filter(pk=match_id).select_related('category__event').first()
                    qs = get_event_referee_queryset_for_match(match=match)
            except Exception:
                pass
            kwargs['queryset'] = qs.distinct()
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


class LiveMatchRefereeScoreInline(admin.TabularInline):
    model = MatchRefereeScore
    extra = 0
    fields = ('referee', 'round', 'red_corner_score', 'blue_corner_score', 'winner_choice_display', 'submitted_date')
    readonly_fields = ('winner_choice_display', 'submitted_date')
    verbose_name = 'Scor arbitru live'
    verbose_name_plural = 'Scoruri arbitri live (sursa principală)'

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('referee', 'round').order_by('referee__last_name', 'referee__first_name', 'round__round_number', 'id')

    def winner_choice_display(self, obj):
        if not obj:
            return '—'
        winner = obj.winner_choice
        if winner == 'red':
            return 'Roșu'
        if winner == 'blue':
            return 'Albastru'
        return 'Egalitate'
    winner_choice_display.short_description = 'Câștigător'

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        match = None
        try:
            match_id = request.resolver_match.kwargs.get('object_id') if request.resolver_match else None
            if match_id:
                match = Match.objects.filter(pk=match_id).select_related('category__event').first()
        except Exception:
            match = None

        if db_field.name == 'referee':
            kwargs['queryset'] = get_event_referee_queryset_for_match(match=match)
        elif db_field.name == 'round':
            kwargs['queryset'] = MatchRound.objects.filter(match=match).order_by('round_number') if match else MatchRound.objects.none()
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


class LiveCentralPenaltyEventInlineForm(forms.ModelForm):
    class Meta:
        model = MatchEvent
        fields = ('created_by', 'corner', 'value', 'round', 'notes')

    def clean_corner(self):
        corner = self.cleaned_data.get('corner')
        if corner not in ('red', 'blue'):
            raise forms.ValidationError('Alege roșu sau albastru pentru o penalizare centrală.')
        return corner

    def clean_value(self):
        value = self.cleaned_data.get('value')
        if value is None:
            return -1
        return value if value <= 0 else -value


class LiveCentralPenaltyEventInline(admin.TabularInline):
    model = MatchEvent
    form = LiveCentralPenaltyEventInlineForm
    extra = 0
    fields = ('created_by', 'corner', 'value', 'round', 'notes', 'created_at')
    readonly_fields = ('created_at',)
    verbose_name = 'Penalizare centrală live'
    verbose_name_plural = 'Penalizări centrale live (sursa principală)'

    def get_queryset(self, request):
        return super().get_queryset(request).filter(event_type__in=['penalty_red', 'penalty_blue']).select_related('created_by', 'round').order_by('-created_at')

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        match = None
        try:
            match_id = request.resolver_match.kwargs.get('object_id') if request.resolver_match else None
            if match_id:
                match = Match.objects.filter(pk=match_id).select_related('category__event').first()
        except Exception:
            match = None

        if db_field.name == 'created_by':
            kwargs['queryset'] = get_event_referee_queryset_for_match(match=match)
        elif db_field.name == 'round':
            kwargs['queryset'] = MatchRound.objects.filter(match=match).order_by('round_number') if match else MatchRound.objects.none()
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


class MatchFieldAssignmentInline(admin.StackedInline):
    class MatchFieldAssignmentInlineForm(forms.ModelForm):
        class Meta:
            model = MatchFieldAssignment
            fields = '__all__'

        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            if 'status' in self.fields:
                self.fields['status'].label = 'Status în programare teren'
                self.fields['status'].help_text = 'Controlează starea meciului în programare/live pentru terenul alocat.'

    model = MatchFieldAssignment
    form = MatchFieldAssignmentInlineForm
    extra = 0
    verbose_name = 'Programare teren'
    verbose_name_plural = 'Programare teren'
    fields = (
        'field',
        'status',
        'scheduled_start_time',
        'actual_start_time',
        'actual_end_time',
        'order',
    )

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        formfield = super().formfield_for_foreignkey(db_field, request, **kwargs)
        if db_field.name == 'field':
            qs = CompetitionField.objects.filter(field_number__in=[1, 2, 3])
            try:
                match_id = request.resolver_match.kwargs.get('object_id') if request.resolver_match else None
                if match_id:
                    match = Match.objects.filter(pk=match_id).select_related('category__event').first()
                    if match and match.category_id and match.category.event_id:
                        qs = qs.filter(event_id=match.category.event_id)
            except Exception:
                pass
            formfield.queryset = qs
            formfield.label_from_instance = lambda obj: f"Field {obj.field_number}"
        return formfield


@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    list_display = ('get_id_display', 'name_with_corners', 'match_type', 'get_winner', 'category_link', 'field')
    search_fields = ('name', 'red_corner__first_name', 'red_corner__last_name', 'blue_corner__first_name', 'blue_corner__last_name', 'category__name', 'category__event__title')
    list_filter = ('match_type', 'category__event')
    competition_field = 'category'  # Will be filled from category's event

    # Use a custom change form template so we can add a quick 'Add central penalty' button
    change_form_template = 'admin/api/match/change_form.html'

    fieldsets = (
        ('DETALII MECI', {
            # Central referee is selected in the Central Penalties inline below
            # Winner is read-only and computed from referee scores/penalties
            'fields': ('category', 'match_type', 'status', 'red_corner', 'blue_corner', 'winner_display'),
            'description': 'Identifică meciul după ID. Câștigătorul este calculat automat din scorurile arbitrilor și penalizări.'
        } ),
        ('DATE LIVE (MODELE NOI DE SCORARE)', {
            'fields': ('frontend_referee_scores_panel', 'frontend_central_penalties_panel'),
            'description': 'Vizualizare doar-citire a datelor scrise de frontend-ul live/fullscreen. Nu depinde de rândurile legacy sincronizate.',
        }),
    )

    autocomplete_fields = ['red_corner', 'blue_corner']  # Winner is computed and read-only

    readonly_fields = ('winner_display', 'frontend_referee_scores_panel', 'frontend_central_penalties_panel')

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'field':
            qs = CompetitionField.objects.filter(field_number__in=[1, 2, 3])
            try:
                category_id = request.GET.get('category')
                if not category_id:
                    match_id = request.resolver_match.kwargs.get('object_id') if request.resolver_match else None
                    if match_id:
                        match = Match.objects.filter(pk=match_id).select_related('category__event').first()
                        if match and match.category_id:
                            category_id = match.category_id
                if category_id:
                    category = Category.objects.filter(pk=category_id).select_related('event').first()
                    if category and category.event_id:
                        qs = qs.filter(event_id=category.event_id)
            except Exception:
                pass
            kwargs['queryset'] = qs
            formfield = super().formfield_for_foreignkey(db_field, request, **kwargs)
            formfield.label_from_instance = lambda obj: f"Field {obj.field_number}"
            return formfield
        return super().formfield_for_foreignkey(db_field, request, **kwargs)
    
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

    def get_form(self, request, obj=None, **kwargs):
        form_class = super().get_form(request, obj, **kwargs)
        if 'status' in form_class.base_fields:
            form_class.base_fields['status'].label = 'Status logic meci'
            form_class.base_fields['status'].help_text = (
                'Controlează starea internă a meciului (scheduled / active / completed). '
                'Frontend-ul de meci ține cont și de statusul din programarea terenului.'
            )

        if obj and obj.field_id:
            try:
                assignment = MatchFieldAssignment.objects.filter(match=obj).first()
                if not assignment:
                    MatchFieldAssignment.objects.create(match=obj, field_id=obj.field_id)
                elif not assignment.field_id:
                    assignment.field_id = obj.field_id
                    assignment.save(update_fields=['field'])
            except Exception:
                pass
        return form_class

    def save_formset(self, request, form, formset, change):
        if formset.model == MatchFieldAssignment:
            instances = formset.save(commit=False)
            for inst in instances:
                inst.match = form.instance
                inst.save()
                if inst.field_id and form.instance.field_id != inst.field_id:
                    form.instance.field_id = inst.field_id
                    form.instance.save(update_fields=['field'])
            formset.save_m2m()
        elif formset.model == MatchRefereeScore:
            from .views import _sync_match_referee_score_to_legacy

            affected_referee_ids = set()
            instances = formset.save(commit=False)
            for deleted in formset.deleted_objects:
                if deleted.referee_id:
                    affected_referee_ids.add(deleted.referee_id)
                deleted.delete()

            for inst in instances:
                inst.match = form.instance
                inst.save()
                if inst.referee_id:
                    affected_referee_ids.add(inst.referee_id)

            formset.save_m2m()

            for referee_id in affected_referee_ids:
                _sync_match_referee_score_to_legacy(form.instance.id, referee_id)
        elif formset.model == MatchEvent:
            from .views import _delete_legacy_point_events, _legacy_metadata_matches, _sync_match_event_to_legacy

            deleted_event_ids = []
            instances = formset.save(commit=False)
            for deleted in formset.deleted_objects:
                deleted_event_ids.append(deleted.id)
                deleted.delete()

            for inst in instances:
                inst.match = form.instance
                if inst.corner == 'red':
                    inst.event_type = 'penalty_red'
                elif inst.corner == 'blue':
                    inst.event_type = 'penalty_blue'

                if not inst.created_by_id and hasattr(request.user, 'athlete'):
                    inst.created_by = request.user.athlete

                inst.save()
                _sync_match_event_to_legacy(inst)

            formset.save_m2m()

            for deleted_event_id in deleted_event_ids:
                _delete_legacy_point_events(
                    form.instance.id,
                    lambda event, deleted_id=deleted_event_id: _legacy_metadata_matches(
                        event.metadata,
                        origin='match_event_sync',
                        match_event_id=deleted_id,
                    )
                )
        else:
            super().save_formset(request, form, formset, change)
    
    def get_id_display(self, obj):
        """Display match ID"""
        return obj.pk
    get_id_display.short_description = 'ID'
    get_id_display.admin_order_field = 'pk'

    def frontend_referee_scores_panel(self, obj):
        if not obj or not obj.pk:
            return 'Salvează mai întâi meciul.'

        scores = list(
            MatchRefereeScore.objects.filter(match=obj)
            .select_related('referee', 'round')
            .order_by('referee__last_name', 'referee__first_name', 'round__round_number', 'id')
        )
        if not scores:
            return mark_safe('<span style="color:#999;">Nu există încă scoruri live introduse din frontend.</span>')

        grouped = {}
        for score in scores:
            referee = score.referee
            if not referee:
                continue
            entry = grouped.setdefault(referee.id, {
                'name': f'{referee.first_name} {referee.last_name}'.strip() or f'Referee #{referee.id}',
                'rounds': {},
                'final': score if score.round_id is None else None,
            })
            if score.round_id is None:
                entry['final'] = score
            else:
                entry['rounds'][score.round.round_number] = score

        rows = []
        for entry in grouped.values():
            round_cells = []
            for round_number in (1, 2, 3):
                round_score = entry['rounds'].get(round_number)
                if round_score:
                    round_cells.append(f'<td style="padding:6px 8px; border:1px solid #ddd; text-align:center;">{round_score.red_corner_score} - {round_score.blue_corner_score}</td>')
                else:
                    round_cells.append('<td style="padding:6px 8px; border:1px solid #ddd; text-align:center; color:#999;">—</td>')

            final_score = entry['final']
            if final_score:
                winner = 'Roșu' if final_score.winner_choice == 'red' else ('Albastru' if final_score.winner_choice == 'blue' else 'Egalitate')
                final_cell = f'{final_score.red_corner_score} - {final_score.blue_corner_score}'
            else:
                winner = '—'
                final_cell = '—'

            rows.append(
                '<tr>'
                f'<td style="padding:6px 8px; border:1px solid #ddd;">{entry["name"]}</td>'
                + ''.join(round_cells)
                + f'<td style="padding:6px 8px; border:1px solid #ddd; text-align:center;">{final_cell}</td>'
                + f'<td style="padding:6px 8px; border:1px solid #ddd; text-align:center; font-weight:600;">{winner}</td>'
                + '</tr>'
            )

        html = (
            '<table style="border-collapse:collapse; min-width:760px;">'
            '<thead><tr>'
            '<th style="padding:6px 8px; border:1px solid #ddd; text-align:left;">Arbitru</th>'
            '<th style="padding:6px 8px; border:1px solid #ddd;">R1</th>'
            '<th style="padding:6px 8px; border:1px solid #ddd;">R2</th>'
            '<th style="padding:6px 8px; border:1px solid #ddd;">R3</th>'
            '<th style="padding:6px 8px; border:1px solid #ddd;">Final</th>'
            '<th style="padding:6px 8px; border:1px solid #ddd;">Câștigător</th>'
            '</tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table>'
        )
        return mark_safe(html)
    frontend_referee_scores_panel.short_description = 'Scoruri arbitri din frontend'

    def frontend_central_penalties_panel(self, obj):
        if not obj or not obj.pk:
            return 'Salvează mai întâi meciul.'

        penalties = list(
            MatchEvent.objects.filter(match=obj, event_type__in=['penalty_red', 'penalty_blue'])
            .select_related('round', 'created_by')
            .order_by('-created_at')
        )
        if not penalties:
            return mark_safe('<span style="color:#999;">Nu există încă penalizări centrale introduse din frontend.</span>')

        rows = []
        for penalty in penalties:
            creator = '—'
            if penalty.created_by_id:
                creator = f'{penalty.created_by.first_name} {penalty.created_by.last_name}'.strip() or str(penalty.created_by_id)
            round_label = penalty.round.round_number if penalty.round_id else '—'
            side = 'Roșu' if penalty.corner == 'red' else ('Albastru' if penalty.corner == 'blue' else penalty.corner)
            rows.append(
                '<tr>'
                f'<td style="padding:6px 8px; border:1px solid #ddd;">{side}</td>'
                f'<td style="padding:6px 8px; border:1px solid #ddd; text-align:center;">{penalty.value}</td>'
                f'<td style="padding:6px 8px; border:1px solid #ddd; text-align:center;">{round_label}</td>'
                f'<td style="padding:6px 8px; border:1px solid #ddd;">{penalty.notes or "—"}</td>'
                f'<td style="padding:6px 8px; border:1px solid #ddd;">{creator}</td>'
                f'<td style="padding:6px 8px; border:1px solid #ddd; white-space:nowrap;">{timezone.localtime(penalty.created_at).strftime("%Y-%m-%d %H:%M:%S")}</td>'
                '</tr>'
            )

        html = (
            '<table style="border-collapse:collapse; min-width:760px;">'
            '<thead><tr>'
            '<th style="padding:6px 8px; border:1px solid #ddd; text-align:left;">Parte</th>'
            '<th style="padding:6px 8px; border:1px solid #ddd;">Puncte</th>'
            '<th style="padding:6px 8px; border:1px solid #ddd;">Rundă</th>'
            '<th style="padding:6px 8px; border:1px solid #ddd; text-align:left;">Motiv</th>'
            '<th style="padding:6px 8px; border:1px solid #ddd; text-align:left;">Creat de</th>'
            '<th style="padding:6px 8px; border:1px solid #ddd; text-align:left;">Timestamp</th>'
            '</tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table>'
        )
        return mark_safe(html)
    frontend_central_penalties_panel.short_description = 'Penalizări centrale din frontend'

    # Show field assignment, referee assignment, live source-of-truth scoring, and recordings.
    # Legacy inlines remain defined in this module for backward compatibility but are not shown here.
    inlines = [
        MatchFieldAssignmentInline,
        MatchRefereeAssignmentInline,
        LiveMatchRefereeScoreInline,
        LiveCentralPenaltyEventInline,
        MatchVideoRecordingInline,
    ]

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
        red = obj.red_corner
        blue = obj.blue_corner
        red_name = f"{red.first_name} {red.last_name}" if red else "De stabilit"
        blue_name = f"{blue.first_name} {blue.last_name}" if blue else "De stabilit"
        match_name = f"{red_name} (Colț roșu) vs {blue_name} (Colț albastru)"
        return format_html('<a href="{}" style="font-weight: bold;">{}</a>', url, match_name)
    name_with_corners.short_description = _('Nume meci')

    def central_referee_display(self, obj):
        """
        Display the central referee in the change list.
        """
        if obj.central_referee:
            return f"{obj.central_referee.first_name} {obj.central_referee.last_name}"
        return "De stabilit"
    central_referee_display.short_description = _('Arbitru central')

    def competition(self, obj):
        """
        Display the event name associated with the match.
        """
        return obj.category.event.title if obj.category.event else "N/A"
    competition.short_description = _('Eveniment')

    def category_link(self, obj):
        """
        Display the category name as a bold clickable link.
        """
        return format_html('<a href="/admin/api/category/{}/change/" style="font-weight: bold;">{}</a>', obj.category.id, obj.category.name)
    category_link.short_description = _('Categorie')

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
        return f"{obj.winner.first_name} {obj.winner.last_name}" if obj.winner else "De stabilit"
    get_winner.short_description = _('Câștigător')

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
            return 'De stabilit'
        except Exception:
            # Fall back to stored winner if compute fails
            try:
                return f"{obj.winner.first_name} {obj.winner.last_name}" if obj.winner else 'De stabilit'
            except Exception:
                return 'De stabilit'
    winner_display.short_description = _('Câștigător')

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        """
        Restrict athlete selection to those within the selected category for red_corner, blue_corner, and winner.
        """
        if db_field.name in ['red_corner', 'blue_corner']:
            if hasattr(request, 'obj') and isinstance(request.obj, Match):
                kwargs['queryset'] = request.obj.category.athletes.all()
        elif db_field.name == 'winner':
            if hasattr(request, 'obj') and isinstance(request.obj, Match):
                ids = []
                if request.obj.red_corner_id:
                    ids.append(request.obj.red_corner_id)
                if request.obj.blue_corner_id:
                    ids.append(request.obj.blue_corner_id)
                kwargs['queryset'] = Athlete.objects.filter(pk__in=ids)
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
                '<path:object_id>/force-start/',
                self.admin_site.admin_view(self.force_start_view),
                name='api_match_force_start',
            ),
            path(
                '<path:object_id>/recompute-results/',
                self.admin_site.admin_view(self.recompute_results_view),
                name='api_match_recompute_results',
            ),
        ]
        return custom_urls + urls

    def force_start_view(self, request, object_id, *args, **kwargs):
        from django.shortcuts import get_object_or_404

        if request.method != 'POST':
            messages.error(request, 'Pornirea forțată necesită o cerere POST.')
            return HttpResponseRedirect(reverse('admin:api_match_change', args=[object_id]))

        match = get_object_or_404(Match.objects.select_related('category', 'field'), pk=object_id)

        try:
            match.status = 'active'
            match.save(update_fields=['status'])

            assignment = MatchFieldAssignment.objects.filter(match=match).select_related('field').first()
            field_obj = getattr(assignment, 'field', None) or getattr(match, 'field', None)
            now = timezone.now()

            if assignment:
                assignment.status = 'in_progress'
                if not assignment.actual_start_time:
                    assignment.actual_start_time = now
                assignment.actual_end_time = None
                assignment.save(update_fields=['status', 'actual_start_time', 'actual_end_time'])
            elif field_obj:
                MatchFieldAssignment.objects.create(
                    match=match,
                    field=field_obj,
                    status='in_progress',
                    actual_start_time=now,
                    order=0,
                )

            if field_obj:
                DisplayMonitorSession.objects.update_or_create(
                    field=field_obj,
                    defaults={
                        'current_category_id': match.category_id,
                        'current_match_id': match.pk,
                        'current_athlete': None,
                        'status': 'displaying',
                    }
                )

            messages.success(request, f'Meciul #{match.pk} a fost pornit forțat din admin.')
        except Exception as exc:
            messages.error(request, f'Pornirea forțată a eșuat: {exc}')

        return HttpResponseRedirect(reverse('admin:api_match_change', args=[object_id]))

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
                return JsonResponse({'ok': False, 'error': 'Nu este setat niciun arbitru central'}, status=400)
            messages.error(request, 'Acest meci nu are setat un arbitru central.')
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

            try:
                from api.scoring import compute_match_results
                central_by_round = compute_match_results(match).get('central_penalties_by_round', {}) or {}
            except Exception:
                central_by_round = {}

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
                    round_adjustment = central_by_round.get(rd, {}) if isinstance(central_by_round, dict) else {}
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
                            raw_red_value = int(val) - int(round_adjustment.get('red', 0) or 0)
                            if existing_qs is not None and existing_qs.exists():
                                existing_qs.delete()
                            RefereePointEvent.objects.create(
                                match=match,
                                referee_id=rid,
                                side='red',
                                points=raw_red_value,
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
                            raw_blue_value = int(valb) - int(round_adjustment.get('blue', 0) or 0)
                            if existing_qs_b is not None and existing_qs_b.exists():
                                existing_qs_b.delete()
                            RefereePointEvent.objects.create(
                                match=match,
                                referee_id=rid,
                                side='blue',
                                points=raw_blue_value,
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

class CompetitionFieldAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'field_number', 'event', 'is_active')
    search_fields = ('name', 'field_number', 'event__title')
    list_filter = ('event', 'is_active')


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
        """Display number of categories in this group"""
        count = obj.categories.count()
        return f"{count} categorii"
    get_category_count.short_description = 'Categorii'


# User Admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, UserProxy


class ExternalAPIClientAdminForm(forms.ModelForm):
    raw_api_key = forms.CharField(
        required=False,
        label='Cheie API nouă',
        help_text='Lasă gol la editare pentru a păstra cheia curentă. La creare, dacă lași gol, cheia va fi generată automat.',
        widget=forms.TextInput(attrs={'autocomplete': 'off'})
    )

    class Meta:
        model = ExternalAPIClient
        fields = '__all__'


@admin.register(ExternalAPIClient)
class ExternalAPIClientAdmin(admin.ModelAdmin):
    form = ExternalAPIClientAdminForm
    list_display = ('name', 'service_user', 'api_key_preview', 'allow_write', 'is_active', 'last_used_at')
    list_filter = ('allow_write', 'is_active')
    search_fields = ('name', 'service_user__email', 'service_user__first_name', 'service_user__last_name', 'api_key_prefix')
    readonly_fields = ('api_key_preview', 'api_key_prefix', 'last_used_at', 'last_used_ip', 'created_at', 'updated_at')
    fieldsets = (
        ('Identificare', {
            'fields': ('name', 'service_user', 'is_active', 'allow_write')
        }),
        ('Securitate', {
            'fields': ('raw_api_key', 'api_key_preview', 'api_key_prefix', 'allowed_origins'),
            'description': 'Introdu manual cheia API sau las-o goală la creare pentru generare automată. Origin-urile trebuie trecute câte unul pe linie.'
        }),
        ('Audit', {
            'fields': ('last_used_at', 'last_used_ip', 'created_at', 'updated_at', 'notes')
        }),
    )

    def api_key_preview(self, obj):
        if not obj or not obj.pk or not obj.api_key_prefix:
            return '—'
        return f'{obj.api_key_prefix}…'
    api_key_preview.short_description = 'Prefix cheie API'

    def save_model(self, request, obj, form, change):
        raw_api_key = (form.cleaned_data.get('raw_api_key') or '').strip()
        generated_api_key = None

        if raw_api_key:
            obj.set_api_key(raw_api_key)
            generated_api_key = raw_api_key
        elif not change or not obj.api_key_hash:
            generated_api_key = ExternalAPIClient.generate_api_key()
            obj.set_api_key(generated_api_key)

        super().save_model(request, obj, form, change)

        if generated_api_key:
            self.message_user(
                request,
                format_html(
                    'Cheia API pentru <strong>{}</strong> este: <code>{}</code>. Copiaz-o acum; ulterior va rămâne vizibil doar prefixul.',
                    obj.name,
                    generated_api_key,
                ),
                level=messages.WARNING,
            )

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
class AthleteAdminForm(forms.ModelForm):
    class Meta:
        model = Athlete
        fields = '__all__'

    FIELD_LABELS = {
        'user': _('Utilizator'),
        'first_name': _('Prenume'),
        'last_name': _('Nume'),
        'gender': _('Gen'),
        'license_series': _('Serie legitimație'),
        'cnp': _('CNP'),
        'date_of_birth': _('Data nașterii'),
        'address': _('Adresă'),
        'mobile_number': _('Telefon mobil'),
        'profile_image': _('Fotografie profil'),
        'club': _('Club'),
        'city': _('Oraș'),
        'current_grade': _('Grad curent'),
        'federation_role': _('Rol în federație'),
        'title': _('Titlu'),
        'registered_date': _('Data înregistrării'),
        'expiration_date': _('Data expirării'),
        'is_coach': _('Este antrenor'),
        'is_referee': _('Este arbitru'),
        'emergency_contact_name': _('Nume contact de urgență'),
        'emergency_contact_phone': _('Telefon contact de urgență'),
        'status': _('Status'),
        'reviewed_by': _('Revizuit de'),
        'admin_notes': _('Notițe administrator'),
        'medical_certificate': _('Certificat medical'),
        'previous_experience': _('Experiență anterioară'),
        'team_place': _('Loc obținut cu echipa'),
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field_name, label in self.FIELD_LABELS.items():
            if field_name in self.fields:
                self.fields[field_name].label = label

@admin.register(Athlete)
class AthleteAdmin(admin.ModelAdmin):
    form = AthleteAdminForm
    change_form_template = 'admin/api/athlete/change_form.html'
    list_display = [
        'full_name_link', 'status', 'is_referee', 'is_coach'
    ]
    list_filter = ['status', 'is_coach', 'is_referee', 'submitted_date', 'reviewed_date']
    autocomplete_fields = ('club', 'city', 'current_grade', 'federation_role', 'title')
    search_fields = ['first_name', 'last_name', 'license_series', 'cnp', 'user__email', 'user__username', 'current_grade__name', 'club__name', 'city__name']
    readonly_fields = ['submitted_date_display', 'reviewed_date_display', 'current_grade_display_readonly', 'add_enrolled_event_link', 'add_grade_history_link', 'team_results_summary']
    ordering = ['-submitted_date']
    inlines = [
        GradeHistoryInline,
    VisaInline,
        AthleteTrainingSeminarParticipationInline,
        AthleteSoloResultsInline,
        AthleteFightResultsInline,
        # Team results displayed via custom method in fieldsets instead of inline
        # to avoid admin inline parent-instance validation issues for M2M team members.
    ]
    
    fieldsets = (
        ('Informații personale', {
            'fields': ('user', 'first_name', 'last_name', 'gender', 'license_series', 'cnp', 'date_of_birth', 'address', 'mobile_number', 'profile_image')
        }),
        ('Informații sportive și club', {
            'fields': ('club', 'city', 'current_grade_display_readonly', 'federation_role', 'title', 'registered_date', 'expiration_date', 'is_coach', 'is_referee')
        }),
        ('Contact de urgență', {
            'fields': ('emergency_contact_name', 'emergency_contact_phone')
        }),
        ('Rezultate echipe', {
            'fields': ('team_results_summary',)
        }),
        # Team results are shown via the AthleteTeamResultsInline instead of a custom field
        ('Flux de aprobare', {
            'fields': ('status', 'submitted_date_display', 'reviewed_date_display', 'reviewed_by', 'add_enrolled_event_link', 'add_grade_history_link')
        }),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            'club',
            'city',
            'current_grade',
            'user',
            'reviewed_by',
            'approved_by',
        )

    def full_name_link(self, obj):
        try:
            url = reverse('admin:api_athlete_change', args=(obj.pk,))
            name = f"{getattr(obj, 'first_name', '')} {getattr(obj, 'last_name', '')}".strip() or f"Sportiv #{obj.pk}"
            return format_html('<a href="{}">{}</a>', url, name)
        except Exception:
            return f"{getattr(obj, 'first_name', '')} {getattr(obj, 'last_name', '')}".strip() or '—'
    full_name_link.short_description = _('Nume')
    full_name_link.admin_order_field = 'first_name'

    def club_display(self, obj):
        try:
            return obj.club.name if getattr(obj, 'club', None) else '—'
        except Exception:
            return '—'
    club_display.short_description = _('Club')
    club_display.admin_order_field = 'club__name'

    def current_grade_display_readonly(self, obj):
        if not obj or not obj.current_grade:
            return '—'
        return obj.current_grade.name
    current_grade_display_readonly.short_description = _('Grad curent')

    def submitted_date_display(self, obj):
        if not obj or not obj.submitted_date:
            return '—'
        return obj.submitted_date
    submitted_date_display.short_description = _('Data trimiterii')

    def reviewed_date_display(self, obj):
        if not obj or not obj.reviewed_date:
            return '—'
        return obj.reviewed_date
    reviewed_date_display.short_description = _('Data revizuirii')
    
    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}"
    get_full_name.short_description = _('Nume')
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
    grade_display.short_description = 'Grad'
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
    profile_image_thumbnail.short_description = _('Fotografie')
    profile_image_thumbnail.allow_tags = True
    
    def user_email(self, obj):
        return obj.user.email if obj.user else 'Fără utilizator'
    user_email.short_description = _('Email')
    user_email.admin_order_field = 'user__email'

    def team_results_summary(self, obj):
        if not obj or not obj.pk:
            return '—'

        results = (
            CategoryAthleteScore.objects
            .filter(type='teams')
            .filter(models.Q(athlete=obj) | models.Q(team_members=obj))
            .select_related('category__event')
            .prefetch_related('team_members')
            .distinct()
        )

        if not results.exists():
            return '—'

        items = []
        for result in results:
            event_name = getattr(getattr(result.category, 'event', None), 'title', '—')
            category_name = getattr(result.category, 'name', '—')
            team_name = result.team_name or ', '.join(
                f"{member.first_name} {member.last_name}" for member in result.team_members.all()
            ) or '—'
            placement = result.placement_claimed or '—'
            status_value = result.get_status_display() if hasattr(result, 'get_status_display') else (result.status or '—')
            items.append(
                format_html(
                    '<li><strong>{}</strong> — {} — {} — loc: {} — status: {}</li>',
                    event_name,
                    category_name,
                    team_name,
                    placement,
                    status_value,
                )
            )

        return format_html('<ul style="margin:0;padding-left:18px;">{}</ul>', mark_safe(''.join(str(item) for item in items)))
    team_results_summary.short_description = _('Rezultate echipe')
    
    def get_action_buttons(self, obj):
        if obj.status == 'pending':
            approve_url = reverse('admin:api_athlete_approve', args=(obj.pk,))
            reject_url = reverse('admin:api_athlete_reject', args=(obj.pk,))
            revision_url = reverse('admin:api_athlete_request_revision', args=(obj.pk,))
            return format_html(
                '<a class="button" href="{}">{}</a> '
                '<a class="button" href="{}">{}</a> '
                '<a class="button" href="{}">{}</a>',
                approve_url, _('Aprobă'), reject_url, _('Respinge'), revision_url, _('Solicită revizuirea')
            )
        return obj.get_status_display()
    get_action_buttons.short_description = _('Acțiuni')
    
    # Team results are displayed via `team_results_summary()` to avoid M2M inline validation issues.

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

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        formfield = super().formfield_for_foreignkey(db_field, request, **kwargs)
        if not formfield:
            return formfield

        if db_field.name in {
            'user',
            'club',
            'city',
            'current_grade',
            'federation_role',
            'title',
            'reviewed_by',
            'approved_by',
        }:
            widget = formfield.widget
            for attr in ('can_add_related', 'can_change_related', 'can_delete_related', 'can_view_related'):
                if hasattr(widget, attr):
                    setattr(widget, attr, False)

        return formfield

    def changeform_view(self, request, object_id=None, form_url='', extra_context=None):
        response = super().changeform_view(request, object_id, form_url, extra_context)

        if request.method == 'POST' and isinstance(response, TemplateResponse):
            context = getattr(response, 'context_data', {}) or {}
            errors = []

            adminform = context.get('adminform')
            if adminform is not None:
                form = getattr(adminform, 'form', None)
                if form is not None:
                    errors.extend(str(error) for error in form.non_field_errors())
                    for field_name, field_errors in form.errors.items():
                        if field_name == '__all__':
                            continue
                        label = field_name
                        try:
                            label = form.fields[field_name].label or field_name
                        except Exception:
                            pass
                        errors.extend(f'{label}: {error}' for error in field_errors)

            for inline_admin_formset in context.get('inline_admin_formsets', []) or []:
                opts = getattr(inline_admin_formset, 'opts', None)
                inline_label = getattr(opts, 'verbose_name_plural', None) or getattr(opts, 'verbose_name', None) or 'Inline'
                formset = getattr(inline_admin_formset, 'formset', None)
                if formset is not None:
                    errors.extend(f'{inline_label}: {error}' for error in formset.non_form_errors())

                for inline_admin_form in inline_admin_formset:
                    form = getattr(inline_admin_form, 'form', None)
                    if form is None:
                        continue
                    errors.extend(f'{inline_label}: {error}' for error in form.non_field_errors())
                    for field_name, field_errors in form.errors.items():
                        if field_name == '__all__':
                            continue
                        label = field_name
                        try:
                            label = form.fields[field_name].label or field_name
                        except Exception:
                            pass
                        errors.extend(f'{inline_label} — {label}: {error}' for error in field_errors)

            unique_errors = []
            seen = set()
            for error in errors:
                normalized = str(error).strip()
                if normalized and normalized not in seen:
                    seen.add(normalized)
                    unique_errors.append(normalized)

            if unique_errors:
                messages.error(request, ' | '.join(unique_errors[:8]))

        return response
    
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
                messages.error(request, 'Selectează un fișier Excel pentru încărcare.')
                return render(request, 'admin/athlete_import_excel.html', {
                    'title': 'Importă sportivi din Excel',
                })
            
            try:
                service = ExcelImportService()
                result = service.import_athletes(excel_file, dry_run=dry_run)
                
                if dry_run:
                    messages.info(request, 'Validare finalizată (nu au fost salvate date):')
                    messages.success(request, f"✓ {result['created']} sportivi pregătiți pentru creare")
                    messages.success(request, f"✓ {result['updated']} sportivi pregătiți pentru actualizare")
                    if result['errors']:
                        messages.warning(request, f"⚠ {len(result['errors'])} erori găsite")
                        for error in result['errors'][:10]:  # Show first 10 errors
                            messages.error(request, f"Rândul {error.get('row', '?')}: {error.get('error', 'Eroare necunoscută')}")
                else:
                    messages.success(request, 'Import finalizat!')
                    messages.success(request, f"✓ Au fost creați {result['created']} sportivi noi")
                    messages.success(request, f"✓ Au fost actualizați {result['updated']} sportivi existenți")
                    if result['errors']:
                        messages.warning(request, f"⚠ {len(result['errors'])} rânduri au avut erori")
                        for error in result['errors'][:10]:
                            messages.error(request, f"Rândul {error.get('row', '?')}: {error.get('error', 'Eroare necunoscută')}")
                
                # Show detailed results
                context = {
                    'title': 'Rezultate import',
                    'result': result,
                    'dry_run': dry_run,
                }
                return render(request, 'admin/athlete_import_results.html', context)
                
            except Exception as e:
                messages.error(request, f'Importul a eșuat: {str(e)}')
                return render(request, 'admin/athlete_import_excel.html', {
                    'title': 'Importă sportivi din Excel',
                })
        
        # GET request - show upload form
        return render(request, 'admin/athlete_import_excel.html', {
            'title': 'Importă sportivi din Excel',
        })

    def add_enrolled_event_link(self, obj):
        """Render a button that opens the TrainingSeminarParticipation add form with this athlete pre-filled."""
        if not obj or not obj.pk:
            return ''
        try:
            url = reverse('admin:api_trainingseminarparticipation_add') + f'?athlete={obj.pk}'
            return format_html('<a class="button" href="{}">Adaugă eveniment înscris</a>', url)
        except Exception:
            return ''
    add_enrolled_event_link.short_description = _('Adaugă înscriere')

    def add_grade_history_link(self, obj):
        """Render a button that opens the GradeHistory add form with this athlete pre-filled."""
        if not obj or not obj.pk:
            return ''
        try:
            url = reverse('admin:api_gradehistory_add') + f'?athlete={obj.pk}'
            return format_html('<a class="button" href="{}">Adaugă istoric grad</a>', url)
        except Exception:
            return ''
    add_grade_history_link.short_description = _('Adaugă grad')
    
    def approve_profile(self, request, pk):
        from django.shortcuts import get_object_or_404, redirect
        from django.contrib import messages
        from django.utils import timezone
        
        athlete = get_object_or_404(Athlete, pk=pk)
        
        if athlete.status != 'pending':
            messages.error(request, f'Profilul sportivului nu este în starea în așteptare (curent: {athlete.status})')
            return redirect('admin:api_athlete_changelist')
        
        try:
            # Use the approve method from the consolidated model
            athlete.approve(request.user)
            
            messages.success(request, f'Profilul sportivului {athlete.first_name} {athlete.last_name} a fost aprobat cu succes')
            
        except Exception as e:
            messages.error(request, f'Eroare la aprobarea profilului sportivului: {str(e)}')
        
        return redirect('admin:api_athlete_changelist')
    
    def reject_profile(self, request, pk):
        from django.shortcuts import get_object_or_404, redirect
        from django.contrib import messages
        from django.utils import timezone
        
        athlete = get_object_or_404(Athlete, pk=pk)
        
        if athlete.status != 'pending':
            messages.error(request, f'Profilul sportivului nu este în starea în așteptare (curent: {athlete.status})')
            return redirect('admin:api_athlete_changelist')
        
        if request.method == 'POST':
            rejection_reason = request.POST.get('admin_notes', '')
            
            # Use the reject method from the consolidated model
            athlete.reject(request.user, rejection_reason)
            
            messages.success(request, f'Profilul sportivului {athlete.first_name} {athlete.last_name} a fost respins cu succes')
            return redirect('admin:api_athlete_changelist')
        
        # Show rejection form
        context = {
            'profile': athlete,
            'title': f'Respinge profilul: {athlete.first_name} {athlete.last_name}',
        }
        return render(request, 'admin/reject_profile.html', context)
    
    def request_revision(self, request, pk):
        from django.shortcuts import get_object_or_404, redirect
        from django.contrib import messages
        from django.utils import timezone
        
        athlete = get_object_or_404(Athlete, pk=pk)
        
        if athlete.status != 'pending':
            messages.error(request, f'Profilul sportivului nu este în starea în așteptare (curent: {athlete.status})')
            return redirect('admin:api_athlete_changelist')
        
        if request.method == 'POST':
            revision_notes = request.POST.get('admin_notes', '')
            
            # Use the request_revision method from the consolidated model
            athlete.request_revision(request.user, revision_notes)
            
            messages.success(request, f'A fost solicitată revizuirea pentru {athlete.first_name} {athlete.last_name}')
            return redirect('admin:api_athlete_changelist')
        
        # Show revision request form
        context = {
            'profile': athlete,
            'title': f'Solicită revizuirea: {athlete.first_name} {athlete.last_name}',
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
    verbose_name = _('Scor arbitru')
    verbose_name_plural = _('Scoruri arbitri (5 necesare)')
    
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
        label='Echipă',
        help_text='Selectează o echipă existentă pentru categoriile pe echipe'
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
        self.fields['athlete'].help_text = 'Selectează sportivul pentru categoriile solo/luptă. Lasă gol pentru scorurile pe echipe.'
        
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
                raise forms.ValidationError('Pentru scorurile pe echipe trebuie să selectezi o echipă.')
        elif score_type in ['solo', 'fight']:
            if not athlete:
                raise forms.ValidationError(f'Pentru categoriile de tip {score_type} trebuie să selectezi un sportiv.')
        
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
        ('Informații de bază', {
            'fields': ('category', 'type', 'group', 'submitted_by_athlete')
        }),
        ('Selectează participantul', {
            'fields': ('athlete', 'existing_team'),
            'description': 'Pentru solo/luptă: selectează sportivul. Pentru echipe: selectează o echipă existentă (creată din administrarea echipelor).',
        }),
        ('Arbitraj', {
            'fields': ('get_calculated_score_display', 'get_referee_count'),
            'description': 'Adaugă scorurile arbitrilor în secțiunea de mai jos. Scorul final exclude valoarea maximă și minimă.',
        }),
        ('Detalii trimitere sportiv', {
            'fields': ('placement_claimed', 'notes', 'certificate_image', 'result_document'),
            'description': 'Folosit când sportivii își trimit propriile rezultate și clasarea revendicată',
            'classes': ('collapse',)
        }),
        ('Status aprobare', {
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
                form.base_fields['score'].help_text = 'Scorul nu este obligatoriu pentru trimiterile proprii ale sportivilor; accentul cade pe locul revendicat.'
        
        return form
    
    def get_athlete_name(self, obj):
        """Display athlete name or team name"""
        if obj.team_name and obj.team_members.exists():
            member_count = obj.team_members.count()
            return f"Echipă: {obj.team_name} ({member_count} membri)" if member_count > 0 else f"Echipă: {obj.team_name}"
        elif obj.athlete:
            return f"{obj.athlete.first_name} {obj.athlete.last_name}"
        return "N/A"
    get_athlete_name.short_description = _('Sportiv / Echipă')
    get_athlete_name.admin_order_field = 'athlete__first_name'
    
    def get_competition_name(self, obj):
        if obj.category and obj.category.event:
            return obj.category.event.title
        return "N/A"
    get_competition_name.short_description = _('Eveniment')
    # Keep admin ordering keyed to the legacy competition name for now; Event ordering could be added later
    get_competition_name.admin_order_field = 'category__competition__name'
    
    def get_category_name(self, obj):
        return obj.category.name
    get_category_name.short_description = _('Categorie')
    get_category_name.admin_order_field = 'category__name'
    
    def get_submission_type(self, obj):
        if obj.submitted_by_athlete:
            return f"Trimis de sportiv ({obj.placement_claimed or 'Fără clasare'})"
        else:
            return f"Scor arbitru ({obj.score})"
    get_submission_type.short_description = _('Tip')
    
    def get_calculated_score(self, obj):
        """Display calculated score in list view"""
        from .models import FightCategory
        if isinstance(obj.category, FightCategory):
            return f'⚠ {obj.referee_score_count}/5 scoruri'
        score = obj.calculated_score
        if score is None:
            return 'N/A'
        return f'✓ {score:.2f}'
    get_calculated_score.short_description = _('Scor final')

    
    def get_calculated_score_display(self, obj):
        """Display calculated score with details in change form"""
        from .models import FightCategory
        if isinstance(obj.category, FightCategory):
            return mark_safe('<em>Nu se aplică (doar pentru categoriile solo/echipe)</em>')
        
        score = obj.calculated_score
        count = obj.referee_score_count
        
        if score is None:
            if count == 0:
                return mark_safe('<strong style="color: red;">Nu au fost trimise încă scoruri de arbitraj</strong>')
            else:
                return format_html(
                    '<strong style="color: orange;">Incomplet: {}/{} scoruri de arbitraj trimise</strong><br>'
                    '<em>Sunt necesare cel puțin 3 scoruri pentru calcul (ideal 5)</em>',
                    count, 5
                )
        
        # Get all scores to show breakdown
        scores = list(obj.referee_scores.values_list('score', flat=True))
        sorted_scores = sorted(scores)
        
        if len(scores) >= 5:
            excluded = [sorted_scores[0], sorted_scores[-1]]
            breakdown = f'Scoruri: {", ".join(str(s) for s in sorted_scores)} | Excluse: {excluded[0]}, {excluded[1]}'
        elif len(scores) == 4:
            excluded = [sorted_scores[-1]]
            breakdown = f'Scoruri: {", ".join(str(s) for s in sorted_scores)} | Exclus maximul: {excluded[0]}'
        else:
            breakdown = f'Scoruri: {", ".join(str(s) for s in sorted_scores)} | Toate sunt incluse (sunt necesare 5 pentru calculul complet)'
        
        return format_html(
            '<strong style="font-size: 16px;">Scor final: {:.2f}</strong><br>'
            '<em style="color: #666;">{}</em>',
            score, breakdown
        )
    get_calculated_score_display.short_description = _('Scor final calculat')
    
    def get_referee_count(self, obj):
        """Display referee score count with validation status"""
        from .models import FightCategory
        if isinstance(obj.category, FightCategory):
            return mark_safe('<em>N/A</em>')
        
        count = obj.referee_score_count
        if count == 5:
            return format_html('<strong style="color: green;">Complet ({}/5)</strong>', count)
        elif count >= 3:
            return format_html('<strong style="color: orange;">Parțial ({}/5)</strong>', count)
        else:
            return format_html('<strong style="color: red;">Incomplet ({}/5)</strong>', count)
    get_referee_count.short_description = _('Scoruri arbitri')
    
    def get_action_buttons(self, obj):
        if obj.submitted_by_athlete and obj.status == 'pending':
            return format_html(
                '<a class="button" href="{}/approve/">Aprobă</a> '
                '<a class="button" href="{}/reject/">Respinge</a> '
                '<a class="button" href="{}/request_revision/">Solicită revizuirea</a>',
                obj.pk, obj.pk, obj.pk
            )
        elif obj.status == 'approved':
            return mark_safe('<span style="color: green;">Aprobat</span>')
        elif obj.status == 'rejected':
            return mark_safe('<span style="color: red;">Respins</span>')
        elif obj.status == 'revision_required':
            return mark_safe('<span style="color: orange;">Revizuire necesară</span>')
        elif not obj.submitted_by_athlete:
            return mark_safe('<span style="color: blue;">Înregistrare arbitru</span>')
        return ''
    get_action_buttons.short_description = _('Acțiuni')
    
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
            messages.error(request, f'Scorul nu este în starea în așteptare (curent: {score.status})')
            return redirect('admin:api_categoryathletescore_changelist')
        
        try:
            score.approve(request.user)
            messages.success(request, f'Rezultatul pentru {score.athlete} a fost aprobat cu succes')
        except Exception as e:
            messages.error(request, f'Eroare la aprobarea rezultatului: {str(e)}')
        
        return redirect('admin:api_categoryathletescore_changelist')
    
    def reject_score(self, request, pk):
        from django.shortcuts import get_object_or_404, redirect
        from django.contrib import messages
        
        score = get_object_or_404(CategoryAthleteScore, pk=pk)
        
        if score.status != 'pending':
            messages.error(request, f'Scorul nu este în starea în așteptare (curent: {score.status})')
            return redirect('admin:api_categoryathletescore_changelist')
        
        if request.method == 'POST':
            rejection_reason = request.POST.get('admin_notes', '')
            score.reject(request.user, rejection_reason)
            messages.success(request, f'Rezultatul pentru {score.athlete} a fost respins cu succes')
            return redirect('admin:api_categoryathletescore_changelist')
        
        # Show rejection form
        context = {
            'score': score,
            'title': f'Respinge rezultatul: {score.category.name} - {score.athlete}',
        }
        return render(request, 'admin/reject_score.html', context)
    
    def request_revision(self, request, pk):
        from django.shortcuts import get_object_or_404, redirect
        from django.contrib import messages
        
        score = get_object_or_404(CategoryAthleteScore, pk=pk)
        
        if score.status != 'pending':
            messages.error(request, f'Scorul nu este în starea în așteptare (curent: {score.status})')
            return redirect('admin:api_categoryathletescore_changelist')
        
        if request.method == 'POST':
            revision_notes = request.POST.get('admin_notes', '')
            score.request_revision(request.user, revision_notes)
            messages.success(request, f'A fost solicitată revizuirea pentru {score.athlete}')
            return redirect('admin:api_categoryathletescore_changelist')
        
        # Show revision request form
        context = {
            'score': score,
            'title': f'Solicită revizuirea: {score.category.name} - {score.athlete}',
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
