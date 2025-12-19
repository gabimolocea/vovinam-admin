from django.contrib import admin, messages
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _
from django.forms import ModelForm
from django.core.exceptions import ValidationError
from django import forms
from django.urls import path, reverse
from django.shortcuts import render
from django.http import JsonResponse
from django.db.models import Count
from django.db.models.functions import TruncMonth
import datetime
import json
import urllib.parse
from django.utils.safestring import mark_safe
from .models import (
    City,
    Club,
    Athlete,
    AthleteActivity,
    CategoryScoreActivity,
    SupporterAthleteRelation,
    TrainingSeminar,
    TrainingSeminarParticipation,
    Grade,
    GradeHistory,
    Title,
    FederationRole,
    Competition,
    Category,
    Team,
    CategoryTeam,
    CategoryAthlete,
    Match,
    RefereeScore,
    RefereePointEvent,
    CategoryAthleteScore,
    CategoryTeamScore,
    # CategoryTeamAthleteScore, # deprecated - consolidated into CategoryAthleteScore
    TeamMember,
    Group,
)

# Optional grouping configuration used by the admin grouping template tag.
# Map a user-facing group title to a list of model names (object names).
# Update this dict to control how models under the `api` app are grouped.
ADMIN_MODEL_GROUPS = {
    'People': ['Athlete', 'User', 'Club'],
    'Events & Content': ['Event', 'NewsPost'],
    'Administration': ['City', 'Title', 'FederationRole'],
}
# NOTE: Event proxy registration moved further down after inlines are defined
# so we can inject participation inlines into the Event admin. See below.


class AthleteInline(admin.TabularInline):
    model = Athlete
    # Read-only inline: show Name (first + last), Grade and Registered date.
    # Removing the `select_existing` column per request.
    fields = ('name', 'grade', 'registered_date_display')
    readonly_fields = ('name', 'grade', 'registered_date_display')
    extra = 0
    verbose_name = _('Athlete')
    verbose_name_plural = _('Athletes')
    can_delete = False

    def name(self, obj):
        try:
            # Link to the athlete change page in the admin so clicking the name opens the profile
            url = reverse('admin:api_athlete_change', args=(obj.pk,))
            return format_html('<a href="{}">{} {}</a>', url, obj.first_name, obj.last_name)
        except Exception:
            return ''
    name.short_description = _('Name')

    def grade(self, obj):
        try:
            return str(obj.current_grade) if obj.current_grade else ''
        except Exception:
            return ''
    grade.short_description = _('Grade')

    def registered_date_display(self, obj):
        try:
            return obj.registered_date.strftime('%Y-%m-%d') if obj and obj.registered_date else ''
        except Exception:
            return ''
    registered_date_display.short_description = _('Registered date')

    def has_add_permission(self, request, obj=None):
        # Disable adding athletes inline from the Club page. Use the Athlete add form.
        return False

class CategoryAthleteInline(admin.TabularInline):
    model = CategoryAthlete
    extra = 0
    autocomplete_fields = ['athlete']  # Enable autocomplete for the athlete field
    verbose_name = _('Athlete')
    verbose_name_plural = _('Athletes')

    def get_formset(self, request, obj=None, **kwargs):
        """
        Dynamically adjust the inline title and fields based on the parent model.
        """
        if isinstance(obj, Category):
            if obj.type == 'fight':
                self.verbose_name = _('Athlete')
                self.verbose_name_plural = _('ENROLLED ATHLETES')
                self.fields = ('athlete', 'weight')  # Only include actual fields from the model
                self.readonly_fields = ('category_with_competition', 'category_type')  # Computed fields are read-only
            elif obj.type == 'solo':
                self.verbose_name = _('Enrolled Athlete')
                self.verbose_name_plural = _('Enrolled Athletes')

            else:
                self.verbose_name = _('Competition History')
                self.verbose_name_plural = _('Add another Competition History')
                self.fields = ('category_with_competition', 'category_type', 'weight')  # Only include actual fields from the model
                self.readonly_fields = ('athlete_with_club', 'category_with_competition', 'category_type', 'weight')  # Computed fields are read-only
        return super().get_formset(request, obj, **kwargs)

    def athlete_with_club(self, obj):
        """
        Display the athlete's name along with their club.
        """
        if obj.athlete.club:
            return f"{obj.athlete.first_name} {obj.athlete.last_name} ({obj.athlete.club.name})"
        return f"{obj.athlete.first_name} {obj.athlete.last_name}"
    athlete_with_club.short_description = _('Athlete (Club)')

    def category_with_competition(self, obj):
        """
        Display the category name along with its competition.
        """
        return f"{obj.category.name} ({obj.category.competition.name})"
    category_with_competition.short_description = _('Category (Competition)')

    def category_type(self, obj):
        """
        Display the type of the category.
        """
        return obj.category.type.capitalize()
    category_type.short_description = _('Category Type')


# Custom Team Results display - using the improved approach from before
# Since Django admin inlines have limitations with ManyToMany relationships,
# we'll use the custom field display method in the main AthleteAdmin

# Inline GradeHistory for Athlete
class GradeHistoryInline(admin.TabularInline):
    model = GradeHistory
    fk_name = 'athlete'
    extra = 0
    fields = ('grade', 'obtained_date', 'level', 'event', 'examiner_1', 'examiner_2', 'status')
    readonly_fields = ('grade', 'obtained_date', 'level', 'event', 'examiner_1', 'examiner_2', 'status')
    show_change_link = True
    can_delete = True

    def has_add_permission(self, request, obj=None):
        return False

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
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
        list_display = ('athlete', 'visa_type', 'issued_date', 'visa_status', 'status', 'submitted_date')
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

# Legacy MedicalVisa/AnnualVisa inlines and admin unregistration removed — use unified Visa instead.


# Unified Visa inline to replace MedicalVisaInline and AnnualVisaInline
class VisaInline(admin.TabularInline):
    try:
        from .models import Visa
    except Exception:
        Visa = None
    model = Visa
    extra = 0
    fields = ('visa_type', 'issued_date', 'visa_status', 'document', 'image', 'notes')
    readonly_fields = ('visa_type', 'issued_date', 'visa_status', 'document', 'image', 'notes')
    show_change_link = True
    can_delete = True
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

# Inline TrainingSeminar for Athlete
class TrainingSeminarInline(admin.TabularInline):
    model = TrainingSeminar.athletes.through  # Use the through table for the Many-to-Many relationship
    extra = 0  # Display only existing entries
    show_change_link = False  # Do not show change link because seminars are managed via Event
    verbose_name = _('TRAINING SEMINAR')
    verbose_name_plural = _('TRAINING SEMINARS')


class TrainingSeminarParticipationInline(admin.TabularInline):
    """Show approved participation (enrolled) athletes on the TrainingSeminar admin page.

    Use a StackedInline instead of TabularInline to avoid wide table columns that
    cause horizontal scrolling in the admin change form. StackedInline displays
    each enrollment vertically so all fields are visible without horizontal scroll.
    """
    model = TrainingSeminarParticipation
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
    extra = 1
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

    # Create an API-specific EventAdmin that appends the participation inline.
    # Be careful with types: LandingEventAdmin.inlines may be a tuple, so coerce to list.
    try:
        base_inlines = list(getattr(LandingEventAdmin, 'inlines', []) or [])
        new_inlines = base_inlines + [TrainingSeminarParticipationInline]
        APILandingEventAdmin = type(
            'APILandingEventAdmin',
            (LandingEventAdmin,),
            {'inlines': new_inlines}
        )
        admin.site.register(Event, APILandingEventAdmin)
        try:
            # Also register the concrete LandingEvent with its admin so that
            # autocomplete_fields referencing 'landing.Event' can pass system checks.
            # If LandingEvent is already registered this will raise and be ignored.
            admin.site.register(LandingEvent, LandingEventAdmin)
        except Exception:
            pass
        # Keep the concrete LandingEvent admin registered for autocomplete/lookups
        # but hide it from the admin index so admins manage Events via the API
        # proxy only. We register a lightweight subclass that returns False for
        # has_module_perms which prevents the model from appearing in the app index.
        try:
            class _HiddenLandingEventAdmin(LandingEventAdmin):
                def has_module_perms(self, request):
                    return False

            # Re-register with hidden admin; if already registered this may fail
            try:
                admin.site.unregister(LandingEvent)
            except Exception:
                pass
            admin.site.register(LandingEvent, _HiddenLandingEventAdmin)
        except Exception:
            # If anything goes wrong, leave the existing registration as-is
            pass
        # If registration succeeded, enable autocomplete on the Athlete inline's
        # `event` field so the inline shows a dropdown/autocomplete for Events.
        try:
            # Prefer autocomplete (type-ahead) for a better UX. Remove raw_id_fields
            # if present and set autocomplete_fields. Guard in case of migrations.
            if hasattr(AthleteTrainingSeminarParticipationInline, 'raw_id_fields'):
                try:
                    delattr(AthleteTrainingSeminarParticipationInline, 'raw_id_fields')
                except Exception:
                    pass
            AthleteTrainingSeminarParticipationInline.autocomplete_fields = ('event',)
        except Exception:
            # Don't let this block admin registration during migrations
            pass
    except Exception:
        # Fall back to registering using the original LandingEventAdmin; keep startup stable
        try:
            admin.site.register(Event, LandingEventAdmin)
            try:
                # Ensure the concrete LandingEvent is registered too (fallback path)
                admin.site.register(LandingEvent, LandingEventAdmin)
            except Exception:
                pass
            try:
                # Also enable autocomplete when registering via the fallback.
                if hasattr(AthleteTrainingSeminarParticipationInline, 'raw_id_fields'):
                    try:
                        delattr(AthleteTrainingSeminarParticipationInline, 'raw_id_fields')
                    except Exception:
                        pass
                AthleteTrainingSeminarParticipationInline.autocomplete_fields = ('event',)
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
                    # Try to infer the original TrainingSeminar id from the
                    # Event.tags that were set during migration: tags start with
                    # 'migrated_from_trainingseminar:<id>' when present.
                    ts = None
                    try:
                        tags = (getattr(event, 'tags', None) or '')
                        if tags.startswith('migrated_from_trainingseminar:'):
                            try:
                                ts_pk = int(tags.split(':', 1)[1])
                                from .models import TrainingSeminar
                                ts = TrainingSeminar.objects.filter(pk=ts_pk).first()
                            except Exception:
                                ts = None
                    except Exception:
                        ts = None

                    # Fallback: try to match by name
                    if not ts:
                        try:
                            from .models import TrainingSeminar
                            ts = TrainingSeminar.objects.filter(name__iexact=getattr(event, 'title', '')).first()
                        except Exception:
                            ts = None

                    # As a last resort, create a lightweight TrainingSeminar so
                    # the DB FK constraint is satisfied. This keeps the admin
                    # UX smooth and preserves a traceable Seminar row.
                    if not ts:
                        try:
                            from .models import TrainingSeminar
                            ev_start = getattr(event, 'start_date', None)
                            ev_end = getattr(event, 'end_date', None)
                            ev_place = getattr(event, 'address', '') or ''
                            ts = TrainingSeminar.objects.create(
                                name=(getattr(event, 'title', None) or f"Migrated from Event {event.pk}"),
                                start_date=(ev_start.date() if hasattr(ev_start, 'date') else ev_start),
                                end_date=(ev_end.date() if hasattr(ev_end, 'date') else ev_end),
                                place=ev_place,
                            )
                        except Exception:
                            ts = None

                    if ts:
                        cleaned['seminar'] = ts

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

                if not cleaned.get('seminar'):
                    raise ValidationError({'seminar': 'Seminar could not be determined from the selected event. Please select a seminar.'})

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
    autocomplete_fields = ['red_corner', 'blue_corner', 'winner']  # Enable autocomplete for these fields
    # Show a quick link to open the full Match change page so admins can view/edit
    # the match details directly from the Category change form.
    fields = ('match_type', 'red_corner', 'blue_corner', 'winner', 'match_link')  # Do not show referees
    readonly_fields = ('winner', 'match_link')
    show_change_link = False
    verbose_name = "Match"
    verbose_name_plural = "Matches"

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
    autocomplete_fields = ['referee']
    # Show per-round columns (3 rounds default) plus totals and adjusted totals
    # Use a custom form so per-round fields are editable and saved as events.
    class RefereeScoreForm(forms.ModelForm):
        red_round_1 = forms.IntegerField(required=False, min_value=0, label='Red R1')
        red_round_2 = forms.IntegerField(required=False, min_value=0, label='Red R2')
        red_round_3 = forms.IntegerField(required=False, min_value=0, label='Red R3')
        blue_round_1 = forms.IntegerField(required=False, min_value=0, label='Blue R1')
        blue_round_2 = forms.IntegerField(required=False, min_value=0, label='Blue R2')
        blue_round_3 = forms.IntegerField(required=False, min_value=0, label='Blue R3')

        class Meta:
            model = RefereeScore
            # Make total fields read-only in the form; per-round inputs are provided separately
            fields = ('referee', 'winner')

        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
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

    form = RefereeScoreForm
    fields = (
        'referee',
        'red_round_1', 'red_round_2', 'red_round_3', 'red_total',
        'blue_round_1', 'blue_round_2', 'blue_round_3', 'blue_total',
        'winner_combined',
    )
    # per-round inputs are editable on the form; totals and computed displays are read-only
    readonly_fields = ('red_total', 'blue_total', 'winner_combined')

    class Media:
        css = {
            'all': ('admin/css/referee_rounds_narrow.css',)
        }

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
    red_round_1.short_description = _('Red R1')

    def red_round_2(self, obj):
        return self._red_round(obj, 2)
    red_round_2.short_description = _('Red R2')

    def red_round_3(self, obj):
        return self._red_round(obj, 3)
    red_round_3.short_description = _('Red R3')

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
    blue_round_1.short_description = _('Blue R1')

    def blue_round_2(self, obj):
        return self._blue_round(obj, 2)
    blue_round_2.short_description = _('Blue R2')

    def blue_round_3(self, obj):
        return self._blue_round(obj, 3)
    blue_round_3.short_description = _('Blue R3')

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


class CentralPenaltyInline(admin.TabularInline):
    """Editable inline on Match for creating and editing central penalty events.

    Inline enforces that saved rows are penalty events and marks them as
    central in metadata so the scoring helper treats them accordingly.
    """
    model = RefereePointEvent
    extra = 1
    fields = ('referee', 'side', 'points', 'metadata', 'created_by', 'timestamp')
    readonly_fields = ('created_by', 'timestamp')
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

class CategoryAthleteScoreInline(admin.TabularInline):
    model = CategoryAthleteScore  # Ensure this model exists in your models.py
    extra = 0
    autocomplete_fields = ['athlete', 'referee']  # Enable autocomplete for athlete and referee fields
    fields = ('athlete', 'referee', 'score')  # Display athlete, referee, and score fields
    verbose_name = _('Athlete Score')
    verbose_name_plural = _('Athlete Scores')

class CategoryTeamScoreInline(admin.TabularInline):
    model = CategoryTeamScore  # Ensure this model exists in your models.py
    extra = 0
    autocomplete_fields = ['team', 'referee']  # Enable autocomplete for team and referee fields
    fields = ('team', 'referee', 'score')  # Display team, referee, and score fields
    verbose_name = _('Team Score')
    verbose_name_plural = _('Team Scores')

class TeamMemberInline(admin.TabularInline):
    model = TeamMember
    extra = 1  # Allow adding new athletes to the team
    verbose_name = _('Team Member')
    verbose_name_plural = _('Team Members')

class EnrolledTeamsInline(admin.TabularInline):
    model = CategoryTeam
    extra = 1  # Allow adding new teams
    fields = ('team', 'place_obtained')
    readonly_fields = ('place_obtained',)
    verbose_name_plural = _('TEAMS ENROLLED')  # Rename the section title

    def place_obtained(self, obj):
        """
        Display the place obtained by the team in the category.
        """
        if obj.category.first_place_team == obj.team:
            return _('1st Place')
        elif obj.category.second_place_team == obj.team:
            return _('2nd Place')
        elif obj.category.third_place_team == obj.team:
            return _('3rd Place')
        return _('No Placement')
    place_obtained.short_description = _('Place Obtained')

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

    def get_queryset(self, request):
        """
        Filter the queryset to include only results for solo categories.
        """
        qs = super().get_queryset(request)
        return qs.filter(category__type='solo')  # Filter by category type 'solo'

    def category_name(self, obj):
        """
        Display the category name.
        """
        return obj.category.name
    category_name.short_description = _('Category Name')

    def competition_name(self, obj):
        """
        Display the competition name.
        """
        return obj.category.competition.name if obj.category.competition else _('N/A')
    competition_name.short_description = _('Competition Name')

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
                        self.queryset = (qs | extra).distinct().select_related('category__competition').prefetch_related('team_members')
                except Exception:
                    pass

        return WrappedFormSet

    def competition_name(self, obj):
        return obj.category.competition.name if obj.category and obj.category.competition else 'N/A'
    competition_name.short_description = _('Competition')

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

    def get_queryset(self, request):
        """
        Filter the queryset to include only results for fight categories.
        """
        qs = super().get_queryset(request)
        return qs.filter(category__type='fight')  # Filter by category type 'fight'

    def category_name(self, obj):
        """
        Display the category name.
        """
        return obj.category.name
    category_name.short_description = "Category Name"

    def competition_name(self, obj):
        """
        Display the competition name.
        """
        return obj.category.competition.name if obj.category.competition else "N/A"
    competition_name.short_description = "Competition Name"

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
    
    def has_module_permission(self, request):
        """Hide City from the admin app index/sidebar while keeping it registered for lookups/autocompletes."""
        return False

    # Backwards-compatible alias in case older Django versions call this method name
    def has_module_perms(self, request):
        return False

# Register Club model
@admin.register(Club)
class ClubAdmin(admin.ModelAdmin):
    list_display = ('name', 'city', 'address', 'mobile_number', 'website', 'created', 'modified')
    search_fields = ('name', 'city__name')
    filter_horizontal = ('coaches',)  # Add horizontal filter for ManyToManyField
    inlines = [AthleteInline]

    # Organize fields in the admin form
    fieldsets = (
        ('Club Details', {
            'fields': ('name', 'logo', 'city', 'address', 'mobile_number', 'website')
        }),
        ('Timestamps', {
            'fields': ('modified',)  # Only include editable fields
        }),
    )

    readonly_fields = ('created', 'modified')  # Mark non-editable fields as read-only


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


# FrontendTheme admin removed — frontend theme management has been disabled.

# Original Athlete admin removed - using consolidated AthleteAdmin below

# Legacy MedicalVisa and AnnualVisa admin classes removed — use unified Visa admin instead.


# Provide the TrainingSeminarAdmin class for programmatic use (tests and callers)
# but do NOT register it with the admin site — seminars are managed via landing.Event.
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
    list_display = ('athlete', 'grade', 'level', 'event', 'examiner_1', 'examiner_2', 'obtained_date')
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
    groups = forms.ModelMultipleChoiceField(
        queryset=Group.objects.all(),
        required=False,
        widget=forms.CheckboxSelectMultiple,  # Use checkboxes for group selection
        label="Groups"
    )

    class Meta:
        model = Category
        fields = '__all__'

    def save(self, commit=True):
        """
        Override save to handle the ManyToMany relationship between Category and Group.
        """
        instance = super().save(commit=False)
        if commit:
            instance.save()
            # Update the groups relationship
            instance.groups.set(self.cleaned_data['groups'])
        return instance

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    # Prefer Event (landing.Event) information in the admin UI; keep legacy Competition search for compatibility
    list_display = ('name', 'event', 'type', 'gender', 'group', 'display_winners')
    search_fields = ('name', 'event__title', 'competition__name', 'type', 'gender', 'group__name')  # Add search fields
    autocomplete_fields = ['group', 'first_place', 'second_place', 'third_place', 'first_place_team', 'second_place_team', 'third_place_team']
   # form = CategoryAdminForm 
   
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        """
        Restrict the group selection to groups that belong to the same competition as the category.
        """
        if db_field.name == 'group':
            # Handle the case where request.obj is None (creating a new Category)
            category_id = request.resolver_match.kwargs.get('object_id')  # Get the category ID from the URL
            if category_id:
                category = Category.objects.filter(pk=category_id).first()
                if category:
                    kwargs['queryset'] = Group.objects.filter(competition=category.competition)
            else:
                kwargs['queryset'] = Group.objects.none()  # No groups available when creating a new Category
        return super().formfield_for_foreignkey(db_field, request, **kwargs)
    
    def get_form(self, request, obj=None, **kwargs):
        """
        Dynamically modify the form to hide the 'athletes' field when creating a new category.
        """
        form = super().get_form(request, obj, **kwargs)
        if obj is None:  # If creating a new category
            # Remove the 'athletes' field from the form
            if 'athletes' in form.base_fields:
                del form.base_fields['athletes']
            # Add a custom help text message
            form.base_fields['name'].help_text = (
                "Create the category first, then reopen it to add athletes or teams."
            )
        return form

    def get_fieldsets(self, request, obj=None):
        """
        Dynamically modify the fieldsets to hide the 'athletes' field if the category type is 'Teams and Fight'.
        """
        
        fieldsets = [
            ('CATEGORY DETAILS', {
                'fields': ('name', 'event', 'group', 'type', 'gender')
            }),
        ]
        if obj and obj.type in ['solo', 'fight']:
            fieldsets.append(('AWARDS - INDIVIDUAL', {
                'fields': ('first_place', 'second_place', 'third_place'),

            }))
        elif obj and obj.type == 'teams':
            fieldsets.append(('AWARDS - TEAMS', {
                'fields': ('first_place_team', 'second_place_team', 'third_place_team'),

            }))
        return fieldsets

    def get_inlines(self, request, obj=None):
        """
        Dynamically include inlines based on category type.
        """
        inlines = []
        if obj:
            if obj.type == 'solo':
                inlines.append(CategoryAthleteInline)
                inlines.append(CategoryAthleteScoreInline)  # Add athlete score inline for solo categories
            elif obj.type == 'teams':
                inlines.append(CategoryTeamScoreInline)  # Add team score inline for teams categories
                inlines.append(EnrolledTeamsInline)  # Add the new EnrolledTeamsInline
            elif obj.type == 'fight':
                inlines.extend([CategoryAthleteInline, MatchInline])  # Add athlete and match inlines for fight categories
        return inlines

    def display_winners(self, obj):
        """
        Display the winners for the category.
        """
        if obj.type in ['solo', 'fight']:
            return f"1st: {obj.first_place}, 2nd: {obj.second_place}, 3rd: {obj.third_place}"
        elif obj.type == 'teams':
            return f"1st: {obj.first_place_team}, 2nd: {obj.second_place_team}, 3rd: {obj.third_place_team}"
        return "No winners assigned"
    display_winners.short_description = _('Winners')

    def save_model(self, request, obj, form, change):
        """
        Trigger validation before saving the category.
        """
        obj.clean()  # Trigger validation logic
        super().save_model(request, obj, form, change)

    def enrolled_teams_count(self, obj):
        """
        Display the number of teams enrolled in the category.
        """
        return obj.enrolled_teams.count()
    enrolled_teams_count.short_description = _('Enrolled Teams Count')

    def enrolled_individuals_count(self, obj):
        """
        Display the number of individuals enrolled in the category.
        """
        return obj.enrolled_individuals.count()
    enrolled_individuals_count.short_description = _('Enrolled Individuals Count')

@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ('name', 'assigned_categories')  # Display team name and assigned categories
    readonly_fields = ('name',)
    inlines = [TeamMemberInline, CategoryTeamInline]  # Include both inlines
    search_fields = ('name',)  # Enable search by team name
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

    # No custom Media for metadata editor — keep plain textarea behavior

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


@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    list_display = ('name_with_corners', 'match_type', 'get_winner', 'category_link', 'competition')
    search_fields = ('name', 'red_corner__first_name', 'red_corner__last_name', 'blue_corner__first_name', 'blue_corner__last_name', 'winner__first_name', 'category__name', 'category__competition__name', 'category__event__title')
    list_filter = ('match_type', 'category__competition')

    # Use a custom change form template so we can add a quick 'Add central penalty' button
    change_form_template = 'admin/api/match/change_form.html'

    fieldsets = (
        ('MATCH DETAILS', {
            # Place central_referee near the top so admins can set it before adding penalties
            # Winner is read-only and computed from referee scores/penalties
            'fields': ('category', 'match_type', 'red_corner', 'blue_corner', 'central_referee', 'winner_display')
        } ),
    )

    autocomplete_fields = ['red_corner', 'blue_corner', 'central_referee']  # Winner is computed and read-only

    readonly_fields = ('winner_display',)

    # Show per-referee score inline and a read-only list of central penalties
    inlines = [RefereeScoreInline, CentralPenaltyInline]

    class Media:
        js = ('/static/api/js/referee_inline_winner.js', '/static/api/js/recompute_match_results.js',)

    def name_with_corners(self, obj):
        """
        Display the full names of the athletes with their corner in parentheses.
        """
        return f"{obj.red_corner.first_name} {obj.red_corner.last_name} (Red Corner) vs {obj.blue_corner.first_name} {obj.blue_corner.last_name} (Blue Corner)"
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
        Display the competition name associated with the match.
        """
        return obj.category.competition.name if obj.category.competition else "N/A"
    competition.short_description = _('Competition')

    def category_link(self, obj):
        """
        Display the category name as a clickable link.
        """
        return format_html('<a href="/admin/api/category/{}/change/">{}</a>', obj.category.id, obj.category.name)
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
    """
    list_display = ('name', 'competition')  # Display name and competition
    search_fields = ('name', 'competition__name')  # Enable search by name and competition
    list_filter = ('competition',)  # Add a filter for competition


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
class AthleteActivityInline(admin.TabularInline):
    model = AthleteActivity
    extra = 0
    readonly_fields = ('action', 'performed_by', 'timestamp', 'notes')
    ordering = ('-timestamp',)
    verbose_name = "Activity Log"
    verbose_name_plural = "Activity Logs"
    
    def has_add_permission(self, request, obj=None):
        return False  # Prevent manual addition of activities


@admin.register(Athlete)
class AthleteAdmin(admin.ModelAdmin):
    # Merge photo and name into a single narrow column (no header label).
    # Also show referee/coach flags, compact grade name, club, and action buttons on the far right.
    list_display = [
        'photo_and_name', 'status', 'is_referee', 'is_coach', 'grade_display', 'club', 'get_action_buttons'
    ]
    list_filter = ['status', 'current_grade', 'club', 'city', 'is_coach', 'is_referee', 'submitted_date', 'reviewed_date']
    search_fields = ['first_name', 'last_name', 'user__email', 'user__username', 'current_grade__name', 'club__name', 'city__name']
    readonly_fields = ['submitted_date', 'reviewed_date', 'current_grade', 'add_enrolled_event_link', 'add_grade_history_link', 'visa_add_buttons']
    ordering = ['-submitted_date']
    inlines = [
        AthleteActivityInline,
        GradeHistoryInline,
        VisaInline,
        AthleteTrainingSeminarParticipationInline,
        AthleteSoloResultsInline,
        AthleteFightResultsInline,
        AthleteTeamResultsInline,
        # Team results displayed via custom method in fieldsets instead of inline
        # (team results are now shown via AthleteTeamResultsInline)
    ]
    
    def visa_add_buttons(self, obj):
        """Display add visa buttons"""
        if obj and obj.pk:
            return format_html(
                '<a class="button" href="{}?athlete={}&visa_type=medical">Add Medical Visa</a> '
                '<a class="button" href="{}?athlete={}&visa_type=annual">Add Annual Visa</a>',
                reverse('admin:api_visa_add'), obj.pk,
                reverse('admin:api_visa_add'), obj.pk
            )
        return ''
    visa_add_buttons.short_description = _('Add Visa')
    
    fieldsets = (
        ('Personal Information', {
            'fields': ('user', 'first_name', 'last_name', 'gender', 'date_of_birth', 'address', 'mobile_number', 'profile_image')
        }),
        ('Sports & Club Information', {
            'fields': ('club', 'city', 'current_grade', 'federation_role', 'title', 'registered_date', 'expiration_date', 'is_coach', 'is_referee')
        }),
        ('Emergency Contact', {
            'fields': ('emergency_contact_name', 'emergency_contact_phone')
        }),
        # Team results are shown via the AthleteTeamResultsInline instead of a custom field
        ('Approval Workflow', {
            'fields': (
                'status', 
                'submitted_date', 
                'reviewed_date', 
                'reviewed_by', 
                'add_enrolled_event_link', 
                'add_grade_history_link',
                'visa_add_buttons'
            )
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
            return format_html(
                '<a class="button" href="{}approve/">{}</a> '
                '<a class="button" href="{}reject/">{}</a> '
                '<a class="button" href="{}request_revision/">{}</a>',
                obj.pk, _('Approve'), obj.pk, _('Reject'), obj.pk, _('Request Revision')
            )
        elif obj.status == 'approved':
            return format_html('<span style="color: green;">✓ Approved</span>')
        elif obj.status == 'rejected':
            return format_html('<span style="color: red;">✗ Rejected</span>')
        elif obj.status == 'revision_required':
            return format_html('<span style="color: orange;">⚠ Revision Required</span>')
        return ''
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
        ]
        return custom_urls + urls

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


@admin.register(AthleteActivity)
class AthleteActivityAdmin(admin.ModelAdmin):
    list_display = ['athlete', 'action', 'performed_by', 'timestamp']
    list_filter = ['action', 'timestamp', 'performed_by']
    search_fields = ['athlete__first_name', 'athlete__last_name', 'performed_by__username']
    readonly_fields = ['athlete', 'action', 'performed_by', 'timestamp', 'notes']
    ordering = ['-timestamp']
    
    def has_add_permission(self, request):
        return False  # Prevent manual addition
    
    def has_change_permission(self, request, obj=None):
        return False  # Prevent editing


class CategoryScoreActivityInline(admin.TabularInline):
    model = CategoryScoreActivity
    extra = 0
    readonly_fields = ['action', 'performed_by', 'notes', 'timestamp']
    can_delete = False
    
    def has_add_permission(self, request, obj=None):
        return False


# Enhanced CategoryAthleteScore admin with approval workflow
class CategoryAthleteScoreAdmin(admin.ModelAdmin):
    list_display = [
        'get_athlete_name', 'get_competition_name', 'get_category_name', 'get_submission_type', 
        'type', 'group', 'placement_claimed', 'status', 'submitted_date', 'get_action_buttons'
    ]
    list_filter = ['status', 'type', 'group', 'submitted_by_athlete', 'submitted_date', 'category__competition__start_date', 'category__event__start_date']
    search_fields = [
    'athlete__first_name', 'athlete__last_name', 'category__name', 'category__competition__name', 'category__event__title',
        'team_members__first_name', 'team_members__last_name', 'team_name'
    ]
    readonly_fields = ['submitted_date', 'reviewed_date']
    ordering = ['-submitted_date']
    inlines = [CategoryScoreActivityInline]
    filter_horizontal = ['team_members']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('athlete', 'category', 'submitted_by_athlete', 'type', 'group')
        }),
        ('Team Information', {
            'fields': ('team_name', 'team_members'),
            'description': 'Only used for team results (type="teams")',
            'classes': ('collapse',)
        }),
        ('Referee Evaluation', {
            'fields': ('referee', 'score'),
            'description': 'Used when referees/officials evaluate athletes (not relevant for athlete self-submissions)',
            'classes': ('collapse',)
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
        return super().get_queryset(request).select_related('athlete', 'category__competition', 'reviewed_by').prefetch_related('team_members')
    
    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        
        # If this is an athlete submission, make score field optional and add help text
        if obj and obj.submitted_by_athlete:
            if 'score' in form.base_fields:
                form.base_fields['score'].required = False
                form.base_fields['score'].help_text = 'Score not required for athlete self-submissions - focus on placement_claimed instead'
        
        return form
    
    def get_athlete_name(self, obj):
        return f"{obj.athlete.first_name} {obj.athlete.last_name}"
    get_athlete_name.short_description = _('Athlete')
    get_athlete_name.admin_order_field = 'athlete__first_name'
    
    def get_competition_name(self, obj):
        if obj.category.competition:
            return obj.category.competition.name
        elif obj.category.event:
            return obj.category.event.title
        return '-'
    get_competition_name.short_description = _('Competition')
    # Keep admin ordering keyed to the legacy competition name for now; Event ordering could be added later
    get_competition_name.admin_order_field = 'category__competition__name'
    
    def get_category_name(self, obj):
        return obj.category.name
    get_category_name.short_description = _('Category')
    get_category_name.admin_order_field = 'category__name'
    
    def get_submission_type(self, obj):
        if obj.submitted_by_athlete:
            return f"🏅 Self-Submitted ({obj.placement_claimed or 'No placement'})"
        else:
            return f"🥋 Referee Score ({obj.score})"
    get_submission_type.short_description = _('Type')
    
    def get_action_buttons(self, obj):
        if obj.submitted_by_athlete and obj.status == 'pending':
            return format_html(
                '<a class="button" href="{}/approve/">Approve</a> '
                '<a class="button" href="{}/reject/">Reject</a> '
                '<a class="button" href="{}/request_revision/">Request Revision</a>',
                obj.pk, obj.pk, obj.pk
            )
        elif obj.status == 'approved':
            return format_html('<span style="color: green;">✓ Approved</span>')
        elif obj.status == 'rejected':
            return format_html('<span style="color: red;">✗ Rejected</span>')
        elif obj.status == 'revision_required':
            return format_html('<span style="color: orange;">⚠ Revision Required</span>')
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


@admin.register(CategoryScoreActivity)
class CategoryScoreActivityAdmin(admin.ModelAdmin):
    list_display = ['score', 'action', 'performed_by', 'timestamp']
    list_filter = ['action', 'timestamp', 'performed_by']
    search_fields = ['score__category__name', 'score__athlete__first_name', 'score__athlete__last_name', 'performed_by__username']
    readonly_fields = ['score', 'action', 'performed_by', 'timestamp', 'notes']
    ordering = ['-timestamp']
    
    def has_add_permission(self, request):
        return False
    
    def has_change_permission(self, request, obj=None):
        return False


# Register the enhanced CategoryAthleteScore admin
admin.site.register(CategoryAthleteScore, CategoryAthleteScoreAdmin)


# CategoryTeamAthleteScoreAdmin deprecated - team functionality added to CategoryAthleteScoreAdmin


@admin.register(SupporterAthleteRelation)
class SupporterAthleteRelationAdmin(admin.ModelAdmin):
    list_display = ['supporter', 'athlete', 'relationship', 'can_edit', 'can_register_competitions', 'created']
    list_filter = ['relationship', 'can_edit', 'can_register_competitions', 'created']
    search_fields = ['supporter__username', 'supporter__email', 'athlete__first_name', 'athlete__last_name']
    ordering = ['-created']


# Configure admin site branding
admin.site.site_header = 'FRVV Admin'
admin.site.site_title = 'FRVV Admin'
admin.site.index_title = 'Romanian Vovinam Federation Administration'
