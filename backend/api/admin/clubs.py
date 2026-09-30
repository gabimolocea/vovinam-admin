from django.contrib import admin
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from django.db import models
from django.db.models import Count
from ..models import Club, Athlete, TrainingSeminarParticipation


admin.site.enable_nav_sidebar = True


from ._common import (
    TrainingSeminarParticipationInline,
)
from django.core.exceptions import ValidationError
from dal import autocomplete
from django.utils.html import format_html
from django import forms
from django.urls import reverse


# Formularele si inline-urile folosite mai jos, in acest fisier si nicaieri
# altundeva. Au stat pana acum in _common.py, desi nu erau comune cu nimeni.
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
            'fields': ('name', 'slug', 'logo', 'city', 'address', 'mobile_number', 'website')
        }),
        ('Pagina publică', {
            'fields': ('description', 'display_order'),
            'description': (
                'Descrierea apare pe tab-ul „Info” al paginii publice a clubului. '
                'Ordinea de afișare decide poziția clubului în lista publică de cluburi.'
            ),
        }),
        ('Rețele sociale', {
            'fields': ('facebook_url', 'instagram_url', 'tiktok_url', 'youtube_url'),
            'classes': ('collapse',),
            'description': 'Linkurile apar ca iconițe pe pagina publică a clubului. Lăsate goale, iconița nu apare.',
        }),
        ('Antrenori', {
            'fields': ('coaches',),
            'description': 'Selectează sportivii care sunt antrenori pentru acest club. În listă apar doar sportivii marcați ca antrenori.'
        }),
        ('Marcaje temporale', {
            'fields': ('modified',)  # Only include editable fields
        }),
    )

    # slug e generat din nume si intra in URL-ul public al clubului: se
    # arata ca sa se stie ce adresa are clubul, dar nu se schimba de mana,
    # ca sa nu rupem linkurile deja date mai departe.
    readonly_fields = ('created', 'modified', 'slug')

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


