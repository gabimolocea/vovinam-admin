from django.contrib import admin, messages
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _
from django.core.exceptions import ValidationError
from django.urls import reverse
from reversion.admin import VersionAdmin
from ..bracket_visualization import bracket_visualization_readonly_field, BracketStats
from django.utils.safestring import mark_safe
from ..models import (
    Athlete,
    Category,
    CategoryAthlete,
    CategoryAthleteScore,
    CategoryFieldAssignment,
    CategoryRefereeAssignment,
    CategoryTeam,
    CompetitionField,
    FightAthleteWeight,
    FightCategory,
    Group,
    Match,
    SoloCategory,
    TeamCategory,
    TeamPerformanceVideo,
)


admin.site.enable_nav_sidebar = True


from ._common import (
    APPROVAL_FIELDSET,
    APPROVAL_READONLY,
    _wrap_related_autocomplete_widget,
)
from dal import autocomplete, forward
from django import forms


# Formularele si inline-urile folosite mai jos, in acest fisier si nicaieri
# altundeva. Au stat pana acum in _common.py, desi nu erau comune cu nimeni.
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
    verbose_name = _("Meci")
    verbose_name_plural = _("Meciuri")

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

class CategoryAdminForm(forms.ModelForm):
    class Meta:
        model = Category
        exclude = ('category_number',)

class CategoryFieldAssignmentInline(admin.StackedInline):
    model = CategoryFieldAssignment
    extra = 0
    verbose_name = _('Programare pe teren')
    verbose_name_plural = _('Programări pe teren')
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


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    """Admin for base Category model to support autocomplete.

    Hidden from the admin index/menu (via get_model_perms) since editors
    should use the type-specific screens instead (Categorii individuale /
    pe echipe / luptă). It stays registered so autocomplete_fields that
    reference the base Category model keep working.
    """
    form = CategoryAdminForm
    inlines = [CategoryFieldAssignmentInline]
    list_display = ('id', 'name_link', 'group', 'event')
    search_fields = ('name', 'event__title')
    list_filter = ('event', 'group')

    def get_model_perms(self, request):
        # Hides this ModelAdmin from the admin index/app list while keeping
        # its URLs (including autocomplete) fully functional.
        return {}

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
        ('Interval de vârstă în cadrul grupei', {
            'fields': ('birth_year_start', 'birth_year_end', 'display_order'),
            'classes': ('collapse',),
            'description': (
                'Opțional. Taie un subinterval din grupă - se folosește la categoriile de luptă, '
                'unde o grupă se împarte pe ani. Lăsate goale, categoria acoperă toată grupa. '
                'Ordinea de afișare decide poziția categoriei în listele grupei.'
            ),
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
        ('Interval de vârstă în cadrul grupei', {
            'fields': ('birth_year_start', 'birth_year_end', 'display_order'),
            'classes': ('collapse',),
            'description': (
                'Opțional. Taie un subinterval din grupă - se folosește la categoriile de luptă, '
                'unde o grupă se împarte pe ani. Lăsate goale, categoria acoperă toată grupa. '
                'Ordinea de afișare decide poziția categoriei în listele grupei.'
            ),
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
        ('Interval de vârstă în cadrul grupei', {
            'fields': ('birth_year_start', 'birth_year_end', 'display_order'),
            'classes': ('collapse',),
            'description': (
                'Opțional. Taie un subinterval din grupă - se folosește la categoriile de luptă, '
                'unde o grupă se împarte pe ani. Lăsate goale, categoria acoperă toată grupa. '
                'Ordinea de afișare decide poziția categoriei în listele grupei.'
            ),
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
            'fields': ('pre_weight_kg', 'current_weight_kg', 'weight_loss_percentage', 'is_weight_locked'),
            'description': (
                'Greutatea se blochează singură după confirmarea la cântar, ca să nu se schimbe din greșeală. '
                'Debifează „Greutate blocată” doar ca să corectezi o măsurătoare greșită.'
            ),
        }),
        ('Rezultat', {
            'fields': ('place',),
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


@admin.register(CategoryAthleteScore)
class CategoryAthleteScoreAdmin(admin.ModelAdmin):
    """Athlete-submitted competition results awaiting approval - there was
    previously no standalone admin page for this model at all, so a
    self-reported result had no admin-side review surface."""
    list_display = ('athlete_link', 'event_display', 'category_link', 'type', 'placement_claimed', 'status', 'submitted_by_athlete', 'submitted_date')
    list_filter = ('status', 'submitted_by_athlete', 'type', 'placement_claimed', 'category__event')
    search_fields = ('athlete__first_name', 'athlete__last_name', 'team_name', 'team_members__first_name', 'team_members__last_name', 'category__name', 'category__event__title')
    autocomplete_fields = ('category', 'athlete', 'referee')
    filter_horizontal = ('team_members',)
    readonly_fields = ('certificate_image_preview',) + APPROVAL_READONLY
    actions = ['approve_pending', 'reject_pending']

    fieldsets = (
        ('Rezultat', {
            'fields': ('category', 'group', 'type', 'athlete', 'score', 'placement_claimed'),
            'description': (
                'Tipul și grupa se completează după categorie; se schimbă doar dacă rezultatul '
                'a fost trimis pentru altă probă decât cea aleasă.'
            ),
        }),
        ('Echipă', {
            'fields': ('team_name', 'team_members'),
            'classes': ('collapse',),
            'description': 'Se completează doar pentru rezultatele pe echipe.',
        }),
        ('Dovezi', {
            'fields': ('certificate_image', 'certificate_image_preview', 'result_document', 'notes'),
        }),
        ('Cine a trimis', {
            'fields': ('submitted_by_athlete', 'referee'),
            'description': (
                'Un rezultat trimis de sportiv pornește neaprobat și trebuie verificat; '
                'unul introdus de arbitru sau de administrator e deja aprobat.'
            ),
        }),
        APPROVAL_FIELDSET,
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('athlete', 'category', 'category__event').prefetch_related('team_members')

    def athlete_link(self, obj):
        if not obj.athlete:
            if obj.type == 'teams':
                members = list(obj.team_members.all())
                label = obj.team_name or _('Echipă fără nume')
                if members:
                    names = ', '.join(f'{m.first_name} {m.last_name}' for m in members)
                    return format_html('{} <span style="color:#666;">({})</span>', label, names)
                return label
            return obj.team_name or '—'
        try:
            url = reverse('admin:api_athlete_change', args=(obj.athlete.pk,))
            return format_html('<a href="{}">{}</a>', url, f'{obj.athlete.first_name} {obj.athlete.last_name}')
        except Exception:
            return f'{obj.athlete.first_name} {obj.athlete.last_name}'
    athlete_link.short_description = _('Sportiv / Echipă')
    athlete_link.admin_order_field = 'athlete__first_name'

    def category_link(self, obj):
        if not obj.category:
            return '—'
        try:
            url = reverse('admin:api_category_change', args=(obj.category.pk,))
            return format_html('<a href="{}">{}</a>', url, obj.category.name)
        except Exception:
            return obj.category.name
    category_link.short_description = _('Categorie')
    category_link.admin_order_field = 'category__name'

    def event_display(self, obj):
        event = obj.category.event if obj.category else None
        if not event:
            return '—'
        try:
            url = reverse('admin:api_event_change', args=(event.pk,))
            return format_html('<a href="{}">{}</a>', url, event.title)
        except Exception:
            return event.title
    event_display.short_description = _('Eveniment')
    event_display.admin_order_field = 'category__event__title'

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
        failures = []
        for obj in queryset.filter(status='pending'):
            try:
                obj.approve(request.user)
                count += 1
            except ValidationError as exc:
                failures.append(f'{obj} — {"; ".join(exc.messages)}')
        if count:
            self.message_user(request, f'{count} rezultat(e) aprobat(e).', level=messages.SUCCESS)
        if failures:
            self.message_user(request, 'Nu au putut fi aprobate: ' + ' | '.join(failures), level=messages.ERROR)
        if not count and not failures:
            self.message_user(request, 'Niciun rezultat selectat nu este în așteptare.', level=messages.WARNING)
    approve_pending.short_description = _('Aprobă rezultatele în așteptare (pentru selecție)')

    def reject_pending(self, request, queryset):
        count = 0
        for obj in queryset.filter(status='pending'):
            obj.reject(request.user, 'Rezultatul nu a fost aprobat.')
            count += 1
        if count:
            self.message_user(request, f'{count} rezultat(e) respins(e).', level=messages.SUCCESS)
        else:
            self.message_user(request, 'Niciun rezultat selectat nu este în așteptare.', level=messages.WARNING)
    reject_pending.short_description = _('Respinge rezultatele în așteptare (pentru selecție)')


