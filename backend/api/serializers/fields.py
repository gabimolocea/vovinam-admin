from rest_framework import serializers
from django.db.models import Q
from ..models import *
from landing.models import Event


from ._common import (
    _person_name,
)
class CompetitionFieldSerializer(serializers.ModelSerializer):
    """Serializer for competition fields (tatamis/scoring stations)"""
    event_name = serializers.CharField(source='event.title', read_only=True)
    category_count = serializers.SerializerMethodField(read_only=True)

    def get_category_count(self, obj):
        return obj.category_assignments.count()
    
    class Meta:
        model = CompetitionField
        fields = [
            'id', 'event', 'event_name', 'name', 'field_number', 'is_active',
            'start_time', 'category_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class FieldBreakSerializer(serializers.ModelSerializer):
    """Serializer for field breaks/pauses"""
    field_name = serializers.CharField(source='field.name', read_only=True)

    class Meta:
        model = FieldBreak
        fields = [
            'id', 'field', 'field_name', 'label', 'duration', 'order',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class CategoryFieldAssignmentSerializer(serializers.ModelSerializer):
    """Serializer for assigning categories to fields"""
    
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_type = serializers.SerializerMethodField(read_only=True)
    field_name = serializers.CharField(source='field.name', read_only=True)
    
    class Meta:
        model = CategoryFieldAssignment
        fields = [
            'id', 'category', 'category_name', 'category_type', 'field', 'field_name',
            'status', 'scheduled_start_time', 'actual_start_time', 'actual_end_time',
            'order', 'estimated_duration', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
    
    def get_category_type(self, obj):
        """Get the category type (solo, team, fight)"""
        return getattr(obj.category, 'type', None) or obj.category.__class__.__name__.lower()


class DisplayMonitorSessionSerializer(serializers.ModelSerializer):
    """Serializer for display monitor sessions"""
    
    field_name = serializers.CharField(source='field.name', read_only=True)
    current_category_name = serializers.CharField(source='current_category.name', read_only=True, allow_null=True)
    current_match_number = serializers.CharField(source='current_match.match_number', read_only=True, allow_null=True)
    current_athlete_name = serializers.SerializerMethodField(read_only=True)
    current_team_name = serializers.SerializerMethodField(read_only=True)
    current_team_members = serializers.SerializerMethodField(read_only=True)
    current_team_club_name = serializers.SerializerMethodField(read_only=True)
    current_athlete_score_id = serializers.SerializerMethodField(read_only=True)
    
    class Meta:
        model = DisplayMonitorSession
        fields = [
            'id', 'field', 'field_name', 'current_category', 'current_category_name',
            'current_match', 'current_match_number', 'current_athlete', 'current_athlete_name',
            'current_team_name', 'current_team_members', 'current_team_club_name', 'current_athlete_score_id',
            'status', 'break_end_time', 'break_paused', 'break_paused_remaining',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']

    def _get_team_context(self, obj):
        cached = getattr(obj, '_display_team_context', None)
        if cached is not None:
            return cached

        context = None
        category = getattr(obj, 'current_category', None)
        athlete_id = getattr(obj, 'current_athlete_id', None)

        if category and athlete_id and getattr(category, 'type', None) in ['team', 'teams']:
            team_score = (
                CategoryAthleteScore.objects
                .filter(category_id=category.id, type__in=['team', 'teams'], team_members__id=athlete_id)
                .prefetch_related('team_members__club')
                .distinct()
                .first()
            )

            athletes = []
            if team_score:
                athletes = list(team_score.team_members.select_related('club').all())
                context = {
                    'athlete_score_id': team_score.id,
                    'team_name': build_team_display_name(athletes) or team_score.team_name,
                    'team_members': athletes,
                }
            else:
                enrollment = (
                    CategoryTeam.objects
                    .filter(category_id=category.id, team__members__athlete_id=athlete_id)
                    .select_related('team')
                    .prefetch_related('team__members__athlete__club')
                    .distinct()
                    .first()
                )
                if enrollment:
                    athletes = [member.athlete for member in enrollment.team.members.all() if member.athlete_id]
                    context = {
                        'athlete_score_id': None,
                        'team_name': build_team_display_name(athletes) or enrollment.team.name,
                        'team_members': athletes,
                    }

            if context:
                club_names = []
                for athlete in context['team_members']:
                    club_name = getattr(getattr(athlete, 'club', None), 'name', None)
                    if club_name and club_name not in club_names:
                        club_names.append(club_name)
                context['team_club_name'] = ' / '.join(club_names)

        obj._display_team_context = context
        return context
    
    def get_current_athlete_name(self, obj):
        """Get full name of current athlete or active team name."""
        team_context = self._get_team_context(obj)
        if team_context and team_context.get('team_name'):
            return team_context['team_name']
        if obj.current_athlete:
            return f"{obj.current_athlete.first_name} {obj.current_athlete.last_name}"
        return None

    def get_current_team_name(self, obj):
        team_context = self._get_team_context(obj)
        return team_context.get('team_name') if team_context else None

    def get_current_team_members(self, obj):
        team_context = self._get_team_context(obj)
        if not team_context:
            return []
        return [
            {
                'id': athlete.id,
                'name': f"{athlete.first_name} {athlete.last_name}".strip(),
                'first_name': athlete.first_name,
                'last_name': athlete.last_name,
            }
            for athlete in team_context.get('team_members', [])
        ]

    def get_current_team_club_name(self, obj):
        team_context = self._get_team_context(obj)
        return team_context.get('team_club_name') if team_context else None

    def get_current_athlete_score_id(self, obj):
        team_context = self._get_team_context(obj)
        return team_context.get('athlete_score_id') if team_context else None


class QRCodeAssignmentSerializer(serializers.ModelSerializer):
    """Serializer for QR code assignments"""
    
    referee_name = serializers.SerializerMethodField(read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True, allow_null=True)
    match_number = serializers.CharField(source='match.match_number', read_only=True, allow_null=True)
    
    class Meta:
        model = QRCodeAssignment
        fields = [
            'id', 'referee', 'referee_name', 'category', 'category_name',
            'match', 'match_number', 'code', 'is_active', 'created_at', 'expires_at'
        ]
        read_only_fields = ['code', 'created_at']
    
    def get_referee_name(self, obj):
        """Get full name of referee"""
        return _person_name(obj.referee)

