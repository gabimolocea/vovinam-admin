from django.contrib import admin
from django.utils.translation import gettext_lazy as _
from ..models import CategoryTeam, Team, TeamMember
from django import forms


# Formularele si inline-urile folosite mai jos, in acest fisier si nicaieri
# altundeva. Au stat pana acum in _common.py, desi nu erau comune cu nimeni.
class TeamMemberInline(admin.TabularInline):
    model = TeamMember
    extra = 1  # Allow adding new athletes to the team
    autocomplete_fields = ['athlete']
    verbose_name = _('Membru echipă')
    verbose_name_plural = _('Membri echipă')


class CategoryTeamInline(admin.TabularInline):
    model = CategoryTeam
    extra = 0
    autocomplete_fields = ['category']
    fields = ('category', 'place_obtained')
    readonly_fields = ('place_obtained',)
    verbose_name_plural = _("ECHIPĂ ÎNSCRISĂ ÎN URMĂTOARELE CATEGORII")  # Rename the section title
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

class TeamAdminForm(forms.ModelForm):
    """Custom form for Team that excludes the name property"""
    class Meta:
        model = Team
        exclude = ['categories']  # Only exclude many-to-many, name is handled automatically as property


admin.site.enable_nav_sidebar = True


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


