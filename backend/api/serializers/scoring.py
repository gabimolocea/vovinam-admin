from rest_framework import serializers
from django.db.models import Q
from ..models import *
from landing.models import Event


from ._common import (
    _person_name,
)
class CategoryRefereeScoreSerializer(serializers.ModelSerializer):
    """Serializer for individual referee scores in solo/team categories"""
    referee_name = serializers.SerializerMethodField(read_only=True)
    athlete_name = serializers.SerializerMethodField(read_only=True)
    athlete = serializers.SerializerMethodField(read_only=True)
    category = serializers.SerializerMethodField(read_only=True)
    
    class Meta:
        model = CategoryRefereeScore
        fields = [
            'id', 'athlete_score', 'referee', 'referee_name', 'athlete', 'athlete_name',
            'category', 'score', 'submitted_date', 'notes'
        ]
        read_only_fields = ['submitted_date']
    
    def get_referee_name(self, obj):
        """Return referee's full name"""
        return _person_name(obj.referee)
    
    def get_athlete(self, obj):
        """Return athlete ID from the linked CategoryAthleteScore"""
        if obj.athlete_score and obj.athlete_score.athlete_id:
            return obj.athlete_score.athlete_id
        return None
    
    def get_category(self, obj):
        """Return category ID from the linked CategoryAthleteScore"""
        if obj.athlete_score and obj.athlete_score.category_id:
            return obj.athlete_score.category_id
        return None
    
    def get_athlete_name(self, obj):
        """Return athlete's full name"""
        if obj.athlete_score and obj.athlete_score.type == 'teams' and obj.athlete_score.team_name:
            return obj.athlete_score.team_name
        if obj.athlete_score and obj.athlete_score.athlete:
            return _person_name(obj.athlete_score.athlete)
        return None
    
    def validate(self, data):
        """Validate that referee scoring is only for solo/team categories"""
        athlete_score = data.get('athlete_score')
        if athlete_score and athlete_score.type not in ['solo', 'team', 'teams']:
            raise serializers.ValidationError({
                'athlete_score': 'Referee scoring is only applicable to solo and team categories.'
            })
        return data


class CategoryRefereeScoreEventSerializer(serializers.ModelSerializer):
    referee_name = serializers.SerializerMethodField(read_only=True)
    athlete_name = serializers.SerializerMethodField(read_only=True)
    category_id = serializers.IntegerField(source='athlete_score.category_id', read_only=True)
    event_id = serializers.IntegerField(source='athlete_score.category.event_id', read_only=True)

    class Meta:
        model = CategoryRefereeScoreEvent
        fields = [
            'id', 'athlete_score', 'category_id', 'event_id', 'referee', 'referee_name', 'athlete_name',
            'action', 'source', 'score_value', 'previous_score', 'notes', 'timestamp', 'created_by',
            'recording_session', 'video_offset_ms', 'metadata'
        ]
        read_only_fields = ['timestamp', 'created_by', 'video_offset_ms']

    def get_referee_name(self, obj):
        return _person_name(obj.referee)

    def get_athlete_name(self, obj):
        athlete_score = obj.athlete_score
        if athlete_score.type == 'teams' and athlete_score.team_name:
            return athlete_score.team_name
        athlete = athlete_score.athlete
        if athlete:
            return _person_name(athlete)
        return None


class FieldRecordingSessionSerializer(serializers.ModelSerializer):
    field_name = serializers.CharField(source='field.name', read_only=True)
    field_number = serializers.IntegerField(source='field.field_number', read_only=True)
    event_title = serializers.CharField(source='event.title', read_only=True)
    computed_duration_seconds = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = FieldRecordingSession
        fields = [
            'id', 'event', 'event_title', 'field', 'field_name', 'field_number', 'title', 'status',
            'started_at', 'ended_at', 'obs_scene_name', 'obs_source_name', 'recording_file_name',
            'recording_file_path', 'recording_url', 'notes', 'metadata', 'created_at', 'updated_at',
            'computed_duration_seconds'
        ]
        read_only_fields = ['created_at', 'updated_at', 'computed_duration_seconds']

    def get_computed_duration_seconds(self, obj):
        if obj.started_at and obj.ended_at:
            return max(int((obj.ended_at - obj.started_at).total_seconds()), 0)
        return None


class MatchRefereeScoreSerializer(serializers.ModelSerializer):
    """Serializer for individual referee scores in fighting matches"""
    referee_name = serializers.SerializerMethodField(read_only=True)
    winner_choice = serializers.ReadOnlyField()
    
    class Meta:
        model = MatchRefereeScore
        fields = [
            'id', 'match', 'referee', 'referee_name', 'round',
            'red_corner_score', 'blue_corner_score', 'winner_choice',
            'submitted_date', 'notes'
        ]
        read_only_fields = ['submitted_date']
    
    def get_referee_name(self, obj):
        return _person_name(obj.referee)


class CategoryAthleteScoreSerializer(serializers.ModelSerializer):
    """Serializer for athlete category scores with approval workflow (supports both individual and team results)"""
    athlete = serializers.PrimaryKeyRelatedField(queryset=Athlete.objects.all(), required=False, allow_null=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    group_name = serializers.CharField(source='category.group.name', read_only=True, allow_null=True)
    # Prefer event information when available; fall back to legacy Competition fields
    competition_name = serializers.SerializerMethodField()
    competition_date = serializers.SerializerMethodField()
    reviewed_by = serializers.StringRelatedField(read_only=True)
    team_members = serializers.PrimaryKeyRelatedField(many=True, queryset=Athlete.objects.all(), required=False)
    referee_scores = CategoryRefereeScoreSerializer(many=True, read_only=True)
    calculated_score = serializers.ReadOnlyField()
    referee_score_count = serializers.ReadOnlyField()
    has_all_referee_scores = serializers.ReadOnlyField()
    
    class Meta:
        model = CategoryAthleteScore
        fields = [
            'id', 'athlete', 'category', 'category_name', 'group_name', 'competition_name', 'competition_date',
            'score', 'submitted_by_athlete', 'placement_claimed', 'notes', 'certificate_image', 
            'result_document', 'status', 'submitted_date', 'reviewed_date', 'reviewed_by', 'admin_notes',
            'type', 'group', 'team_members', 'team_name',
            'referee_scores', 'calculated_score', 'referee_score_count', 'has_all_referee_scores'
        ]
        read_only_fields = ['submitted_date', 'reviewed_date', 'reviewed_by']
    
    def to_representation(self, instance):
        """Customize output to include related object details"""
        representation = super().to_representation(instance)
        
        # Include athlete details
        if instance.athlete:
            representation['athlete'] = {
                'id': instance.athlete.id,
                'name': f"{instance.athlete.first_name} {instance.athlete.last_name}",
                'first_name': instance.athlete.first_name,
                'last_name': instance.athlete.last_name
            }
        
        # Include team member details for team results
        if instance.type == 'teams' and instance.team_members.exists():
            representation['team_members'] = [
                {
                    'id': member.id,
                    'name': f"{member.first_name} {member.last_name}",
                    'first_name': member.first_name,
                    'last_name': member.last_name
                    ,
                    'club': {
                        'id': member.club.id,
                        'name': member.club.name,
                    } if member.club else None,
                }
                for member in instance.team_members.all()
            ]
            club_names = []
            for member in instance.team_members.all():
                club = getattr(member, 'club', None)
                club_name = getattr(club, 'name', None)
                if club_name and club_name not in club_names:
                    club_names.append(club_name)
            representation['team_club_name'] = ' / '.join(club_names)
        
        # Include reviewer details
        if instance.reviewed_by:
            representation['reviewed_by'] = {
                'id': instance.reviewed_by.id,
                'name': str(instance.reviewed_by),
                'username': instance.reviewed_by.username
            }

        return representation

    def get_competition_name(self, instance):
        cat = getattr(instance, 'category', None)
        if not cat:
            return None
        ent = getattr(cat, 'event_or_competition', None) or getattr(cat, 'competition', None)
        if not ent:
            return None
        return getattr(ent, 'title', None) or getattr(ent, 'name', None)

    def get_competition_date(self, instance):
        cat = getattr(instance, 'category', None)
        if not cat:
            return None
        ent = getattr(cat, 'event_or_competition', None) or getattr(cat, 'competition', None)
        if not ent:
            return None
        return getattr(ent, 'start_date', None)

    def create(self, validated_data):
        """Auto-assign current user's athlete profile and set submission flag"""
        request = self.context.get('request')
        if request and hasattr(request.user, 'athlete'):
            validated_data['athlete'] = request.user.athlete
            validated_data['submitted_by_athlete'] = True

            # For team results, handle team members separately
            team_members = validated_data.pop('team_members', [])

            # Create the result first
            result = super().create(validated_data)

            # For team results, ensure submitting athlete is included in team members
            if result.type == 'teams':
                if request.user.athlete not in team_members:
                    team_members.append(request.user.athlete)
                result.team_members.set(team_members)

            competition = result.category.event_or_competition
            competition_name = getattr(competition, 'title', None) or getattr(competition, 'name', None) or 'competition'

            # Create notification for result submission
            from ..notification_utils import create_result_submitted_notification
            create_result_submitted_notification(result)

            return result

        raise serializers.ValidationError("User must have an athlete profile to submit results")
class OfflineCategoryAthleteScoreSerializer(serializers.ModelSerializer):
    """Writable serializer for offline result uploads."""
    team_members = serializers.PrimaryKeyRelatedField(many=True, queryset=Athlete.objects.all(), required=False)

    class Meta:
        model = CategoryAthleteScore
        fields = [
            'id', 'athlete', 'category', 'score', 'submitted_by_athlete', 'placement_claimed',
            'notes', 'status', 'type', 'group', 'team_members', 'team_name'
        ]


class CategoryScoreApprovalSerializer(serializers.Serializer):
    """Serializer for admin approval/rejection actions on category scores"""
    action = serializers.ChoiceField(choices=['approve', 'reject', 'request_revision'])
    notes = serializers.CharField(required=False, allow_blank=True, help_text='Admin notes for the action')


# CategoryTeamAthleteScoreSerializer deprecated - team functionality consolidated into CategoryAthleteScoreSerializer


# Notification System Serializers
class CategoryRefereeScorerWithDeductionsSerializer(serializers.ModelSerializer):
    """Updated serializer for category referee scores with deduction support"""
    
    referee_name = serializers.SerializerMethodField(read_only=True)
    athlete_name = serializers.SerializerMethodField(read_only=True)
    category_name = serializers.CharField(source='athlete_score.category.name', read_only=True)
    
    class Meta:
        model = CategoryRefereeScore
        fields = [
            'id', 'athlete_score', 'referee', 'referee_name', 'athlete_name',
            'category_name', 'deductions', 'score', 'submitted_date', 'notes'
        ]
        read_only_fields = ['submitted_date']
    
    def get_referee_name(self, obj):
        """Get full name of referee"""
        return _person_name(obj.referee)
    
    def get_athlete_name(self, obj):
        """Get athlete name or team name"""
        if obj.athlete_score.athlete:
            return _person_name(obj.athlete_score.athlete)
        return obj.athlete_score.team_name or "Unknown"
    
    def create(self, validated_data):
        """Override create to auto-calculate score from deductions"""
        deductions = validated_data.get('deductions', {})
        total_deduction = sum(deductions.values()) if deductions else 0
        validated_data['score'] = 100 - total_deduction
        return super().create(validated_data)
    
    def update(self, instance, validated_data):
        """Override update to auto-calculate score from deductions"""
        if 'deductions' in validated_data:
            deductions = validated_data['deductions']
            total_deduction = sum(deductions.values()) if deductions else 0
            validated_data['score'] = 100 - total_deduction
        return super().update(instance, validated_data)


# ── Match Field Assignment ─────────────────────────────
