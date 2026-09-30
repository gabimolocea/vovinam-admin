from django.contrib import admin, messages
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _
from ..models import Athlete, Grade, GradeHistory


admin.site.enable_nav_sidebar = True


from ._common import (
    APPROVAL_FIELDSET,
    APPROVAL_READONLY,
)
from django.core.exceptions import ValidationError
from django import forms
from django.urls import reverse


# Formularele si inline-urile folosite mai jos, in acest fisier si nicaieri
# altundeva. Au stat pana acum in _common.py, desi nu erau comune cu nimeni.
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
    readonly_fields = ('certificate_image_preview',) + APPROVAL_READONLY
    actions = ['approve_pending', 'reject_pending']

    fieldsets = (
        ('Gradul obținut', {
            'fields': ('athlete', 'grade', 'level', 'obtained_date', 'event'),
        }),
        ('Examinatori', {
            'fields': ('examiner_1', 'examiner_2'),
            'description': 'În listă apar doar sportivii marcați ca antrenori.',
        }),
        ('Dovezi', {
            'fields': ('certificate_image', 'certificate_image_preview', 'result_document', 'notes'),
        }),
        ('Cine a trimis', {
            'fields': ('submitted_by_athlete',),
        }),
        APPROVAL_FIELDSET,
    )

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

