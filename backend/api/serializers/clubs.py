from rest_framework import serializers
from django.db.models import Q
from ..models import *
from landing.models import Event


from ._common import (
    AthleteMinimalSerializer,
    CityMinimalSerializer,
    _get_prefetched_relation,
    _safe_file_url,
)
class ClubSerializer(serializers.ModelSerializer):
    city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), allow_null=True, required=False)
    logo = serializers.ImageField(required=False, allow_null=True)
    coach_ids = serializers.PrimaryKeyRelatedField(queryset=Athlete.objects.all(), many=True, required=False, write_only=True, source='coaches')
    coaches = serializers.SerializerMethodField()
    athletes = serializers.SerializerMethodField()

    class Meta:
        model = Club
        fields = ['id', 'name', 'address', 'mobile_number', 'website', 'coaches', 'coach_ids', 'city', 'logo', 'athletes', 'display_order']

    def get_athletes(self, obj):
        """Return limited summary of athletes"""
        try:
            prefetched = _get_prefetched_relation(obj, 'athletes')
            if prefetched is not None:
                athletes = list(prefetched)[:10]
            else:
                athletes = obj.athletes.select_related('club', 'current_grade').all()[:10]  # Limit to 10
            return AthleteMinimalSerializer(athletes, many=True).data
        except Exception:
            return []

    def get_coaches(self, obj):
        """Return coaches using minimal serializer"""
        try:
            prefetched = _get_prefetched_relation(obj, 'coaches')
            if prefetched is not None:
                coaches = list(prefetched)
            else:
                coaches = obj.coaches.select_related('club', 'current_grade').all()
            return AthleteMinimalSerializer(coaches, many=True).data
        except Exception:
            return []

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        representation['city'] = CityMinimalSerializer(instance.city).data if instance.city else None
        representation['logo'] = _safe_file_url(getattr(instance, 'logo', None))
        return representation


class TrainingSeminarSerializer(serializers.ModelSerializer):
    is_submitted = serializers.SerializerMethodField()
    submission_status = serializers.SerializerMethodField()
    submission_id = serializers.SerializerMethodField()
    submission_date = serializers.SerializerMethodField()

    class Meta:
        model = TrainingSeminar
        fields = [
            'id', 'name', 'start_date', 'end_date', 'place',
            'is_submitted', 'submission_status', 'submission_id', 'submission_date',
        ]

    def _get_submission(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        athlete = getattr(user, 'athlete', None) if user and getattr(user, 'is_authenticated', False) else None
        if not athlete:
            return None
        return TrainingSeminarParticipation.objects.filter(
            athlete=athlete,
        ).filter(
            Q(event=obj) | Q(seminar=obj)
        ).first()

    def get_is_submitted(self, obj):
        return self._get_submission(obj) is not None

    def get_submission_status(self, obj):
        submission = self._get_submission(obj)
        return submission.status if submission else None

    def get_submission_id(self, obj):
        submission = self._get_submission(obj)
        return submission.id if submission else None

    def get_submission_date(self, obj):
        submission = self._get_submission(obj)
        return submission.submitted_date if submission else None
