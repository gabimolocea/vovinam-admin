from rest_framework import serializers
from django.db.models import Q
from ..models import *
from landing.models import Event


from ._common import (
    _person_name,
)
class MatchSerializer(serializers.ModelSerializer):
    # Include related fields for better readability
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_group_name = serializers.CharField(source='category.group.name', read_only=True, allow_null=True)
    category_gender = serializers.CharField(source='category.gender', read_only=True, allow_null=True)
    red_corner_full_name = serializers.SerializerMethodField()  # Full name for red corner
    blue_corner_full_name = serializers.SerializerMethodField()  # Full name for blue corner
    red_corner_club_name = serializers.CharField(source='red_corner.club.name', read_only=True, allow_null=True)  # Include red corner club name
    blue_corner_club_name = serializers.CharField(source='blue_corner.club.name', read_only=True, allow_null=True)  # Include blue corner club name
    central_referee_name = serializers.SerializerMethodField()
    winner = serializers.SerializerMethodField()  # Winner computed from scoring system
    winner_name = serializers.SerializerMethodField()  # Dynamically determine the winner name
    referees = serializers.StringRelatedField(many=True)  # Display referees as strings
    referee_scores = serializers.SerializerMethodField()  # Detailed referee scores
    central_penalties_red = serializers.SerializerMethodField()
    central_penalties_blue = serializers.SerializerMethodField()
    field_id = serializers.SerializerMethodField()
    field_number = serializers.SerializerMethodField()
    field_status = serializers.SerializerMethodField()

    class Meta:
        model = Match
        fields = [
            'id',
            'match_number',
            'name',
            'status',
            'display_mode',
            'category',
            'category_name',
            'category_group_name',
            'category_gender',
            'match_type',
            'field_id',
            'field_number',
            'field_status',
            'red_corner',
            'red_corner_full_name',  # Added full name for red corner
            'red_corner_club_name',
            'blue_corner',
            'blue_corner_full_name',  # Added full name for blue corner
            'blue_corner_club_name',
            'referees',
            'referee_scores',  # Detailed referee scores
            'central_penalties_red',
            'central_penalties_blue',
            'central_referee',
            'central_referee_name',
            'winner',
            'winner_name',  # Dynamically determine the winner name
            'round_number',
            'bracket_position',
            'next_match',
            'loser_next_match',
        ]
        read_only_fields = ['name', 'category_name', 'red_corner_full_name', 'red_corner_club_name', 'blue_corner_full_name', 'blue_corner_club_name', 'referee_scores', 'central_penalties_red', 'central_penalties_blue', 'winner', 'winner_name']

    def get_red_corner_full_name(self, obj):
        """Get the full name of the red corner athlete."""
        return _person_name(obj.red_corner)

    def get_field_id(self, obj):
        assignment = getattr(obj, 'field_assignment', None)
        if assignment and assignment.field_id:
            return assignment.field_id
        return obj.field_id

    def get_field_number(self, obj):
        assignment = getattr(obj, 'field_assignment', None)
        if assignment and assignment.field_id:
            return assignment.field.field_number
        if obj.field_id:
            return obj.field.field_number
        return None

    def get_field_status(self, obj):
        assignment = getattr(obj, 'field_assignment', None)
        return assignment.status if assignment else None

    def get_blue_corner_full_name(self, obj):
        """Get the full name of the blue corner athlete."""
        return _person_name(obj.blue_corner)

    def get_winner(self, obj):
        """Get winner ID from scoring system property"""
        winner = self._get_cached_winner(obj)
        return winner.id if winner else None

    def get_winner_name(self, obj):
        """Determine the winner name dynamically from scoring system."""
        winner = self._get_cached_winner(obj)
        if winner == obj.red_corner:
            return self.get_red_corner_full_name(obj)
        elif winner == obj.blue_corner:
            return self.get_blue_corner_full_name(obj)
        return None  # No winner

    def _get_cached_winner(self, obj):
        if not hasattr(obj, '_serialized_winner'):
            obj._serialized_winner = obj.winner
        return obj._serialized_winner

    def _get_point_events(self, obj):
        prefetched_events = getattr(obj, '_prefetched_point_events', None)
        return prefetched_events if prefetched_events is not None else obj.point_events.all()

    def get_central_referee_name(self, obj):
        """Return the central referee full name if present."""
        return _person_name(getattr(obj, 'central_referee', None))

    def get_referee_scores(self, obj):
        """Return detailed scores from each referee for both corners, broken down by round, with central penalties subtracted."""
        from collections import defaultdict
        
        # Step 1: Calculate total central penalties for the entire match
        total_red_penalty = 0
        total_blue_penalty = 0
        
        point_events = self._get_point_events(obj)
        for event in point_events:
            # Check if this is a central penalty event
            is_central = False
            if event.metadata and isinstance(event.metadata, dict):
                is_central = event.metadata.get('central', False)
            
            if is_central:
                # Respect the sign: negative points are penalties, positive are additions
                if event.side == 'red':
                    total_red_penalty += event.points
                else:  # blue
                    total_blue_penalty += event.points
        
        # Step 2: Calculate each referee's raw score (excluding central penalties)
        referee_data = defaultdict(lambda: {
            'referee_name': '',
            'rounds': defaultdict(lambda: {'red': 0, 'blue': 0}),
            'raw_total_red': 0,
            'raw_total_blue': 0
        })
        
        # Get the central referee's ID, if one is assigned
        central_referee_id = obj.central_referee.id if obj.central_referee else None

        # Aggregate point events by referee and round (excluding central penalties)
        for event in point_events:
            # Skip central penalty events
            is_central = False
            if event.metadata and isinstance(event.metadata, dict):
                is_central = event.metadata.get('central', False)
            
            if is_central:
                continue
            
            # Skip events from the central referee
            if event.referee.id == central_referee_id:
                continue

            referee_id = event.referee.id
            referee_name = _person_name(event.referee)
            referee_data[referee_id]['referee_name'] = referee_name
            
            # Get round from metadata, default to 1
            round_num = 1
            if event.metadata and isinstance(event.metadata, dict):
                round_num = event.metadata.get('round', 1)
            
            # Add points to the appropriate side and round
            if event.side == 'red':
                referee_data[referee_id]['rounds'][round_num]['red'] += event.points
                referee_data[referee_id]['raw_total_red'] += event.points
            else:  # blue
                referee_data[referee_id]['rounds'][round_num]['blue'] += event.points
                referee_data[referee_id]['raw_total_blue'] += event.points
        
        # Convert to list format for JSON serialization
        scores = []
        for ref_id, data in referee_data.items():
            rounds_list = []
            for round_num in sorted(data['rounds'].keys()):
                rounds_list.append({
                    'round': round_num,
                    'red': data['rounds'][round_num]['red'],
                    'blue': data['rounds'][round_num]['blue']
                })
            
            # Step 3: Calculate final totals by applying central adjustments
            # Negative penalty points are subtracted, positive are added
            final_total_red = data['raw_total_red'] + total_red_penalty
            final_total_blue = data['raw_total_blue'] + total_blue_penalty
            
            scores.append({
                'referee_name': data['referee_name'],
                'rounds': rounds_list,
                'total_red': final_total_red,
                'total_blue': final_total_blue
            })
        
        return scores

    def get_central_penalties_red(self, obj):
        """Return detailed central penalties for the red corner."""
        return [
            {
                'points': event.points,
                'metadata': event.metadata or {}
            }
            for event in self._get_point_events(obj)
            if event.side == 'red'
            and event.event_type in ('penalty', 'deduction')
            and isinstance(event.metadata, dict)
            and event.metadata.get('central') is True
        ]

    def get_central_penalties_blue(self, obj):
        """Return detailed central penalties for the blue corner."""
        return [
            {
                'points': event.points,
                'metadata': event.metadata or {}
            }
            for event in self._get_point_events(obj)
            if event.side == 'blue'
            and event.event_type in ('penalty', 'deduction')
            and isinstance(event.metadata, dict)
            and event.metadata.get('central') is True
        ]

    def validate(self, data):
        """
        Custom validation to ensure red_corner and blue_corner are enrolled in the category.
        """
        category = data.get('category')
        red_corner = data.get('red_corner')
        blue_corner = data.get('blue_corner')

        if category and red_corner and not category.athletes.filter(pk=red_corner.pk).exists():
            raise serializers.ValidationError(f"Red corner athlete '{red_corner}' must be enrolled in the category.")
        if category and blue_corner and not category.athletes.filter(pk=blue_corner.pk).exists():
            raise serializers.ValidationError(f"Blue corner athlete '{blue_corner}' must be enrolled in the category.")

        return data


class RefereePointEventSerializer(serializers.ModelSerializer):
    """Serializer for append-only referee point events (async mode)."""
    referee_name = serializers.SerializerMethodField(read_only=True)
    validation_status_label = serializers.CharField(source='get_validation_status_display', read_only=True)

    class Meta:
        model = None
        fields = [
            'id', 'match', 'referee', 'referee_name', 'timestamp', 'side', 'points', 'event_type',
            'processed', 'external_id', 'metadata', 'created_by', 'validation_status',
            'validation_status_label', 'validated_at', 'recording_session', 'video_offset_ms'
        ]
        read_only_fields = ['timestamp', 'created_by', 'validated_at', 'video_offset_ms']

    def __init__(self, *args, **kwargs):
        # late-bind the model to avoid circular imports at module load time
        try:
            from ..models import RefereePointEvent
            self.Meta.model = RefereePointEvent
        except Exception:
            self.Meta.model = None
        super().__init__(*args, **kwargs)

    def get_referee_name(self, obj):
        return _person_name(obj.referee)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        validation_status = attrs.get('validation_status')
        if validation_status == 'rejected' and not attrs.get('metadata'):
            attrs['metadata'] = {'reason': 'rejected'}
        return attrs
    

class MatchRoundSerializer(serializers.ModelSerializer):
    """Serializer for match rounds in fighting competitions"""
    
    match_number = serializers.CharField(source='match.match_number', read_only=True)
    is_paused = serializers.BooleanField(read_only=True)
    effective_duration = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = MatchRound
        fields = [
            'id', 'match', 'match_number', 'round_number', 'duration_seconds',
            'status', 'started_at', 'ended_at', 'paused_at',
            'accumulated_pause_seconds', 'extra_seconds',
            'is_paused', 'effective_duration', 'created_at'
        ]
        read_only_fields = ['created_at']


class MatchEventSerializer(serializers.ModelSerializer):
    """Serializer for match events (warnings, penalties, pauses)"""
    
    event_type_display = serializers.CharField(source='get_event_type_display', read_only=True)
    created_by_name = serializers.SerializerMethodField(read_only=True)
    
    class Meta:
        model = MatchEvent
        fields = [
            'id', 'match', 'round', 'event_type', 'event_type_display',
            'corner', 'value', 'notes', 'created_by', 'created_by_name',
            'created_at'
        ]
        read_only_fields = ['created_at']
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}"
        return None


class MatchFieldAssignmentSerializer(serializers.ModelSerializer):
    """Serializer for assigning matches to fields"""

    match_name = serializers.CharField(source='match.name', read_only=True)
    match_number = serializers.CharField(source='match.match_number', read_only=True)
    match_type = serializers.CharField(source='match.match_type', read_only=True)
    category_id = serializers.IntegerField(source='match.category_id', read_only=True)
    category_name = serializers.CharField(source='match.category.name', read_only=True)
    red_corner_name = serializers.SerializerMethodField(read_only=True)
    blue_corner_name = serializers.SerializerMethodField(read_only=True)
    field_name = serializers.CharField(source='field.name', read_only=True, allow_null=True)

    class Meta:
        model = MatchFieldAssignment
        fields = [
            'id', 'match', 'match_name', 'match_number', 'match_type',
            'category_id', 'category_name',
            'red_corner_name', 'blue_corner_name',
            'field', 'field_name',
            'status', 'scheduled_start_time', 'actual_start_time', 'actual_end_time',
            'order', 'estimated_duration', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_red_corner_name(self, obj):
        return _person_name(obj.match.red_corner, last_first=True)

    def get_blue_corner_name(self, obj):
        return _person_name(obj.match.blue_corner, last_first=True)


# ── Category Referee Assignment ────────────────────────

class MatchRefereeAssignmentSerializer(serializers.ModelSerializer):
    """Serializer for assigning 5 referees to a fight match"""

    match_name = serializers.CharField(source='match.name', read_only=True)
    referee_1_name = serializers.SerializerMethodField(read_only=True)
    referee_2_name = serializers.SerializerMethodField(read_only=True)
    referee_3_name = serializers.SerializerMethodField(read_only=True)
    referee_4_name = serializers.SerializerMethodField(read_only=True)
    referee_5_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = MatchRefereeAssignment
        fields = [
            'id', 'match', 'match_name',
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

