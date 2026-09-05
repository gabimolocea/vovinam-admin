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
            from ..models import Category
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
            from ..models import FightCategory, SoloCategory
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
        from ..models import FightCategory, SoloCategory, TeamCategory
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
    from ..models import Visa

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
        from ..models import Visa
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
        def save_new(self, form, commit=True):
            obj = super().save_new(form, commit=False)
            event = getattr(self, 'instance', None)
            if event:
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
            url = reverse('admin:api_athlete_change', args=(obj.athlete.pk,))
            return format_html('<a href="{}">{} {}</a>', url, obj.athlete.first_name, obj.athlete.last_name)
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
    from ..models import Event
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
                """Ensure event/seminar FKs are set for event participations."""
                if formset.model is TrainingSeminarParticipation:
                    event = form.instance
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
                from ..competition_defaults import ensure_standard_competition_groups_and_categories

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
                    # `seminar` mirrors `event` (both FK to landing.Event); no
                    # separate legacy table exists to populate here.
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
            from ..models import EventParticipation
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
                    from ..models import MatchRefereeAssignment
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
                from ..models import MatchRefereeAssignment
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
            return format_html('<span style="color: #999;">Fără scor</span>')
        return '-'
    
    @admin.display(description='R2')
    def get_r2_score(self, obj):
        """Display R2 score with edit link"""
        if obj.pk:
            score = obj.get_referee_score(2)
            if score is not None:
                return format_html('{:.2f}', score)
            return format_html('<span style="color: #999;">Fără scor</span>')
        return '-'
    
    @admin.display(description='R3')
    def get_r3_score(self, obj):
        """Display R3 score with edit link"""
        if obj.pk:
            score = obj.get_referee_score(3)
            if score is not None:
                return format_html('{:.2f}', score)
            return format_html('<span style="color: #999;">Fără scor</span>')
        return '-'
    
    @admin.display(description='R4')
    def get_r4_score(self, obj):
        """Display R4 score with edit link"""
        if obj.pk:
            score = obj.get_referee_score(4)
            if score is not None:
                return format_html('{:.2f}', score)
            return format_html('<span style="color: #999;">Fără scor</span>')
        return '-'
    
    @admin.display(description='R5')
    def get_r5_score(self, obj):
        """Display R5 score with edit link"""
        if obj.pk:
            score = obj.get_referee_score(5)
            if score is not None:
                return format_html('{:.2f}', score)
            return format_html('<span style="color: #999;">Fără scor</span>')
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
    verbose_name_plural = _('REZULTATE ECHIPE')
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
                        from ..models import CategoryAthleteScore
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

class FightAthleteWeightInline(admin.TabularInline):
    """Inline for managing enrolled athletes and their weight data in fight categories"""
    model = FightAthleteWeight
    extra = 1
    fields = ('athlete', 'pre_weight_kg', 'current_weight_kg', 'is_disqualified', 'disqualification_reason', 'place')
    autocomplete_fields = ['athlete']
    verbose_name = _('Sportiv înscris')
    verbose_name_plural = _('Sportivi înscriși')


class TeamAdminForm(forms.ModelForm):
    """Custom form for Team that excludes the name property"""
    class Meta:
        model = Team
        exclude = ['categories']  # Only exclude many-to-many, name is handled automatically as property

class RefereePointEventInline(admin.TabularInline):
    from ..models import RefereePointEvent
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
                from ..validators import validate_referee_point_event_metadata
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
            from ..models import Athlete
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

