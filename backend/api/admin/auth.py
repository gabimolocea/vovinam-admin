from django.contrib import admin
from django.db.models import Count
from ..models import Group, UserProxy


admin.site.enable_nav_sidebar = True


@admin.register(Group)
class GroupAdmin(admin.ModelAdmin):
    """
    Admin configuration for the Group model.
    Manages age-based groups for organizing categories.
    """
    list_display = ('name', 'event', 'get_age_range', 'allowed_grade_type', 'display_order', 'get_category_count')
    search_fields = ('name', 'event__title')
    list_filter = ('event', 'allowed_grade_type', 'allow_younger')
    fieldsets = (
        ('Informații de bază', {
            'fields': ('name', 'event', 'display_order')
        }),
        ('Interval vârstă', {
            'fields': ('birth_year_start', 'birth_year_end', 'allow_younger'),
            'description': (
                'Definește intervalul anilor de naștere pentru sportivii din această grupă '
                '(de exemplu, 2015-2018). O grupă cu o singură limită se citește deschis: '
                '„2008” în anul de început înseamnă născuți în 2008 sau mai devreme.'
            )
        }),
        ('Restricție de grad', {
            'fields': ('allowed_grade_type',),
            'description': (
                'Limitează grupa la un tip de grad. Se folosește la seniori, unde grupa mică '
                'e pentru grade inferioare și cea mare pentru grade superioare. Nu blochează '
                'înscrierea, doar avertizează la înscrierea unui sportiv nepotrivit.'
            )
        }),
        ('Interval exact pe date', {
            'fields': ('birth_date_start', 'birth_date_end'),
            'classes': ('collapse',),
            'description': (
                'Opțional. Dacă sunt completate, au prioritate față de anii de naștere de mai sus. '
                'Se folosesc doar când regulamentul cere o zi anume, nu tot anul.'
            )
        }),
    )
    
    def get_queryset(self, request):
        """Select related event and annotate category count to avoid N+1 queries."""
        qs = super().get_queryset(request)
        return qs.select_related('event').annotate(category_count_annotated=Count('categories', distinct=True))

    def get_age_range(self, obj):
        """Display the age range for this group"""
        if obj.birth_year_start and obj.birth_year_end:
            return f"{obj.birth_year_start} - {obj.birth_year_end}"
        elif obj.birth_year_start:
            return f"{obj.birth_year_start}+"
        elif obj.birth_year_end:
            return f"până la {obj.birth_year_end}"
        return "Nesetat"
    get_age_range.short_description = 'Interval ani naștere'
    
    def get_category_count(self, obj):
        """Display number of categories in this group (uses the annotated count, no extra query)"""
        return f"{obj.category_count_annotated} categorii"
    get_category_count.short_description = 'Categorii'
    get_category_count.admin_order_field = 'category_count_annotated'


# User Admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin


@admin.register(UserProxy)
class UserAdmin(BaseUserAdmin):
    """Custom User admin with role management."""
    list_display = ('email', 'first_name', 'last_name', 'role', 'is_active', 'date_joined')
    list_filter = ('role', 'is_active', 'is_staff', 'is_superuser', 'date_joined')
    search_fields = ('email', 'first_name', 'last_name', 'username')
    ordering = ('-date_joined',)
    readonly_fields = ('last_login', 'date_joined', 'terms_accepted_at')

    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Date personale', {'fields': ('first_name', 'last_name', 'email', 'phone_number', 'date_of_birth')}),
        ('Rol și permisiuni', {'fields': ('role', 'profile_completed', 'is_active', 'is_staff', 'is_superuser')}),
        ('Grupuri și permisiuni', {'fields': ('groups', 'user_permissions')}),
        ('Date importante', {'fields': ('last_login', 'date_joined', 'terms_accepted_at')}),
    )
    
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'email', 'first_name', 'last_name', 'password1', 'password2', 'role'),
        }),
    )


# Athlete Profile Management Admin