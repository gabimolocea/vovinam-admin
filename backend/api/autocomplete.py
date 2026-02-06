"""
Autocomplete views for django-autocomplete-light
Used in admin forms for better user experience
"""
from django.db import models
from dal import autocomplete
from .models import (
    Athlete, Club, Category, Grade, FederationRole, 
    Title, City, Team, Event, Match
)


class AthleteAutocomplete(autocomplete.Select2QuerySetView):
    def get_queryset(self):
        qs = Athlete.objects.all()
        
        if self.q:
            qs = qs.filter(
                models.Q(first_name__icontains=self.q) |
                models.Q(last_name__icontains=self.q) |
                models.Q(club__name__icontains=self.q)
            )
        
        return qs.select_related('club').order_by('last_name', 'first_name')


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
        
        if self.q:
            qs = qs.filter(name__icontains=self.q)
        
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
