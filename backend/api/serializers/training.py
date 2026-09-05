from rest_framework import serializers
from django.db.models import Q
from ..models import *
from landing.models import Event


class TrainingSeminarParticipationApprovalSerializer(serializers.Serializer):
    """Serializer for admin approval/rejection/revision requests for seminar participation"""
    notes = serializers.CharField(required=False, allow_blank=True, max_length=500)

class TrainingSeminarParticipationSerializer(serializers.ModelSerializer):
    """Serializer for athlete training seminar participation submissions with approval workflow"""
    athlete = serializers.PrimaryKeyRelatedField(read_only=True)
    athlete_name = serializers.CharField(source='athlete.__str__', read_only=True)
    seminar_name = serializers.SerializerMethodField(read_only=True)
    event = serializers.PrimaryKeyRelatedField(queryset=Event.objects.all(), required=False, allow_null=True)
    event_name = serializers.SerializerMethodField(read_only=True)
    seminar_details = serializers.SerializerMethodField()
    reviewed_by_name = serializers.CharField(source='reviewed_by.__str__', read_only=True)
    
    class Meta:
        model = TrainingSeminarParticipation
        fields = [
            'id', 'athlete', 'athlete_name', 'seminar_name', 'event', 'event_name', 'seminar_details',
            'submitted_by_athlete', 'participation_certificate', 'participation_document', 'notes',
            'status', 'submitted_date', 'reviewed_date', 'reviewed_by', 'reviewed_by_name', 'admin_notes'
        ]
        read_only_fields = ['athlete', 'submitted_date', 'reviewed_date', 'reviewed_by', 'reviewed_by_name']
    
    def get_seminar_details(self, obj):
        """Get detailed seminar information"""
        # Prefer migrated Event when available
        ev = getattr(obj, 'event', None)
        if ev:
            return {
                'id': ev.pk,
                'name': ev.title,
                'start_date': ev.start_date,
                'end_date': ev.end_date,
                'address': getattr(ev, 'address', None),
                'city': ev.city.name if ev.city else None,
                'event_type': getattr(ev, 'event_type', None),
            }
        # Fallback to legacy TrainingSeminar when present
        ts = getattr(obj, 'seminar', None)
        if ts:
            return {
                'name': getattr(ts, 'name', None),
                'start_date': getattr(ts, 'start_date', None),
                'end_date': getattr(ts, 'end_date', None),
                'place': getattr(ts, 'place', None),
            }
        return None

    def get_event_name(self, obj):
        if getattr(obj, 'event', None):
            return obj.event.title
        return None

    def get_seminar_name(self, obj):
        # keep helper for backward compatibility: prefer legacy seminar name if present
        ts = getattr(obj, 'seminar', None)
        if ts:
            return getattr(ts, 'name', None)
        return None
    
    def validate(self, attrs):
        """Prevent duplicate submissions for the same athlete+event.

        This returns a 400 with a clear message instead of letting the DB
        raise an IntegrityError (which bubbled up as a 500).
        """
        request = self.context.get('request')
        event = attrs.get('event')
        # Only validate for authenticated users with an athlete profile
        if request and hasattr(request.user, 'athlete') and event:
            athlete = request.user.athlete
            from ..models import TrainingSeminarParticipation
            if TrainingSeminarParticipation.objects.filter(athlete=athlete, event=event).exists():
                raise serializers.ValidationError(
                    {'event': 'You have already submitted participation for this seminar.'}
                )
        return attrs
    
    def create(self, validated_data):
        """Auto-assign current user's athlete profile and set submission flag"""
        request = self.context.get('request')
        if request and request.user and getattr(request.user, 'is_admin', False):
            team_members = validated_data.pop('team_members', [])
            result = super().create(validated_data)
            if team_members:
                result.team_members.set(team_members)
            return result

        if request and hasattr(request.user, 'athlete'):
            validated_data['athlete'] = request.user.athlete
            validated_data['submitted_by_athlete'] = True
            
            # Create the participation record
            participation = super().create(validated_data)
            
            # Note: Activity logging would go here if TrainingSeminarActivity model exists
            
            # Create notification for seminar participation submission
            from ..notification_utils import create_seminar_submitted_notification
            create_seminar_submitted_notification(participation)
            
            return participation
        else:
            raise serializers.ValidationError("User must have an athlete profile to submit seminar participation")




