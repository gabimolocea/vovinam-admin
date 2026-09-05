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
    grade = serializers.CharField(source='athlete.current_grade', read_only=True)

    class Meta:
        model = CompetitionReferee
        fields = [
            'id', 'event', 'athlete', 'athlete_name', 'club_name',
            'grade', 'notes',
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


class RefereePresenceSerializer(serializers.ModelSerializer):
    """Serializer for referee presence heartbeat"""
    class Meta:
        model = RefereePresence
        fields = ['id', 'category', 'referee', 'last_ping']