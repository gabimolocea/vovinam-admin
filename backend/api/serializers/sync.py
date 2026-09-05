from rest_framework import serializers
from django.db.models import Q
from ..models import *
from landing.models import Event


class OfflineAthleteSerializer(serializers.ModelSerializer):
    club_id = serializers.IntegerField(source='club.id', read_only=True)
    club_name = serializers.CharField(source='club.name', read_only=True, allow_null=True)
    current_grade_id = serializers.IntegerField(source='current_grade.id', read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Athlete
        fields = [
            'id',
            'first_name',
            'last_name',
            'date_of_birth',
            'club_id',
            'club_name',
            'current_grade_id',
            'is_referee',
            'updated_at',
        ]


class OfflineClubSerializer(serializers.ModelSerializer):
    updated_at = serializers.DateTimeField(source='modified', read_only=True)

    class Meta:
        model = Club
        fields = ['id', 'name', 'city', 'updated_at']


class OfflineCompetitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Event
        fields = ['id', 'title', 'address', 'start_date', 'end_date', 'event_type']


class OfflineCategorySerializer(serializers.ModelSerializer):
    competition_id = serializers.IntegerField(source='event.id', read_only=True)
    group_id = serializers.IntegerField(source='group.id', read_only=True)

    class Meta:
        model = Category
        fields = ['id', 'name', 'competition_id', 'group_id', 'type', 'gender']


class OfflineMatchSerializer(serializers.ModelSerializer):
    category_id = serializers.IntegerField(source='category.id', read_only=True)

    class Meta:
        model = Match
        fields = ['id', 'category_id', 'match_type', 'red_corner', 'blue_corner', 'name', 'display_mode']

