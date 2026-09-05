from rest_framework import serializers
from django.db.models import Q
from ..models import *
from landing.models import Event


def _get_prefetched_relation(instance, relation_name):
    return getattr(instance, '_prefetched_objects_cache', {}).get(relation_name)


def _safe_file_url(file_field):
    try:
        return file_field.url if file_field else None
    except Exception:
        return None


def _safe_related(instance, attr_name):
    try:
        return getattr(instance, attr_name, None)
    except Exception:
        return None


def _safe_scalar(value):
    if value is None:
        return None
    try:
        return value.isoformat() if hasattr(value, 'isoformat') else value
    except Exception:
        try:
            return str(value)
        except Exception:
            return None


def _person_name(person, *, last_first=False, default=None):
    if person is None:
        return default

    if hasattr(person, 'first_name') or hasattr(person, 'last_name'):
        first_name = str(getattr(person, 'first_name', '') or '').strip()
        last_name = str(getattr(person, 'last_name', '') or '').strip()
        if last_first:
            parts = [last_name, first_name]
        else:
            parts = [first_name, last_name]
        return ' '.join(part for part in parts if part) or default

    name = str(person).strip()
    return name or default


def _get_team_members(team):
    prefetched_members = _get_prefetched_relation(team, 'members')
    if prefetched_members is not None:
        return [member for member in prefetched_members if getattr(member, 'athlete_id', None)]
    return list(team.members.select_related('athlete__club').all())


def _get_team_athletes(team):
    return [member.athlete for member in _get_team_members(team) if getattr(member, 'athlete', None)]


def _get_team_categories(team):
    prefetched_categories = _get_prefetched_relation(team, 'categories')
    if prefetched_categories is not None:
        return list(prefetched_categories)
    return list(team.categories.all())

# ==================== MINIMAL SERIALIZERS ====================
# Used for relationships and list views (lightweight, no recursion)

class UserMinimalSerializer(serializers.ModelSerializer):
    """Minimal user data for relationships"""
    full_name = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = ['id', 'email', 'username', 'full_name']
    
    def get_full_name(self, obj):
        return _person_name(obj)


class CityMinimalSerializer(serializers.ModelSerializer):
    """Minimal city data"""
    class Meta:
        model = City
        fields = ['id', 'name']


class ClubMinimalSerializer(serializers.ModelSerializer):
    """Minimal club data (no athletes list to prevent recursion)"""
    city = serializers.SerializerMethodField()
    
    class Meta:
        model = Club
        fields = ['id', 'name', 'city']

    def get_city(self, obj):
        try:
            return CityMinimalSerializer(obj.city).data if obj.city else None
        except Exception:
            return None


class GradeMinimalSerializer(serializers.ModelSerializer):
    """Minimal grade data"""
    class Meta:
        model = Grade
        fields = ['id', 'name', 'rank_order']


class AthleteMinimalSerializer(serializers.ModelSerializer):
    """Minimal athlete data for lists and relationships"""
    club = serializers.SerializerMethodField()
    current_grade = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()
    
    class Meta:
        model = Athlete
        fields = [
            'id', 'first_name', 'last_name', 'full_name',
            'date_of_birth',
            'club', 'current_grade', 'is_coach', 'is_referee',
            'status', 'profile_image'
        ]
    
    def get_full_name(self, obj):
        return _person_name(obj)

    def get_club(self, obj):
        try:
            return ClubMinimalSerializer(obj.club).data if obj.club else None
        except Exception:
            return None

    def get_current_grade(self, obj):
        try:
            return GradeMinimalSerializer(obj.current_grade).data if obj.current_grade else None
        except Exception:
            return None

    def to_representation(self, instance):
        try:
            representation = super().to_representation(instance)
        except Exception:
            representation = {
                'id': getattr(instance, 'id', None),
                'first_name': getattr(instance, 'first_name', ''),
                'last_name': getattr(instance, 'last_name', ''),
                'full_name': f"{getattr(instance, 'first_name', '')} {getattr(instance, 'last_name', '')}".strip(),
                'date_of_birth': _safe_scalar(getattr(instance, 'date_of_birth', None)),
                'club': self.get_club(instance),
                'current_grade': self.get_current_grade(instance),
                'is_coach': getattr(instance, 'is_coach', False),
                'is_referee': getattr(instance, 'is_referee', False),
                'status': getattr(instance, 'status', None),
            }
        representation['profile_image'] = _safe_file_url(getattr(instance, 'profile_image', None))
        return representation


class PublicAthleteSerializer(serializers.ModelSerializer):
    """Public athlete profile without private contact, identity, or workflow data."""
    club = ClubMinimalSerializer(read_only=True)
    city = CityMinimalSerializer(read_only=True)
    current_grade = GradeMinimalSerializer(read_only=True)
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = Athlete
        fields = [
            'id', 'first_name', 'last_name', 'full_name', 'gender',
            'club', 'city', 'current_grade', 'is_coach', 'is_referee',
            'profile_image',
        ]

    def get_full_name(self, obj):
        return _person_name(obj)


class TeamMinimalSerializer(serializers.ModelSerializer):
    """Minimal team data"""
    club = serializers.SerializerMethodField()
    club_name = serializers.SerializerMethodField()
    members = serializers.SerializerMethodField()
    
    class Meta:
        model = Team
        fields = ['id', 'name', 'club', 'club_name', 'members']

    def get_club(self, obj):
        athletes = _get_team_athletes(obj)
        first_athlete = athletes[0] if athletes else None
        if first_athlete and first_athlete.club:
            return ClubMinimalSerializer(first_athlete.club).data
        return None

    def get_club_name(self, obj):
        athletes = _get_team_athletes(obj)
        first_athlete = athletes[0] if athletes else None
        if first_athlete and first_athlete.club:
            return first_athlete.club.name
        return ''

    def get_members(self, obj):
        members = _get_team_members(obj)
        return [
            {
                'id': member.athlete.id,
                'name': f"{member.athlete.first_name} {member.athlete.last_name}".strip(),
                'first_name': member.athlete.first_name,
                'last_name': member.athlete.last_name,
                'club': {
                    'id': member.athlete.club.id,
                    'name': member.athlete.club.name,
                } if member.athlete.club else None,
            }
            for member in members if member.athlete_id
        ]


# ==================== FULL SERIALIZERS ====================
# Used for detail views
