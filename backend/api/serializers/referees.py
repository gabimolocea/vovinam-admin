from rest_framework import serializers
from django.db.models import Q
from ..models import *
from landing.models import Event


from ._common import (
    _person_name,
)
class CategoryRefereeAssignmentSerializer(serializers.ModelSerializer):
    """Serializer for assigning 5 referees to a solo/team category"""

    category_name = serializers.CharField(source='category.name', read_only=True)
    referee_1_name = serializers.SerializerMethodField(read_only=True)
    referee_2_name = serializers.SerializerMethodField(read_only=True)
    referee_3_name = serializers.SerializerMethodField(read_only=True)
    referee_4_name = serializers.SerializerMethodField(read_only=True)
    referee_5_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = CategoryRefereeAssignment
        fields = [
            'id', 'category', 'category_name',
            'referee_1', 'referee_1_name',
            'referee_2', 'referee_2_name',
            'referee_3', 'referee_3_name',
            'referee_4', 'referee_4_name',
            'referee_5', 'referee_5_name',
        ]

    def _referee_name(self, ref):
        return _person_name(ref, last_first=True)

    def get_referee_1_name(self, obj): return self._referee_name(obj.referee_1)
    def get_referee_2_name(self, obj): return self._referee_name(obj.referee_2)
    def get_referee_3_name(self, obj): return self._referee_name(obj.referee_3)
    def get_referee_4_name(self, obj): return self._referee_name(obj.referee_4)
    def get_referee_5_name(self, obj): return self._referee_name(obj.referee_5)


# ── Match Referee Assignment ──────────────────────────

class CompetitionRefereeSerializer(serializers.ModelSerializer):
    """Serializer for competition referee roster"""
    athlete_name = serializers.SerializerMethodField(read_only=True)
    club_name = serializers.SerializerMethodField(read_only=True)
    # `athlete.current_grade` on its own would fall back to Grade.__str__,
    # which is the admin-facing "Name (Rank: X, Type: Y)" debug format, not
    # something to show a competition admin - point straight at the plain name.
    grade = serializers.CharField(source='athlete.current_grade.name', read_only=True, default=None)
    category_display = serializers.SerializerMethodField(read_only=True)
    role_display = serializers.CharField(source='get_role_display', read_only=True, default=None)
    # Not a real field on the model - the referee's county/locality is the
    # same "Localitate" already tracked on their club, so it's read off
    # `athlete.club.city` rather than duplicated as separately-entered data.
    county = serializers.CharField(source='athlete.club.city.name', read_only=True, default=None)

    class Meta:
        model = CompetitionReferee
        fields = [
            'id', 'event', 'athlete', 'athlete_name', 'club_name',
            'grade', 'category_display', 'role', 'role_display',
            'license_number', 'county', 'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_athlete_name(self, obj):
        if obj.athlete:
            return f"{obj.athlete.last_name} {obj.athlete.first_name}"
        return None

    def get_club_name(self, obj):
        if obj.athlete and obj.athlete.club:
            return obj.athlete.club.name
        return None

    def get_category_display(self, obj):
        athlete = obj.athlete
        if not athlete:
            return None
        if athlete.referee_level == 'international':
            return 'Internațional'
        if athlete.referee_category:
            return athlete.get_referee_category_display()
        return None


class RefereePresenceSerializer(serializers.ModelSerializer):
    """Serializer for referee presence heartbeat"""
    class Meta:
        model = RefereePresence
        fields = ['id', 'category', 'match', 'referee', 'last_ping']