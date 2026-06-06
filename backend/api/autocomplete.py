"""
Autocomplete views for django-autocomplete-light
Used in admin forms for better user experience
"""
from django.db import models
from dal import autocomplete
import unicodedata
from .models import (
    Athlete, Club, Category, Grade, FederationRole,
    Title, City, Team, Event, Match, TrainingSeminarParticipation
)


class AthleteAutocomplete(autocomplete.Select2QuerySetView):
    def get_result_label(self, item):
        club_name = item.club.name if item.club else None
        if club_name:
            return f"{item.first_name} {item.last_name} ({club_name})"
        return f"{item.first_name} {item.last_name}"

    def get_selected_result_label(self, item):
        return self.get_result_label(item)

    def get_queryset(self):
        qs = Athlete.objects.all()

        forwarded = getattr(self, 'forwarded', {}) or {}
        event_id = forwarded.get('event')
        if not event_id:
            category_id = forwarded.get('category')
            if category_id:
                event_id = Category.objects.filter(pk=category_id).values_list('event_id', flat=True).first()

        if event_id:
            qs = qs.filter(
                seminar_participations__event_id=event_id,
                seminar_participations__status='approved'
            )

        only_referees = forwarded.get('only_referees') or self.request.GET.get('only_referees')
        if str(only_referees).lower() in {'1', 'true', 'yes'}:
            qs = qs.filter(is_referee=True)

        if self.q:
            qs = qs.filter(
                models.Q(first_name__icontains=self.q) |
                models.Q(last_name__icontains=self.q) |
                models.Q(club__name__icontains=self.q)
            )

        return qs.select_related('club').distinct().order_by('last_name', 'first_name')


class ClubAutocomplete(autocomplete.Select2QuerySetView):
    def get_queryset(self):
        qs = Club.objects.all()
        
        if self.q:
            qs = qs.filter(name__icontains=self.q)
        
        return qs.order_by('name')


class CategoryAutocomplete(autocomplete.Select2QuerySetView):
    def get_queryset(self):
        qs = Category.objects.all()
        
        if self.q:
            qs = qs.filter(name__icontains=self.q)
        
        return qs.order_by('name')


class GradeAutocomplete(autocomplete.Select2QuerySetView):
    def get_queryset(self):
        qs = Grade.objects.all()
        
        if self.q:
            qs = qs.filter(name__icontains=self.q)
        
        return qs.order_by('order')


class FederationRoleAutocomplete(autocomplete.Select2QuerySetView):
    def get_queryset(self):
        qs = FederationRole.objects.all()
        
        if self.q:
            qs = qs.filter(name__icontains=self.q)
        
        return qs.order_by('name')


class TitleAutocomplete(autocomplete.Select2QuerySetView):
    def get_queryset(self):
        qs = Title.objects.all()
        
        if self.q:
            qs = qs.filter(name__icontains=self.q)
        
        return qs.order_by('name')


class CityAutocomplete(autocomplete.Select2QuerySetView):
    def get_queryset(self):
        qs = City.objects.all()

        def normalize(value: str) -> str:
            if not value:
                return ''
            normalized = unicodedata.normalize('NFKD', value)
            return ''.join(ch for ch in normalized if not unicodedata.combining(ch)).lower()

        if self.q:
            query = self.q.strip()
            norm_query = normalize(query)
            if norm_query:
                # Match both direct and diacritics-stripped names
                ids = [
                    row['id']
                    for row in City.objects.values('id', 'name')
                    if norm_query in normalize(row['name'])
                ]
                qs = qs.filter(models.Q(name__icontains=query) | models.Q(id__in=ids))

        return qs.order_by('name')


class TeamAutocomplete(autocomplete.Select2QuerySetView):
    def get_queryset(self):
        qs = Team.objects.all()
        
        if self.q:
            qs = qs.filter(team_name__icontains=self.q)
        
        return qs.order_by('team_name')


class EventAutocomplete(autocomplete.Select2QuerySetView):
    def get_queryset(self):
        qs = Event.objects.all()
        
        if self.q:
            qs = qs.filter(name__icontains=self.q)
        
        return qs.order_by('name')


class MatchAutocomplete(autocomplete.Select2QuerySetView):
    def get_queryset(self):
        qs = Match.objects.all()
        
        if self.q:
            # Search by match participants or category
            qs = qs.filter(
                models.Q(category__name__icontains=self.q) |
                models.Q(competitor1__first_name__icontains=self.q) |
                models.Q(competitor1__last_name__icontains=self.q) |
                models.Q(competitor2__first_name__icontains=self.q) |
                models.Q(competitor2__last_name__icontains=self.q)
            )
        
        return qs.select_related('category').order_by('-date')
