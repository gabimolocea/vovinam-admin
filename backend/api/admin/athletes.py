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
    AthleteAdminForm,
    AthleteFightResultsInline,
    AthleteSoloResultsInline,
    AthleteTeamResultsInline,
    AthleteTrainingSeminarParticipationInline,
    GradeHistoryInline,
    VisaInline,
)

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
    readonly_fields = ['submitted_date_display', 'reviewed_date_display', 'current_grade_display_readonly', 'add_enrolled_event_link', 'add_grade_history_link']
    ordering = ['-submitted_date']
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
            'fields': ('user', 'first_name', 'last_name', 'gender', 'license_series', 'cnp', 'date_of_birth', 'address', 'mobile_number', 'profile_image')
        }),
        ('Informații sportive și club', {
            'fields': ('club', 'city', 'current_grade_display_readonly', 'federation_role', 'title', 'registered_date', 'expiration_date', 'is_coach', 'is_referee')
        }),
        ('Contact de urgență', {
            'fields': ('emergency_contact_name', 'emergency_contact_phone')
        }),
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