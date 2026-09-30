from django.contrib import admin
from ..models import (
    Athlete,
    CategoryAthleteScore,
    CategoryRefereeAssignment,
    CategoryRefereeScore,
    SupporterAthleteRelation,
)
from django.utils.translation import gettext_lazy as _
from django.utils.html import format_html
from django import forms
from django.utils.safestring import mark_safe


# Formularele si inline-urile folosite mai jos, in acest fisier si nicaieri
# altundeva. Au stat pana acum in _common.py, desi nu erau comune cu nimeni.
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
            return mark_safe('<span style="color: #999;">Fără scor</span>')
        return '-'
    
    @admin.display(description='R2')
    def get_r2_score(self, obj):
        """Display R2 score with edit link"""
        if obj.pk:
            score = obj.get_referee_score(2)
            if score is not None:
                return format_html('{:.2f}', score)
            return mark_safe('<span style="color: #999;">Fără scor</span>')
        return '-'
    
    @admin.display(description='R3')
    def get_r3_score(self, obj):
        """Display R3 score with edit link"""
        if obj.pk:
            score = obj.get_referee_score(3)
            if score is not None:
                return format_html('{:.2f}', score)
            return mark_safe('<span style="color: #999;">Fără scor</span>')
        return '-'
    
    @admin.display(description='R4')
    def get_r4_score(self, obj):
        """Display R4 score with edit link"""
        if obj.pk:
            score = obj.get_referee_score(4)
            if score is not None:
                return format_html('{:.2f}', score)
            return mark_safe('<span style="color: #999;">Fără scor</span>')
        return '-'
    
    @admin.display(description='R5')
    def get_r5_score(self, obj):
        """Display R5 score with edit link"""
        if obj.pk:
            score = obj.get_referee_score(5)
            if score is not None:
                return format_html('{:.2f}', score)
            return mark_safe('<span style="color: #999;">Fără scor</span>')
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


admin.site.enable_nav_sidebar = True


@admin.register(SupporterAthleteRelation)
class SupporterAthleteRelationAdmin(admin.ModelAdmin):
    list_display = ['supporter', 'athlete', 'relationship', 'status', 'can_edit', 'can_register_competitions', 'created']
    list_filter = ['status', 'relationship', 'can_edit', 'can_register_competitions', 'created']
    search_fields = ['supporter__username', 'supporter__email', 'athlete__first_name', 'athlete__last_name']
    ordering = ['-created']
    actions = ['approve_relations', 'reject_relations']

    def approve_relations(self, request, queryset):
        for relation in queryset:
            relation.approve(request.user)
    approve_relations.short_description = 'Aprobă relațiile selectate'

    def reject_relations(self, request, queryset):
        for relation in queryset:
            relation.reject(request.user)
    reject_relations.short_description = 'Respinge relațiile selectate'


# Note: CategoryAthleteScore now has its own admin page (see
# CategoryAthleteScoreAdmin in api/admin/competitions.py) for reviewing
# athlete-submitted results, alongside CategoryTeamScoreInline/
# CategoryRefereeScoreInline on the category admins.


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


