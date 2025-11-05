from django.contrib import admin, messages
from django.utils.html import format_html
from django.forms import ModelForm
from django.core.exceptions import ValidationError
from django import forms
from django.urls import path, reverse
from django.shortcuts import render
from django.db.models import Count
from .models import (
    City,
    Club,
    Athlete,
    AthleteActivity,
    CategoryScoreActivity,
    SupporterAthleteRelation,
    MedicalVisa,
    TrainingSeminar,
    TrainingSeminarParticipation,
    Grade,
    GradeHistory,
    Title,
    FederationRole,
    Competition,
    AnnualVisa,
    Category,
    Team,
    CategoryTeam,
    CategoryAthlete,
    Match,
    RefereeScore,
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
# Move landing.Event into the API admin section by using a proxy model.
try:
    from landing.models import Event as LandingEvent
    from landing.admin import EventAdmin as LandingEventAdmin
    from .models import EventProxy

    # If the landing Event was already registered, unregister it so we don't show
    # it twice in the admin. Then register the proxy under the `api` app label.
    try:
        admin.site.unregister(LandingEvent)
    except Exception:
        # Not registered yet or already unregistered - ignore
        pass

    try:
        admin.site.register(EventProxy, LandingEventAdmin)
    except Exception:
        # If registration fails for any reason, fail silently here; admin
        # autodiscovery or migrations may import at times when registration
        # is not possible. This keeps startup stable.
        pass
except Exception:
    # If landing isn't importable at module import time (migrations, tests),
    # just skip moving the admin registration.
    pass


class AthleteInline(admin.TabularInline):
    model = Athlete
    fields = ('first_name', 'last_name', 'club', 'city')
    extra = 0
    verbose_name = "Athlete"
    verbose_name_plural = "Athletes"

class CategoryAthleteInline(admin.TabularInline):
    model = CategoryAthlete
    extra = 0
    autocomplete_fields = ['athlete']  # Enable autocomplete for the athlete field
    verbose_name = "Athlete"
    verbose_name_plural = "Athletes"

    def get_formset(self, request, obj=None, **kwargs):
        """
        Dynamically adjust the inline title and fields based on the parent model.
        """
        if isinstance(obj, Category):
            if obj.type == 'fight':
                self.verbose_name = "Athlete"
                self.verbose_name_plural = "ENROLLED ATHLETES"
                self.fields = ('athlete', 'weight')  # Only include actual fields from the model
                self.readonly_fields = ('category_with_competition', 'category_type')  # Computed fields are read-only
            elif obj.type == 'solo':
                self.verbose_name = "Enrolled Athlete"
                self.verbose_name_plural = "Enrolled Athletes"

            else:
                self.verbose_name = "Competition History"
                self.verbose_name_plural = "Add another Competition History"
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
    athlete_with_club.short_description = "Athlete (Club)"

    def category_with_competition(self, obj):
        """
        Display the category name along with its competition.
        """
        return f"{obj.category.name} ({obj.category.competition.name})"
    category_with_competition.short_description = "Category (Competition)"

    def category_type(self, obj):
        """
        Display the type of the category.
        """
        return obj.category.type.capitalize()
    category_type.short_description = "Category Type"


# Custom Team Results display - using the improved approach from before
# Since Django admin inlines have limitations with ManyToMany relationships,
# we'll use the custom field display method in the main AthleteAdmin

# Inline GradeHistory for Athlete
class GradeHistoryInline(admin.TabularInline):
    model = GradeHistory
    fk_name = 'athlete'  # There are two FKs to Athlete on GradeHistory; ensure inline uses the athlete FK
    extra = 0  # Display only existing entries
    readonly_fields = ('obtained_date',)  # Make obtained_date read-only
    show_change_link = True  # Enable link to open the GradeHistory add/edit page
    # Enable autocomplete for examiner fields in the inline and restrict to coaches
    autocomplete_fields = ('examiner_1', 'examiner_2')

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
                    link = format_html('<a href="{}">view existing record</a>', url)
                    message = format_html('An entry for this athlete and grade already exists. {}', link)
                except Exception:
                    # Fallback to plain text message if reverse fails
                    message = 'An entry for this athlete and grade already exists.'
                # Attach error to the grade field for a friendly admin message with link
                raise ValidationError({'grade': message})
        return cleaned

# Inline MedicalVisa for Athlete
class MedicalVisaInline(admin.TabularInline):
    model = MedicalVisa
    extra = 0  # Display only existing entries
    fields = ('issued_date', 'health_status', 'medical_document', 'medical_image', 'notes', 'visa_status')  # Include medical certificate fields
    readonly_fields = ('visa_status',)  # Make visa status read-only

    def visa_status(self, obj):
        """
        Display visa status as 'Available' or 'Expired'.
        """
        return "Available" if obj.is_valid else "Expired"
    visa_status.short_description = "Visa Status"

# Inline AnnualVisa for Athlete
class AnnualVisaInline(admin.TabularInline):
    model = AnnualVisa
    extra = 0  # Display only existing entries
    fields = ('issued_date', 'visa_status', 'visa_status_display')  # Include visa status
    readonly_fields = ('visa_status_display',)  # Make visa status read-only

    def visa_status_display(self, obj):
        """
        Display visa status as 'Available' or 'Expired'.
        """
        return "Available" if obj.is_valid else "Expired"
    visa_status_display.short_description = "Visa Status"

# Inline TrainingSeminar for Athlete
class TrainingSeminarInline(admin.TabularInline):
    model = TrainingSeminar.athletes.through  # Use the through table for the Many-to-Many relationship
    extra = 0  # Display only existing entries
    show_change_link = False  # Do not show change link because seminars are managed via Event
    verbose_name = "TRAINING SEMINAR"
    verbose_name_plural = "TRAINING SEMINARS"


class TrainingSeminarParticipationInline(admin.TabularInline):
    """Show approved participation (enrolled) athletes on the TrainingSeminar admin page."""
    model = TrainingSeminarParticipation
    extra = 0
    show_change_link = True
    verbose_name = 'Enrolled Athlete'
    verbose_name_plural = 'Enrolled Athletes'
    # Expose fields so admins can add/remove enrollments directly via the inline
    fields = ('athlete', 'status', 'submitted_by_athlete', 'participation_certificate', 'participation_document', 'admin_notes', 'reviewed_date', 'reviewed_by')
    readonly_fields = ('reviewed_date', 'reviewed_by')
    can_delete = True

class AthleteTrainingSeminarParticipationInline(admin.TabularInline):
    """Inline on Athlete admin to show the athlete's approved seminar enrollments."""
    model = TrainingSeminarParticipation
    fk_name = 'athlete'
    extra = 0
    show_change_link = True
    verbose_name = 'Enrolled Seminar'
    verbose_name_plural = 'Enrolled Seminars'
    fields = ('seminar_link', 'status', 'submitted_by_athlete', 'reviewed_date', 'reviewed_by')
    readonly_fields = ('seminar_link', 'status', 'submitted_by_athlete', 'reviewed_date', 'reviewed_by')
    can_delete = False

    def seminar_link(self, obj):
        # Prefer linked Event when available (created by migration). If present, link to the
        # Landing > Event admin page; otherwise, show the legacy seminar name without a link.
        try:
            if getattr(obj, 'event', None):
                ev = obj.event
                return format_html('<a href="/admin/landing/event/{}/change/">{}</a>', ev.pk, ev.title)
            # Fall back to legacy TrainingSeminar display
            return obj.seminar.name
        except Exception:
            return str(getattr(obj, 'seminar', obj))
    seminar_link.short_description = 'Seminar'

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.filter(status='approved')

    def athlete_link(self, obj):
        return format_html('<a href="/admin/api/athlete/{}/change/">{} {}</a>', obj.athlete.pk, obj.athlete.first_name, obj.athlete.last_name)
    athlete_link.short_description = 'Athlete'
    # Use the GradeHistoryAdminForm for any GradeHistory inlines if present
    # (No-op here but ensures consistent validation if used)
    # Note: this inline is for TrainingSeminarParticipation; GradeHistory inlines are separate.
    

class MatchInline(admin.TabularInline):
    model = Match
    extra = 0
    autocomplete_fields = ['red_corner', 'blue_corner', 'winner']  # Enable autocomplete for these fields
    fields = ('match_type', 'red_corner', 'blue_corner', 'winner')  # Do not show referees
    readonly_fields = ('winner',)
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

class RefereeScoreInline(admin.TabularInline):
    model = RefereeScore
    extra = 0
    autocomplete_fields = ['referee']
    fields = ('referee', 'red_corner_score', 'blue_corner_score', 'winner')

class CategoryAthleteScoreInline(admin.TabularInline):
    model = CategoryAthleteScore  # Ensure this model exists in your models.py
    extra = 0
    autocomplete_fields = ['athlete', 'referee']  # Enable autocomplete for athlete and referee fields
    fields = ('athlete', 'referee', 'score')  # Display athlete, referee, and score fields
    verbose_name = "Athlete Score"
    verbose_name_plural = "Athlete Scores"

class CategoryTeamScoreInline(admin.TabularInline):
    model = CategoryTeamScore  # Ensure this model exists in your models.py
    extra = 0
    autocomplete_fields = ['team', 'referee']  # Enable autocomplete for team and referee fields
    fields = ('team', 'referee', 'score')  # Display team, referee, and score fields
    verbose_name = "Team Score"
    verbose_name_plural = "Team Scores"

class TeamMemberInline(admin.TabularInline):
    model = TeamMember
    extra = 1  # Allow adding new athletes to the team
    verbose_name = "Team Member"
    verbose_name_plural = "Team Members"

class EnrolledTeamsInline(admin.TabularInline):
    model = CategoryTeam
    extra = 1  # Allow adding new teams
    fields = ('team', 'place_obtained')
    readonly_fields = ('place_obtained',)
    verbose_name_plural = "TEAMS ENROLLED"  # Rename the section title

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

class AthleteSoloResultsInline(admin.TabularInline):
    """
    Inline to display results for solo categories.
    """
    model = CategoryAthlete
    extra = 0
    verbose_name = "Solo Results"
    verbose_name_plural = "Solo Results"
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
    category_name.short_description = "Category Name"

    def competition_name(self, obj):
        """
        Display the competition name.
        """
        return obj.category.competition.name if obj.category.competition else "N/A"
    competition_name.short_description = "Competition Name"

    def results(self, obj):
        """
        Display the results of the athlete for solo categories.
        """
        if obj.category.first_place == obj.athlete:
            return "1st Place"
        elif obj.category.second_place == obj.athlete:
            return "2nd Place"
        elif obj.category.third_place == obj.athlete:
            return "3rd Place"
        return "No Placement"
    results.short_description = "Place Obtained"


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

# Register Club model
@admin.register(Club)
class ClubAdmin(admin.ModelAdmin):
    list_display = ('name', 'city', 'address', 'mobile_number', 'website', 'created', 'modified')
    search_fields = ('name', 'city__name')
    filter_horizontal = ('coaches',)  # Add horizontal filter for ManyToManyField

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


# FrontendTheme admin removed — frontend theme management has been disabled.

# Original Athlete admin removed - using consolidated AthleteAdmin below

# Register MedicalVisa model
@admin.register(MedicalVisa)
class MedicalVisaAdmin(admin.ModelAdmin):
    list_display = ('athlete', 'issued_date', 'health_status', 'visa_status')  # Display visa status
    search_fields = ('athlete__first_name', 'athlete__last_name')
    list_filter = ('health_status',)  # Add a filter for health status
    readonly_fields = ('visa_status',)  # Make visa status read-only

    def visa_status(self, obj):
        """
        Display visa status as 'Available' or 'Expired'.
        """
        return "Available" if obj.is_valid else "Expired"
    visa_status.short_description = "Visa Status"

# Register AnnualVisa model
@admin.register(AnnualVisa)
class AnnualVisaAdmin(admin.ModelAdmin):
    list_display = ('athlete', 'issued_date', 'visa_status', 'visa_status_display')  # Display visa status
    search_fields = ('athlete__first_name', 'athlete__last_name', 'visa_status')
    list_filter = ('visa_status',)  # Add a filter for visa status
    readonly_fields = ('visa_status_display',)  # Make visa status read-only

    def visa_status_display(self, obj):
        """
        Display visa status as 'Available' or 'Expired'.
        """
        return "Available" if obj.is_valid else "Expired"
    visa_status_display.short_description = "Visa Status"


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
    list_display = ('name', 'rank_order', 'grade_type', 'created', 'modified')  # Include grade_type in list_display
    search_fields = ('name', 'grade_type')  # Enable search by grade_type
    list_filter = ('grade_type', 'created', 'modified')  # Enable filtering by grade_type

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
    get_associated_athletes.short_description = 'Associated Athletes'


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
    search_fields = ('name', 'event__title', 'competition__name', 'type', 'gender', 'group_name')  # Add search fields
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
    display_winners.short_description = "Winners"

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
    enrolled_teams_count.short_description = "Enrolled Teams Count"

    def enrolled_individuals_count(self, obj):
        """
        Display the number of individuals enrolled in the category.
        """
        return obj.enrolled_individuals.count()
    enrolled_individuals_count.short_description = "Enrolled Individuals Count"

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
    assigned_categories.short_description = "Assigned Categories"

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

@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    list_display = ('name_with_corners', 'match_type', 'get_winner', 'category_link', 'competition')
    search_fields = ('name', 'red_corner__first_name', 'red_corner__last_name', 'blue_corner__first_name', 'blue_corner__last_name', 'winner__first_name', 'category__name', 'category__competition__name', 'category__event__title')
    list_filter = ('match_type', 'category__competition')

    fieldsets = (
        ('MATCH DETAILS', {
            'fields': ('category', 'match_type', 'red_corner', 'blue_corner', 'winner')  # Added winner field
        }),
    )

    autocomplete_fields = ['red_corner', 'blue_corner', 'winner']  # Enable autocomplete for these fields

    inlines = [RefereeScoreInline]

    def name_with_corners(self, obj):
        """
        Display the full names of the athletes with their corner in parentheses.
        """
        return f"{obj.red_corner.first_name} {obj.red_corner.last_name} (Red Corner) vs {obj.blue_corner.first_name} {obj.blue_corner.last_name} (Blue Corner)"
    name_with_corners.short_description = "Match Name"

    def competition(self, obj):
        """
        Display the competition name associated with the match.
        """
        return obj.category.competition.name if obj.category.competition else "N/A"
    competition.short_description = "Competition"

    def category_link(self, obj):
        """
        Display the category name as a clickable link.
        """
        return format_html('<a href="/admin/api/category/{}/change/">{}</a>', obj.category.id, obj.category.name)
    category_link.short_description = "Category"

    def get_winner(self, obj):
        """
        Display the full name of the winner in the admin interface.
        """
        return f"{obj.winner.first_name} {obj.winner.last_name}" if obj.winner else "TBD"
    get_winner.short_description = "Winner"

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
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

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
    list_display = [
        'get_full_name', 'user_email', 'status', 'current_grade', 'club', 'city', 
        'date_of_birth', 'is_coach', 'is_referee', 'submitted_date', 'get_action_buttons'
    ]
    list_filter = ['status', 'current_grade', 'club', 'city', 'is_coach', 'is_referee', 'submitted_date', 'reviewed_date']
    search_fields = ['first_name', 'last_name', 'user__email', 'user__username', 'current_grade__name', 'club__name', 'city__name']
    readonly_fields = ['submitted_date', 'reviewed_date', 'current_grade', 'get_team_results_display']
    ordering = ['-submitted_date']
    inlines = [
        AthleteActivityInline,
        GradeHistoryInline,
        MedicalVisaInline,
        AnnualVisaInline,
        AthleteTrainingSeminarParticipationInline,
        AthleteSoloResultsInline,
        AthleteFightResultsInline,
        # Team results displayed via custom method in fieldsets instead of inline
        # due to Django admin limitations with ManyToMany relationships
    ]
    
    fieldsets = (
        ('Personal Information', {
            'fields': ('user', 'first_name', 'last_name', 'date_of_birth', 'address', 'mobile_number', 'profile_image')
        }),
        ('Sports & Club Information', {
            'fields': ('club', 'city', 'current_grade', 'federation_role', 'title', 'registered_date', 'expiration_date', 'is_coach', 'is_referee')
        }),
        ('Emergency Contact', {
            'fields': ('emergency_contact_name', 'emergency_contact_phone')
        }),
        ('Team Results', {
            'fields': ('get_team_results_display',),
            'description': 'Team results where this athlete is involved (as submitter or team member)'
        }),
        ('Approval Workflow', {
            'fields': ('status', 'submitted_date', 'reviewed_date', 'reviewed_by')
        }),
    )
    
    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}"
    get_full_name.short_description = 'Name'
    get_full_name.admin_order_field = 'first_name'
    
    def user_email(self, obj):
        return obj.user.email if obj.user else 'No user'
    user_email.short_description = 'Email'
    user_email.admin_order_field = 'user__email'
    
    def get_action_buttons(self, obj):
        if obj.status == 'pending':
            return format_html(
                '<a class="button" href="{}approve/">Approve</a> '
                '<a class="button" href="{}reject/">Reject</a> '
                '<a class="button" href="{}request_revision/">Request Revision</a>',
                obj.pk, obj.pk, obj.pk
            )
        elif obj.status == 'approved':
            return format_html('<span style="color: green;">✓ Approved</span>')
        elif obj.status == 'rejected':
            return format_html('<span style="color: red;">✗ Rejected</span>')
        elif obj.status == 'revision_required':
            return format_html('<span style="color: orange;">⚠ Revision Required</span>')
        return ''
    get_action_buttons.short_description = 'Actions'
    
    def get_team_results_display(self, obj):
        """Display team results where this athlete is involved"""
        from django.db import models
        
        # Get all team results where athlete is involved (as main athlete or team member)
        team_results = CategoryAthleteScore.objects.filter(
            type='teams'
        ).filter(
            models.Q(athlete=obj) | models.Q(team_members=obj)
        ).distinct().select_related('category__competition').prefetch_related('team_members')
        
        if not team_results.exists():
            return format_html('<div class="inline-group" style="margin: 0;"><div class="tabular inline-related"><h2>Team Results (0)</h2><div style="padding: 10px; font-style: italic; color: #666;">No team results found</div></div></div>')
        
        html_parts = []
        # Start with Django admin inline-like styling
        html_parts.append('<div class="inline-group" style="margin: 0;">')
        html_parts.append(f'<div class="tabular inline-related">')
        html_parts.append(f'<h2>Team Results ({team_results.count()})</h2>')
        html_parts.append('<table>')
        html_parts.append('<thead>')
        html_parts.append('<tr>')
        html_parts.append('<th class="original">Competition</th>')
        html_parts.append('<th class="original">Category</th>')
        html_parts.append('<th class="original">Placement</th>')
        html_parts.append('<th class="original">Team Name</th>')
        html_parts.append('<th class="original">Team Members</th>')
        html_parts.append('<th class="original">Status</th>')
        html_parts.append('<th class="original">Role</th>')
        html_parts.append('</tr>')
        html_parts.append('</thead>')
        html_parts.append('<tbody>')
        
        for i, result in enumerate(team_results):
            # Determine placement with medal emojis
            placement = result.placement_claimed or "N/A"
            if placement == '1st':
                placement_display = "🥇 1st Place"
            elif placement == '2nd':
                placement_display = "🥈 2nd Place"
            elif placement == '3rd':
                placement_display = "🥉 3rd Place"
            else:
                placement_display = placement
            
            # Get team members
            team_members = ', '.join([
                f"{member.first_name} {member.last_name}" 
                for member in result.team_members.all()
            ])
            
            # Determine role
            role = "Team Member"
            if result.athlete == obj:
                role = "Submitter" if result.submitted_by_athlete else "Main Athlete"
            
            # Status with colors
            status = result.status
            if status == 'approved':
                status_display = '<span style="color: green;">✅ Approved</span>'
            elif status == 'pending':
                status_display = '<span style="color: orange;">⏳ Pending</span>'
            elif status == 'rejected':
                status_display = '<span style="color: red;">❌ Rejected</span>'
            else:
                status_display = status
            
            # Use Django admin row styles
            row_class = 'row1' if i % 2 == 0 else 'row2'
            html_parts.append(f'<tr class="{row_class}">')
            html_parts.append(f'<td>{result.category.competition.name}</td>')
            html_parts.append(f'<td>{result.category.name}</td>')
            html_parts.append(f'<td>{placement_display}</td>')
            html_parts.append(f'<td>{result.team_name or "Auto-generated"}</td>')
            html_parts.append(f'<td style="font-size: 0.9em;">{team_members}</td>')
            html_parts.append(f'<td>{status_display}</td>')
            html_parts.append(f'<td><strong>{role}</strong></td>')
            html_parts.append('</tr>')
        
        html_parts.append('</tbody>')
        html_parts.append('</table>')
        html_parts.append('</div>')
        html_parts.append('</div>')
        return format_html(''.join(html_parts))
    
    get_team_results_display.short_description = 'Team Results'

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
    get_athlete_name.short_description = 'Athlete'
    get_athlete_name.admin_order_field = 'athlete__first_name'
    
    def get_competition_name(self, obj):
        return obj.category.competition.name
    get_competition_name.short_description = 'Competition'
    # Keep admin ordering keyed to the legacy competition name for now; Event ordering could be added later
    get_competition_name.admin_order_field = 'category__competition__name'
    
    def get_category_name(self, obj):
        return obj.category.name
    get_category_name.short_description = 'Category'
    get_category_name.admin_order_field = 'category__name'
    
    def get_submission_type(self, obj):
        if obj.submitted_by_athlete:
            return f"🏅 Self-Submitted ({obj.placement_claimed or 'No placement'})"
        else:
            return f"🥋 Referee Score ({obj.score})"
    get_submission_type.short_description = 'Type'
    
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
    get_action_buttons.short_description = 'Actions'
    
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
