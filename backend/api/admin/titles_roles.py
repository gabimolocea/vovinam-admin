from django.contrib import admin
from django.utils.translation import gettext_lazy as _
from ..models import Title, FederationRole


admin.site.enable_nav_sidebar = True


@admin.register(Title)
class TitleAdmin(admin.ModelAdmin):
    list_display = ('name',)
    search_fields = ('name',)

# Register FederationRole model
@admin.register(FederationRole)
class FederationRoleAdmin(admin.ModelAdmin):
    list_display = ('name', 'get_associated_athletes')
    search_fields = ('name',)

    def get_queryset(self, request):
        """Prefetch related athletes to avoid a query per row on the changelist."""
        qs = super().get_queryset(request)
        return qs.prefetch_related('athletes')

    def get_associated_athletes(self, obj):
        """
        Custom method to display athletes associated with the federation role.
        """
        athletes = obj.athletes.all()
        return ", ".join([f"{athlete.first_name} {athlete.last_name}" for athlete in athletes]) if athletes else "Niciunul"
    get_associated_athletes.short_description = _('Sportivi asociați')


# Competition model is now represented as an Event (event_type='competition').
# To avoid duplicate/confusing admin UI we do not register Competition here.
# The legacy Competition model remains in code for compatibility but admin users
# should manage events via the Landing > Event admin.
