from django.contrib import admin, messages
from django.contrib.admin.widgets import RelatedFieldWidgetWrapper
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _
from django.core.exceptions import ValidationError
from django import forms
from django.urls import path, reverse
from django.http import HttpResponseRedirect
from django.utils.safestring import mark_safe
from ..models import (
    Athlete,
    TrainingSeminarParticipation,
    CompetitionReferee,
    Visa,
    Event,
    EventParticipation,
)


admin.site.enable_nav_sidebar = True
admin.site.site_header = _('Administrare FRVV')
admin.site.site_title = _('FRVV Admin')
admin.site.index_title = _('Panou de administrare')


# Sase modele trec prin acelasi flux de aprobare (vezi ApprovalWorkflowMixin
# din api/models/_common.py), asa ca sectiunea arata la fel peste tot.
# Definita o singura data ca sa nu se desparta de la un ecran la altul.
APPROVAL_FIELDSET = ('Flux de aprobare', {
    'fields': ('status', 'submitted_date', 'reviewed_date', 'reviewed_by', 'admin_notes'),
    'description': (
        'Notele ajung la persoana care a trimis înregistrarea, deci scrie-le ca pentru ea. '
        'Data trimiterii și data revizuirii se completează singure.'
    ),
})
APPROVAL_READONLY = ('submitted_date', 'reviewed_date')


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












# Custom Team Results display - using the improved approach from before
# Since Django admin inlines have limitations with ManyToMany relationships,
# we'll use the custom field display method in the main AthleteAdmin





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
        readonly_fields = ('visa_status', 'proof_preview') + APPROVAL_READONLY
        actions = ['approve_pending', 'reject_pending']

        fieldsets = (
            ('Viza', {
                'fields': ('athlete', 'visa_type', 'issued_date', 'visa_status'),
            }),
            ('Stare de sănătate', {
                'fields': ('health_status',),
                'description': 'Obligatorie pentru vizele medicale; la cele anuale se lasă goală.',
            }),
            ('Dovezi', {
                'fields': ('document', 'image', 'proof_preview', 'notes'),
            }),
            ('Cine a trimis', {
                'fields': ('submitted_by_athlete',),
            }),
            APPROVAL_FIELDSET,
        )

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
                translations = {
                    'Valid': _('Validă'),
                    'Expired': _('Expirată'),
                    'Not available': _('Indisponibilă'),
                }
                return translations.get(obj.visa_status, obj.visa_status) or ''
            except Exception:
                return ''
        visa_status.short_description = _('Status')

        def proof_preview(self, obj):
            try:
                if obj.image and hasattr(obj.image, 'url'):
                    return format_html(
                        '<a href="{0}" target="_blank" rel="noopener noreferrer">'
                        '<img src="{0}" style="max-width:360px; max-height:360px; object-fit:contain; '
                        'border:1px solid #ccc; border-radius:4px;" />'
                        '</a>',
                        obj.image.url
                    )
            except Exception:
                pass
            try:
                if obj.document and hasattr(obj.document, 'url'):
                    return format_html('<a href="{0}" target="_blank" rel="noopener noreferrer">{0}</a>', obj.document.url)
            except Exception:
                pass
            return _('Nu a fost trimisă nicio dovadă.')
        proof_preview.short_description = _('Dovadă trimisă')

        def approve_pending(self, request, queryset):
            count = 0
            for obj in queryset.filter(status='pending'):
                obj.approve(request.user)
                count += 1
            if count:
                self.message_user(request, f'{count} viz(ă/e) aprobată(e).', level=messages.SUCCESS)
            else:
                self.message_user(request, 'Nicio viză selectată nu este în așteptare.', level=messages.WARNING)
        approve_pending.short_description = _('Aprobă vizele în așteptare (pentru selecție)')

        def reject_pending(self, request, queryset):
            count = 0
            for obj in queryset.filter(status='pending'):
                obj.reject(request.user, 'Viza nu a fost aprobată.')
                count += 1
            if count:
                self.message_user(request, f'{count} viz(ă/e) respinsă(e).', level=messages.SUCCESS)
            else:
                self.message_user(request, 'Nicio viză selectată nu este în așteptare.', level=messages.WARNING)
        reject_pending.short_description = _('Respinge vizele în așteptare (pentru selecție)')

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
        readonly_fields = APPROVAL_READONLY

        # `seminar` lipseste intentionat: e campul vechi, ascuns de
        # formularul de mai jos, iar `event` e cel care conteaza acum.
        fieldsets = (
            ('Participare', {
                'fields': ('athlete', 'event'),
            }),
            ('Dovezi', {
                'fields': ('participation_certificate', 'participation_document', 'notes'),
            }),
            ('Cine a trimis', {
                'fields': ('submitted_by_athlete',),
            }),
            APPROVAL_FIELDSET,
        )

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



























# ============================================================================
# VIDEO RECORDING INLINE CLASSES (used by Match and Category admins)
# ============================================================================
























