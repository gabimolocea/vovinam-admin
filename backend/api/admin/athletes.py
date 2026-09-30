from django.contrib import admin, messages
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _
from django.urls import path, reverse
from django.shortcuts import render
from django.db import models
from django.utils.safestring import mark_safe
from django.template.response import TemplateResponse
from ..models import Athlete, CategoryAthlete, CategoryAthleteScore, GradeHistory


admin.site.enable_nav_sidebar = True


from ._common import (
    AthleteTrainingSeminarParticipationInline,
)
from django import forms


# Formularele si inline-urile folosite mai jos, in acest fisier si nicaieri
# altundeva. Au stat pana acum in _common.py, desi nu erau comune cu nimeni.
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
                translations = {
                    'Valid': _('Validă'),
                    'Expired': _('Expirată'),
                    'Not available': _('Indisponibilă'),
                }
                return translations.get(obj.visa_status, obj.visa_status) or ''
            except Exception:
                return ''
    visa_status.short_description = _('Status')

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
    verbose_name = _("Rezultat la luptă")
    verbose_name_plural = _("Rezultate la luptă")
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


class SoftDeletedFilter(admin.SimpleListFilter):
    """Arata sau ascunde sportivii stersi logic.

    Stergerea unui sportiv din admin nu scoate randul din tabel, il
    marcheaza `is_deleted` (vezi SoftDeleteMixin), iar managerul implicit
    al modelului filtreaza randurile astea din toate interogarile. Pana
    acum nu exista niciun ecran care sa le arate, deci un sportiv sters
    din greseala disparea definitiv, desi modelul stie sa-l restaureze.
    """

    title = _('Șterși')
    parameter_name = 'sters'

    def lookups(self, request, model_admin):
        return (('doar', _('Doar cei șterși')), ('toti', _('Și cei șterși')))

    def queryset(self, request, queryset):
        if self.value() == 'doar':
            return queryset.filter(is_deleted=True)
        if self.value() == 'toti':
            return queryset
        return queryset.filter(is_deleted=False)


@admin.register(Athlete)
class AthleteAdmin(admin.ModelAdmin):
    form = AthleteAdminForm
    change_form_template = 'admin/api/athlete/change_form.html'
    list_display = [
        'full_name_link', 'status', 'pending_photo_indicator', 'is_referee', 'referee_level', 'is_coach', 'is_instructor'
    ]
    list_filter = [SoftDeletedFilter, 'status', 'profile_image_status', 'is_coach', 'is_instructor', 'is_referee', 'referee_level', 'referee_category', 'submitted_date', 'reviewed_date']
    autocomplete_fields = ('club', 'city', 'current_grade', 'federation_role', 'title')
    search_fields = ['first_name', 'last_name', 'license_series', 'cnp', 'user__email', 'user__username', 'current_grade__name', 'club__name', 'city__name']
    readonly_fields = ['submitted_date_display', 'reviewed_date_display', 'current_grade_display_readonly', 'add_enrolled_event_link', 'add_grade_history_link', 'license_image_preview', 'pending_profile_image_preview']
    ordering = ['-submitted_date']
    actions = ['approve_pending_photos', 'reject_pending_photos', 'restore_deleted']
    inlines = [
        GradeHistoryInline,
    VisaInline,
        AthleteTrainingSeminarParticipationInline,
        AthleteSoloResultsInline,
        AthleteTeamResultsInline,
        AthleteFightResultsInline,
    ]
    
    fieldsets = (
        ('Informații personale', {
            'fields': ('user', 'first_name', 'last_name', 'gender', 'cnp', 'nationality', 'date_of_birth', 'address', 'mobile_number', 'profile_image')
        }),
        ('Legitimație', {
            'description': 'Verifică poza legitimației trimise de sportiv înainte de a aproba profilul.',
            'fields': ('is_licensed', 'license_series', 'license_number', 'license_image_preview', 'license_request_document'),
        }),
        ('Poză de profil în așteptare', {
            'description': (
                'Cât timp sportivul are un profil deja aprobat, o poză de profil nouă nu înlocuiește '
                'poza curentă direct - stă aici "în așteptare" până e aprobată sau respinsă (din listă, '
                'cu acțiunile de mai jos, sau din pagina Aprobări a site-ului).'
            ),
            'fields': ('profile_image_status', 'pending_profile_image_preview', 'profile_image_admin_notes'),
        }),
        ('Informații sportive și club', {
            'fields': ('club', 'city', 'current_grade_display_readonly', 'federation_role', 'title', 'registered_date', 'expiration_date', 'team_place', 'is_coach', 'is_instructor', 'is_referee')
        }),
        ('Arbitraj', {
            'description': 'Doar pentru sportivii bifați ca arbitru mai sus. Categoria se aplică doar arbitrilor naționali.',
            'fields': ('referee_level', 'referee_category'),
        }),
        ('Contact de urgență', {
            'fields': ('emergency_contact_name', 'emergency_contact_phone')
        }),
        ('Documente medicale și experiență', {
            'fields': ('medical_certificate', 'previous_experience'),
        }),
        ('Flux de aprobare', {
            'fields': ('status', 'submitted_date_display', 'reviewed_date_display', 'reviewed_by', 'admin_notes', 'add_enrolled_event_link', 'add_grade_history_link'),
            'description': (
                'Notele de administrator sunt cele scrise la aprobarea sau respingerea profilului. '
                'Sportivul le vede pe pagina lui, deci scrie-le ca pentru el.'
            ),
        }),
        ('Medalii internaționale (Campionat European / Mondial)', {
            'description': (
                'Medaliile de la competițiile naționale se calculează automat din rezultatele aprobate. '
                'Federația nu organizează/scorează în aplicație Campionatul European sau Mondial, așa că '
                'medaliile obținute acolo se introduc manual aici.'
            ),
            'fields': (
                ('european_medals_gold', 'european_medals_silver', 'european_medals_bronze'),
                ('world_medals_gold', 'world_medals_silver', 'world_medals_bronze'),
            ),
        }),
    )

    def get_queryset(self, request):
        # Pornim de la toate randurile, inclusiv cele sterse logic, si lasam
        # SoftDeletedFilter sa le ascunda - altfel filtrul n-ar avea ce sa
        # arate, fiindca managerul implicit le-a taiat deja.
        return Athlete.objects.with_deleted().select_related(
            'club',
            'city',
            'current_grade',
            'user',
            'reviewed_by',
            'approved_by',
        )

    # Django sterge un singur obiect cu obj.delete() (deci logic, prin
    # SoftDeleteMixin) dar o selectie intreaga cu queryset.delete(), care
    # ocoleste mixinul si sterge definitiv. Doua butoane care arata la fel
    # faceau doua lucruri diferite; acum amandoua sterg logic.
    def delete_model(self, request, obj):
        obj.delete(user=request.user)

    def delete_queryset(self, request, queryset):
        for athlete in queryset:
            athlete.delete(user=request.user)

    @admin.action(description=_('Restaurează sportivii șterși'))
    def restore_deleted(self, request, queryset):
        restored = 0
        for athlete in queryset.filter(is_deleted=True):
            athlete.restore()
            restored += 1
        if restored:
            self.message_user(request, f'{restored} sportiv(i) restaurat(i).', messages.SUCCESS)
        else:
            self.message_user(request, 'Niciun sportiv șters în selecție.', messages.WARNING)

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

    def license_image_preview(self, obj):
        try:
            if obj.license_image and hasattr(obj.license_image, 'url'):
                return format_html(
                    '<a href="{0}" target="_blank" rel="noopener noreferrer">'
                    '<img src="{0}" style="max-width:360px; max-height:360px; object-fit:contain; '
                    'border:1px solid #ccc; border-radius:4px;" />'
                    '</a>',
                    obj.license_image.url
                )
        except Exception:
            pass
        return _('Sportivul nu a încărcat încă o poză a legitimației.')
    license_image_preview.short_description = _('Poză legitimație')

    def pending_profile_image_preview(self, obj):
        try:
            if obj.pending_profile_image and hasattr(obj.pending_profile_image, 'url'):
                return format_html(
                    '<a href="{0}" target="_blank" rel="noopener noreferrer">'
                    '<img src="{0}" style="max-width:200px; max-height:200px; object-fit:cover; '
                    'border:1px solid #ccc; border-radius:50%;" />'
                    '</a>',
                    obj.pending_profile_image.url
                )
        except Exception:
            pass
        return _('Nu există o poză de profil în așteptare.')
    pending_profile_image_preview.short_description = _('Poză nouă (în așteptare)')

    def pending_photo_indicator(self, obj):
        if obj.profile_image_status == 'pending':
            return mark_safe('<span style="color:#b45309; font-weight:600;">● În așteptare</span>')
        return '—'
    pending_photo_indicator.short_description = _('Poză profil')
    pending_photo_indicator.admin_order_field = 'profile_image_status'

    def approve_pending_photos(self, request, queryset):
        from ..notification_utils import notify_profile_image_reviewed
        count = 0
        for athlete in queryset.filter(profile_image_status='pending'):
            athlete.approve_profile_image(request.user)
            try:
                notify_profile_image_reviewed(athlete, approved=True)
            except Exception:
                pass
            count += 1
        if count:
            self.message_user(request, f'{count} poză(e) de profil aprobată(e).', level=messages.SUCCESS)
        else:
            self.message_user(request, 'Niciun sportiv selectat nu are o poză de profil în așteptare.', level=messages.WARNING)
    approve_pending_photos.short_description = _('Aprobă poza de profil în așteptare (pentru selecție)')

    def reject_pending_photos(self, request, queryset):
        from ..notification_utils import notify_profile_image_reviewed
        count = 0
        for athlete in queryset.filter(profile_image_status='pending'):
            athlete.reject_profile_image(request.user, 'Poza nu a fost aprobată.')
            try:
                notify_profile_image_reviewed(athlete, approved=False)
            except Exception:
                pass
            count += 1
        if count:
            self.message_user(request, f'{count} poză(e) de profil respinsă(e).', level=messages.SUCCESS)
        else:
            self.message_user(request, 'Niciun sportiv selectat nu are o poză de profil în așteptare.', level=messages.WARNING)
    reject_pending_photos.short_description = _('Respinge poza de profil în așteptare (pentru selecție)')

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
        from ..excel_sync import ExcelTemplateGenerator
        
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
        from ..excel_sync import ExcelImportService
        
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
            url = reverse('admin:api_eventparticipation_add') + f'?athlete={obj.pk}'
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
        from django.core.exceptions import PermissionDenied
        from django.db import transaction

        if not self.has_change_permission(request):
            raise PermissionDenied

        athlete = get_object_or_404(Athlete, pk=pk)

        if athlete.status != 'pending':
            messages.error(request, f'Profilul sportivului nu este în starea în așteptare (curent: {athlete.status})')
            return redirect('admin:api_athlete_changelist')

        if request.method == 'POST':
            try:
                with transaction.atomic():
                    athlete = Athlete.objects.select_for_update().get(pk=athlete.pk)
                    if athlete.status != 'pending':
                        messages.error(request, f'Profilul sportivului nu este în starea în așteptare (curent: {athlete.status})')
                        return redirect('admin:api_athlete_changelist')
                    # Use the approve method from the consolidated model
                    athlete.approve(request.user)

                messages.success(request, f'Profilul sportivului {athlete.first_name} {athlete.last_name} a fost aprobat cu succes')

            except Exception as e:
                messages.error(request, f'Eroare la aprobarea profilului sportivului: {str(e)}')

            return redirect('admin:api_athlete_changelist')

        # Show confirmation form
        context = {
            'profile': athlete,
            'title': f'Aprobă profilul: {athlete.first_name} {athlete.last_name}',
        }
        return render(request, 'admin/approve_profile.html', context)
    
    def reject_profile(self, request, pk):
        from django.shortcuts import get_object_or_404, redirect
        from django.contrib import messages
        from django.core.exceptions import PermissionDenied
        from django.db import transaction

        if not self.has_change_permission(request):
            raise PermissionDenied

        athlete = get_object_or_404(Athlete, pk=pk)
        
        if athlete.status != 'pending':
            messages.error(request, f'Profilul sportivului nu este în starea în așteptare (curent: {athlete.status})')
            return redirect('admin:api_athlete_changelist')
        
        if request.method == 'POST':
            rejection_reason = request.POST.get('admin_notes', '')

            with transaction.atomic():
                athlete = Athlete.objects.select_for_update().get(pk=athlete.pk)
                if athlete.status != 'pending':
                    messages.error(request, f'Profilul sportivului nu este în starea în așteptare (curent: {athlete.status})')
                    return redirect('admin:api_athlete_changelist')
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
        from django.core.exceptions import PermissionDenied
        from django.db import transaction

        if not self.has_change_permission(request):
            raise PermissionDenied

        athlete = get_object_or_404(Athlete, pk=pk)
        
        if athlete.status != 'pending':
            messages.error(request, f'Profilul sportivului nu este în starea în așteptare (curent: {athlete.status})')
            return redirect('admin:api_athlete_changelist')
        
        if request.method == 'POST':
            revision_notes = request.POST.get('admin_notes', '')

            with transaction.atomic():
                athlete = Athlete.objects.select_for_update().get(pk=athlete.pk)
                if athlete.status != 'pending':
                    messages.error(request, f'Profilul sportivului nu este în starea în așteptare (curent: {athlete.status})')
                    return redirect('admin:api_athlete_changelist')
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


