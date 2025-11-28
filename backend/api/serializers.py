from rest_framework import serializers
from .models import *
from landing.models import Event

class CitySerializer(serializers.ModelSerializer):
    class Meta:
        model = City
        fields = ['id', 'name']

class ClubSerializer(serializers.ModelSerializer):
    city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all())  # Accept city ID only
    coaches = serializers.PrimaryKeyRelatedField(many=True, required=False, queryset=Athlete.objects.filter(is_coach=True))  # Include coaches

    class Meta:
        model = Club
        fields = ['id', 'name', 'address', 'mobile_number', 'website', 'coaches', 'city', 'logo']

    def to_representation(self, instance):
        """Customize the output to include the full city object and coaches."""
        representation = super().to_representation(instance)
        if instance.city:
            representation['city'] = {
                'id': instance.city.id,
                'name': instance.city.name
            }
        else:
            representation['city'] = None  # Handle cases where city is None

        # Include full coach details
        representation['coaches'] = [
            {
                'id': coach.id,
                'first_name': coach.first_name,
                'last_name': coach.last_name
            }
            for coach in instance.coaches.all()
        ]
        return representation

class AthleteSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), allow_null=True)  # Accept city ID only
    current_grade = serializers.PrimaryKeyRelatedField(queryset=Grade.objects.all(), allow_null=True)  # Accept grade ID only
    federation_role = serializers.PrimaryKeyRelatedField(queryset=FederationRole.objects.all(), allow_null=True)  # Accept role ID only
    title = serializers.PrimaryKeyRelatedField(queryset=Title.objects.all(), allow_null=True)  # Accept title ID only
    approved_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = Athlete
        fields = '__all__'
        extra_kwargs = {
            'first_name': {'required': True},
            'last_name': {'required': True},
            'date_of_birth': {'required': True},
        }
    
    def to_representation(self, instance):
        """Customize output to include additional info"""
        representation = super().to_representation(instance)
        
        # Add user details if available
        if instance.user:
            representation['user'] = {
                'id': instance.user.id,
                'email': instance.user.email,
                'username': instance.user.username
            }
        
        # Add club details if available
        if instance.club:
            representation['club'] = {
                'id': instance.club.id,
                'name': instance.club.name
            }
        else:
            representation['club'] = None
        
        # Add current grade details if available
        if instance.current_grade:
            representation['current_grade_details'] = {
                'id': instance.current_grade.id,
                'name': instance.current_grade.name,
                'image': instance.current_grade.image.url if instance.current_grade.image else None,
            }
        else:
            representation['current_grade_details'] = None
        
        # Ensure profile_image returns full URL
        if instance.profile_image:
            representation['profile_image'] = instance.profile_image.url
        else:
            representation['profile_image'] = None
        
        # Add computed properties
        representation['can_edit_profile'] = instance.can_edit_profile
        representation['can_add_results'] = instance.can_add_results
        
        return representation

class TitleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Title
        fields = ['id', 'name']

class FederationRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = FederationRole
        fields = ['id', 'name']

class GradeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Grade
        fields = ['id', 'name', 'rank_order', 'grade_type', 'image']


class CoachSimpleSerializer(serializers.ModelSerializer):
    """Minimal serializer used by the frontend when populating coach/examiner selects."""
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = Athlete
        fields = ['id', 'first_name', 'last_name', 'full_name']

    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}"

class GradeHistorySerializer(serializers.ModelSerializer):
    athlete = serializers.PrimaryKeyRelatedField(queryset=Athlete.objects.all())  # Accept athlete ID only
    grade = serializers.PrimaryKeyRelatedField(queryset=Grade.objects.all())  # Accept grade ID only
    obtained_date = serializers.DateField()
    class Meta:
        model = GradeHistory
        fields = ['id', 'athlete', 'grade', 'obtained_date']

    
class TeamSerializer(serializers.ModelSerializer):
    categories = serializers.PrimaryKeyRelatedField(many=True, queryset=Category.objects.all(), allow_null=True)  # Accept category IDs only
    members = serializers.PrimaryKeyRelatedField(many=True, queryset=TeamMember.objects.all(), allow_null=True)  # Accept member IDs only
    name = serializers.ReadOnlyField()  # Team name is now auto-generated from members
    score = serializers.SerializerMethodField()
    club_name = serializers.SerializerMethodField()
    
    class Meta:
        model = Team
        fields = ['id', 'name', 'categories', 'members', 'score', 'club_name']
    
    def get_score(self, obj):
        """Calculate total score from all referee scores for this team in the current category"""
        # Get category from context if available
        category_id = self.context.get('category_id')
        if category_id:
            from .models import CategoryTeamScore
            scores = CategoryTeamScore.objects.filter(team=obj, category_id=category_id)
            if scores.exists():
                return sum(score.score for score in scores) / scores.count()  # Average score
        return None
    
    def get_club_name(self, obj):
        """Get club name from first team member"""
        first_member = obj.members.first()
        if first_member and first_member.athlete and first_member.athlete.club:
            return first_member.athlete.club.name
        return "N/A"
    
    def to_representation(self, instance):
        """Customize the output to include full category and member details."""
        representation = super().to_representation(instance)
        representation['categories'] = [
            {
                'id': category.id,
                'name': category.name
            }
            for category in instance.categories.all()
        ]
        representation['members'] = [
            {
                'id': member.id,
                'athlete': {
                    'id': member.athlete.id,
                    'first_name': member.athlete.first_name,
                    'last_name': member.athlete.last_name,
                    'club': {
                        'id': member.athlete.club.id,
                        'name': member.athlete.club.name
                    } if member.athlete.club else None
                }
            }
            for member in instance.members.all()
        ]
        return representation
class TeamMemberSerializer(serializers.ModelSerializer):
    team = serializers.PrimaryKeyRelatedField(queryset=Team.objects.all())  # Accept team ID only
    athlete = serializers.PrimaryKeyRelatedField(queryset=Athlete.objects.all())  # Accept athlete ID only
    class Meta:
        model = TeamMember
        fields = ['id', 'team', 'athlete', 'place']
    def to_representation(self, instance):
        """Customize the output to include full athlete details."""
        representation = super().to_representation(instance)
        representation['athlete'] = {
            'id': instance.athlete.id,
            'first_name': instance.athlete.first_name,
            'last_name': instance.athlete.last_name
        }
        return representation


class MatchSerializer(serializers.ModelSerializer):
    # Include related fields for better readability
    category_name = serializers.CharField(source='category.name', read_only=True)
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

    class Meta:
        model = Match
        fields = [
            'id',
            'name',
            'category',
            'category_name',
            'match_type',
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
        ]
        read_only_fields = ['name', 'category_name', 'red_corner_full_name', 'red_corner_club_name', 'blue_corner_full_name', 'blue_corner_club_name', 'referee_scores', 'central_penalties_red', 'central_penalties_blue', 'winner', 'winner_name']

    def get_red_corner_full_name(self, obj):
        """Get the full name of the red corner athlete."""
        if obj.red_corner:
            return f"{obj.red_corner.first_name} {obj.red_corner.last_name}"
        return "Unknown Athlete"

    def get_blue_corner_full_name(self, obj):
        """Get the full name of the blue corner athlete."""
        if obj.blue_corner:
            return f"{obj.blue_corner.first_name} {obj.blue_corner.last_name}"
        return "Unknown Athlete"

    def get_winner(self, obj):
        """Get winner ID from scoring system property"""
        winner = obj.winner
        return winner.id if winner else None

    def get_winner_name(self, obj):
        """Determine the winner name dynamically from scoring system."""
        winner = obj.winner
        if winner == obj.red_corner:
            return self.get_red_corner_full_name(obj)
        elif winner == obj.blue_corner:
            return self.get_blue_corner_full_name(obj)
        return None  # No winner

    def get_central_referee_name(self, obj):
        """Return the central referee full name if present."""
        if getattr(obj, 'central_referee', None):
            cr = obj.central_referee
            return f"{cr.first_name} {cr.last_name}"
        return None

    def get_referee_scores(self, obj):
        """Return detailed scores from each referee for both corners, broken down by round, with central penalties subtracted."""
        from collections import defaultdict
        
        # Step 1: Calculate total central penalties for the entire match
        total_red_penalty = 0
        total_blue_penalty = 0
        
        for event in obj.point_events.all():
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
        for event in obj.point_events.all():
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
            referee_name = f"{event.referee.first_name} {event.referee.last_name}"
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
        penalties = []
        # Filter for central penalties for the red corner
        penalty_events = obj.point_events.filter(
            side='red',
            event_type__in=['penalty', 'deduction'],
            metadata__central=True
        )
        for event in penalty_events:
            penalties.append({
                'points': event.points,
                'metadata': event.metadata or {}
            })
        return penalties

    def get_central_penalties_blue(self, obj):
        """Return detailed central penalties for the blue corner."""
        penalties = []
        # Filter for central penalties for the blue corner
        penalty_events = obj.point_events.filter(
            side='blue',
            event_type__in=['penalty', 'deduction'],
            metadata__central=True
        )
        for event in penalty_events:
            penalties.append({
                'points': event.points,
                'metadata': event.metadata or {}
            })
        return penalties

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
    class Meta:
        model = None
        fields = ['id', 'match', 'referee', 'timestamp', 'side', 'points', 'event_type', 'processed', 'external_id', 'metadata', 'created_by']

    def __init__(self, *args, **kwargs):
        # late-bind the model to avoid circular imports at module load time
        try:
            from .models import RefereePointEvent
            self.Meta.model = RefereePointEvent
        except Exception:
            self.Meta.model = None
        super().__init__(*args, **kwargs)
    

class AnnualVisaSerializer(serializers.ModelSerializer):
    is_valid = serializers.ReadOnlyField()   # Include the computed property

    class Meta:
        # Use unified Visa model for admin/API compatibility
        model = Visa
        fields = ['id', 'athlete', 'issued_date', 'visa_status', 'is_valid']
        read_only_fields = ['is_valid']


class VisaSerializer(serializers.ModelSerializer):
    is_valid = serializers.SerializerMethodField()

    class Meta:
        model = None  # set dynamically where used
        fields = ['id', 'athlete', 'visa_type', 'issued_date', 'document', 'image', 'health_status', 'visa_status', 'is_valid', 'status', 'submitted_date']

    def get_is_valid(self, obj):
        try:
            return obj.is_valid() if hasattr(obj, 'is_valid') else False
        except Exception:
            return False

class CategoryAthleteSerializer(serializers.ModelSerializer):
    athlete = AthleteSerializer(read_only=True)  # Serialize the related Athlete object

    class Meta:
        model = CategoryAthlete
        fields = ('athlete', 'weight')  # Include the athlete and additional fields like weight

class CategorySerializer(serializers.ModelSerializer):
    # Prefer event when available; keep event_name for compatibility
    competition_name = serializers.SerializerMethodField()
    event_name = serializers.CharField(source='event.title', read_only=True)
    enrolled_athletes = CategoryAthleteSerializer(many=True, read_only=True)  # Include enrolled athletes
    enrolled_teams = serializers.SerializerMethodField()  # Include enrolled teams
    teams = serializers.SerializerMethodField()  # Use method to pass context
    first_place_name = serializers.CharField(source='first_place.first_name', read_only=True, allow_null=True)
    second_place_name = serializers.CharField(source='second_place.first_name', read_only=True, allow_null=True)
    third_place_name = serializers.CharField(source='third_place.first_name', read_only=True, allow_null=True)
    first_place_team = serializers.SerializerMethodField()  # Use method to pass context
    second_place_team = serializers.SerializerMethodField()  # Use method to pass context
    third_place_team = serializers.SerializerMethodField()  # Use method to pass context
    first_place = AthleteSerializer(read_only=True)  # Include full athlete details for first place
    second_place = AthleteSerializer(read_only=True)  # Include full athlete details for second place
    third_place = AthleteSerializer(read_only=True)  # Include full athlete details for third place
    group_name = serializers.CharField(source='group.name', read_only=True, allow_null=True)  # Include group name

    class Meta:
        model = Category
        fields = [
            'id', 'name', 'competition', 'competition_name', 'event', 'event_name', 'group', 'group_name', 'type', 'gender',
            'enrolled_athletes', 'enrolled_teams', 'teams', 'first_place', 'second_place', 'third_place',
            'first_place_name', 'second_place_name', 'third_place_name',
            'first_place_team', 'second_place_team', 'third_place_team',
        ]
    
    def get_enrolled_teams(self, obj):
        """Return list of enrolled teams with their names"""
        enrolled = obj.enrolled_teams.select_related('team').all()
        return [{'id': ct.team.id, 'team_name': ct.team.name} for ct in enrolled]

    def get_teams(self, obj):
        """Serialize teams with category context for score calculation"""
        teams = obj.teams.all()
        return TeamSerializer(teams, many=True, context={'category_id': obj.id}).data
    
    def get_first_place_team(self, obj):
        """Serialize first place team with category context"""
        if obj.first_place_team:
            return TeamSerializer(obj.first_place_team, context={'category_id': obj.id}).data
        return None
    
    def get_second_place_team(self, obj):
        """Serialize second place team with category context"""
        if obj.second_place_team:
            return TeamSerializer(obj.second_place_team, context={'category_id': obj.id}).data
        return None
    
    def get_third_place_team(self, obj):
        """Serialize third place team with category context"""
        if obj.third_place_team:
            return TeamSerializer(obj.third_place_team, context={'category_id': obj.id}).data
        return None

    def get_competition_name(self, obj):
        """Return the associated Event title or legacy Competition name for compatibility."""
        ent = getattr(obj, 'event_or_competition', None) or getattr(obj, 'competition', None)
        if not ent:
            return None
        return getattr(ent, 'title', None) or getattr(ent, 'name', None)

# Basic GradeHistory serializer for admin use
class GradeHistorySerializer(serializers.ModelSerializer):
    athlete_name = serializers.CharField(source='athlete.first_name', read_only=True)
    grade_name = serializers.CharField(source='grade.name', read_only=True)
    # technical_director removed; use examiner_1/examiner_2 instead
    examiner_1 = serializers.PrimaryKeyRelatedField(queryset=Athlete.objects.filter(is_coach=True), allow_null=True, required=False)
    examiner_1_name = serializers.CharField(source='examiner_1.__str__', read_only=True)
    examiner_2 = serializers.PrimaryKeyRelatedField(queryset=Athlete.objects.filter(is_coach=True), allow_null=True, required=False)
    examiner_2_name = serializers.CharField(source='examiner_2.__str__', read_only=True)

    # Event linked to the grade exam (optional)
    event = serializers.PrimaryKeyRelatedField(queryset=Event.objects.all(), allow_null=True, required=False)
    event_name = serializers.CharField(source='event.__str__', read_only=True)

    class Meta:
        model = GradeHistory
        fields = [
            'id', 'athlete', 'athlete_name', 'grade', 'grade_name', 'obtained_date',
            'level', 'event', 'event_name', 'examiner_1', 'examiner_1_name', 'examiner_2', 'examiner_2_name',
        ]

    # get_technical_director removed


# Enhanced GradeHistory serializer with approval workflow
class GradeHistorySubmissionSerializer(serializers.ModelSerializer):
    """Serializer for athlete grade history submissions with approval workflow"""
    athlete = serializers.PrimaryKeyRelatedField(read_only=True)
    athlete_name = serializers.CharField(source='athlete.__str__', read_only=True)
    grade_name = serializers.CharField(source='grade.name', read_only=True)
    reviewed_by_name = serializers.CharField(source='reviewed_by.__str__', read_only=True)
    
    # legacy technical_director removed; frontend should post examiner_1/examiner_2

    examiner_1 = serializers.PrimaryKeyRelatedField(queryset=Athlete.objects.filter(is_coach=True), allow_null=True, required=False)
    examiner_1_name = serializers.CharField(source='examiner_1.__str__', read_only=True)
    examiner_2 = serializers.PrimaryKeyRelatedField(queryset=Athlete.objects.filter(is_coach=True), allow_null=True, required=False)
    examiner_2_name = serializers.CharField(source='examiner_2.__str__', read_only=True)

    event = serializers.PrimaryKeyRelatedField(queryset=Event.objects.all(), allow_null=True, required=False)
    event_name = serializers.CharField(source='event.__str__', read_only=True)

    class Meta:
        model = GradeHistory
        fields = [
            'id', 'athlete', 'athlete_name', 'grade', 'grade_name', 'obtained_date',
            'level', 'event', 'event_name', 'examiner_1', 'examiner_1_name', 'examiner_2', 'examiner_2_name', 'submitted_by_athlete', 'certificate_image', 'result_document', 'notes',
            'status', 'submitted_date', 'reviewed_date', 'reviewed_by', 'reviewed_by_name', 'admin_notes'
        ]
        read_only_fields = ['athlete', 'submitted_date', 'reviewed_date', 'reviewed_by', 'reviewed_by_name']
    
    def create(self, validated_data):
        """Auto-assign current user's athlete profile and set submission flag"""
        request = self.context.get('request')
        if request and hasattr(request.user, 'athlete'):
            validated_data['athlete'] = request.user.athlete
            validated_data['submitted_by_athlete'] = True
            # Prevent duplicate submissions at API level with a friendly error
            from .models import GradeHistory
            existing = GradeHistory.objects.filter(athlete=validated_data['athlete'], grade=validated_data.get('grade'))
            if existing.exists():
                # Prefer returning a field-specific error for the grade
                from rest_framework.exceptions import ValidationError as DRFValidationError
                raise DRFValidationError({'grade': ['An entry for this athlete and grade already exists.']})

            # Create the grade history
            grade_history = super().create(validated_data)
            
            # Log the submission
            from .models import GradeHistoryActivity
            try:
                GradeHistoryActivity.objects.create(
                    grade_history=grade_history,
                    action='submitted',
                    performed_by=request.user,
                    notes=f'Grade submission for {grade_history.grade.name}'
                )
            except:
                # GradeHistoryActivity model might not exist yet
                pass
            
            # Create notification for grade submission
            from .notification_utils import create_grade_submitted_notification
            try:
                create_grade_submitted_notification(grade_history)
            except Exception as e:
                # Don't allow notification failures to break the submission flow
                # Log to console in DEBUG or ignore silently in production
                import logging
                logger = logging.getLogger(__name__)
                logger.exception('Failed to create grade submitted notification: %s', e)
            
            return grade_history
        else:
            raise serializers.ValidationError("User must have an athlete profile to submit grade history")


class GradeHistoryApprovalSerializer(serializers.Serializer):
    """Serializer for admin approval/rejection actions on grade history"""
    notes = serializers.CharField(required=False, allow_blank=True, max_length=500)


class TrainingSeminarParticipationApprovalSerializer(serializers.Serializer):
    """Serializer for admin approval/rejection/revision requests for seminar participation"""
    notes = serializers.CharField(required=False, allow_blank=True, max_length=500)

class MedicalVisaSerializer(serializers.ModelSerializer):
    is_valid = serializers.BooleanField(read_only=True)  # Include the computed property

    class Meta:
        # Use unified Visa model for admin/API compatibility
        model = Visa
        fields = ['id', 'athlete', 'issued_date', 'health_status', 'is_valid']
        read_only_fields = ['is_valid']


# TrainingSeminarParticipation serializer with approval workflow
class TrainingSeminarParticipationSerializer(serializers.ModelSerializer):
    """Serializer for athlete training seminar participation submissions with approval workflow"""
    athlete = serializers.PrimaryKeyRelatedField(read_only=True)
    athlete_name = serializers.CharField(source='athlete.__str__', read_only=True)
    seminar_name = serializers.SerializerMethodField(read_only=True)
    event = serializers.PrimaryKeyRelatedField(read_only=True)
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
        """Prevent duplicate submissions for the same athlete+seminar.

        This returns a 400 with a clear message instead of letting the DB
        raise an IntegrityError (which bubbled up as a 500).
        """
        request = self.context.get('request')
        seminar = attrs.get('seminar')
        # Only validate for authenticated users with an athlete profile
        if request and hasattr(request.user, 'athlete') and seminar:
            athlete = request.user.athlete
            from .models import TrainingSeminarParticipation
            if TrainingSeminarParticipation.objects.filter(athlete=athlete, seminar=seminar).exists():
                raise serializers.ValidationError(
                    {'seminar': 'You have already submitted participation for this seminar.'}
                )
        return attrs
    
    def create(self, validated_data):
        """Auto-assign current user's athlete profile and set submission flag"""
        request = self.context.get('request')
        if request and hasattr(request.user, 'athlete'):
            validated_data['athlete'] = request.user.athlete
            validated_data['submitted_by_athlete'] = True
            
            # Create the participation record
            participation = super().create(validated_data)
            
            # Note: Activity logging would go here if TrainingSeminarActivity model exists
            
            # Create notification for seminar participation submission
            from .notification_utils import create_seminar_submitted_notification
            create_seminar_submitted_notification(participation)
            
            return participation
        else:
            raise serializers.ValidationError("User must have an athlete profile to submit seminar participation")





class GroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = ['id', 'name', 'competition', 'categories']
        read_only_fields = ['id']


# FrontendThemeSerializer removed — frontend theme API is no longer provided.


# Authentication Serializers
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role', 'is_admin', 'date_joined']
        read_only_fields = ['id', 'is_admin', 'date_joined']


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'last_name', 'password', 'password_confirm']

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError("Passwords don't match.")
        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm', None)
        user = User.objects.create_user(**validated_data)
        return user


class UserLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        email = attrs.get('email')
        password = attrs.get('password')

        if email and password:
            user = authenticate(username=email, password=password)
            if not user:
                raise serializers.ValidationError('Invalid email or password.')
            if not user.is_active:
                raise serializers.ValidationError('User account is disabled.')
            attrs['user'] = user
        else:
            raise serializers.ValidationError('Must include email and password.')

        return attrs


# =====================================
# ATHLETE WORKFLOW SERIALIZERS
# =====================================

class AthleteProfileSerializer(serializers.ModelSerializer):
    """Serializer for athlete profiles with approval workflow"""
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    club = serializers.PrimaryKeyRelatedField(queryset=Club.objects.all(), allow_null=True)
    city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), allow_null=True)
    reviewed_by = serializers.StringRelatedField(read_only=True)
    
    class Meta:
        model = Athlete
        fields = [
            'id', 'user', 'first_name', 'last_name', 'date_of_birth',
            'address', 'mobile_number', 'club', 'city', 'previous_experience',
            'emergency_contact_name', 'emergency_contact_phone', 'status',
            'submitted_date', 'reviewed_date', 'reviewed_by', 'admin_notes',
            'profile_image', 'medical_certificate'
        ]
        read_only_fields = ['submitted_date', 'reviewed_date', 'reviewed_by']
        extra_kwargs = {
            'first_name': {'required': True},
            'last_name': {'required': True},
            'date_of_birth': {'required': True},
        }
    
    def to_representation(self, instance):
        """Customize output to include related object details"""
        representation = super().to_representation(instance)
        
        # Include club details
        if instance.club:
            representation['club'] = {
                'id': instance.club.id,
                'name': instance.club.name
            }
        
        # Include city details
        if instance.city:
            representation['city'] = {
                'id': instance.city.id,
                'name': instance.city.name
            }
        
        # Include user details
        if instance.user:
            representation['user'] = {
                'id': instance.user.id,
                'email': instance.user.email,
                'username': instance.user.username
            }
        
        return representation

    def create(self, validated_data):
        """Auto-assign current user to the profile and set status to pending"""
        validated_data['user'] = self.context['request'].user
        validated_data['status'] = 'pending'
        return super().create(validated_data)


class AthleteProfileApprovalSerializer(serializers.Serializer):
    """Serializer for admin approval/rejection actions"""
    action = serializers.ChoiceField(choices=['approve', 'reject', 'request_revision'])
    notes = serializers.CharField(required=False, allow_blank=True)
    
    def validate(self, attrs):
        if attrs['action'] in ['reject', 'request_revision'] and not attrs.get('notes'):
            raise serializers.ValidationError("Notes are required for rejection or revision requests.")
        return attrs


class SupporterAthleteRelationSerializer(serializers.ModelSerializer):
    """Serializer for supporter-athlete relationships"""
    supporter = serializers.PrimaryKeyRelatedField(read_only=True)
    athlete = serializers.PrimaryKeyRelatedField(queryset=Athlete.objects.all())
    
    class Meta:
        model = SupporterAthleteRelation
        fields = [
            'id', 'supporter', 'athlete', 'relationship',
            'can_edit', 'can_register_competitions', 'created'
        ]
        read_only_fields = ['created']
    
    def to_representation(self, instance):
        """Include detailed supporter and athlete info"""
        representation = super().to_representation(instance)
        
        # Include supporter details
        representation['supporter'] = {
            'id': instance.supporter.id,
            'email': instance.supporter.email,
            'first_name': instance.supporter.first_name,
            'last_name': instance.supporter.last_name
        }
        
        # Include athlete details
        representation['athlete'] = {
            'id': instance.athlete.id,
            'first_name': instance.athlete.first_name,
            'last_name': instance.athlete.last_name
        }
        
        return representation
    
    def create(self, validated_data):
        """Auto-assign current user as supporter"""
        validated_data['supporter'] = self.context['request'].user
        return super().create(validated_data)


class AthleteActivitySerializer(serializers.ModelSerializer):
    """Serializer for athlete activity log"""
    performed_by = serializers.StringRelatedField(read_only=True)
    athlete = serializers.StringRelatedField(read_only=True)
    
    class Meta:
        model = AthleteActivity
        fields = ['id', 'athlete', 'action', 'performed_by', 'notes', 'timestamp']
        read_only_fields = ['timestamp', 'performed_by']
    
    def create(self, validated_data):
        """Auto-assign current user as performer"""
        validated_data['performed_by'] = self.context['request'].user
        return super().create(validated_data)


class UserRegistrationSerializer(serializers.ModelSerializer):
    """Enhanced user registration with role selection"""
    password_confirm = serializers.CharField(write_only=True)
    
    class Meta:
        model = User
        fields = [
            'username', 'email', 'password', 'password_confirm', 'first_name', 'last_name',
            'role', 'phone_number', 'date_of_birth'
        ]
        extra_kwargs = {
            'password': {'write_only': True},
            'role': {'required': True}
        }
    
    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError("Passwords don't match.")
        
        # Validate role
        if attrs.get('role') not in ['athlete', 'supporter']:
            raise serializers.ValidationError("Role must be either 'athlete' or 'supporter'.")
        
        return attrs
    
    def create(self, validated_data):
        validated_data.pop('password_confirm', None)
        user = User.objects.create_user(**validated_data)
        return user


class UserProfileSerializer(serializers.ModelSerializer):
    """Serializer for user profile management"""
    managed_athletes = SupporterAthleteRelationSerializer(many=True, read_only=True)
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 'role',
            'phone_number', 'date_of_birth', 'profile_completed',
            'date_joined', 'is_active', 'managed_athletes'
        ]
        read_only_fields = ['username', 'date_joined', 'is_active']
    
    def to_representation(self, instance):
        """Add computed fields"""
        representation = super().to_representation(instance)
        
        # Add role-based information
        representation['is_athlete'] = instance.is_athlete
        representation['is_supporter'] = instance.is_supporter
        representation['has_pending_athlete_profile'] = instance.has_pending_athlete_profile
        representation['has_approved_athlete_profile'] = instance.has_approved_athlete_profile
        
        # Include athlete profile data if exists
        if hasattr(instance, 'athlete') and instance.athlete:
            representation['athlete'] = {
                'id': instance.athlete.id,
                'first_name': instance.athlete.first_name,
                'last_name': instance.athlete.last_name,
                'status': instance.athlete.status,
            }
        
        return representation


class CategoryRefereeScoreSerializer(serializers.ModelSerializer):
    """Serializer for individual referee scores in solo/team categories"""
    referee_name = serializers.SerializerMethodField(read_only=True)
    athlete_name = serializers.SerializerMethodField(read_only=True)
    
    class Meta:
        model = CategoryRefereeScore
        fields = [
            'id', 'athlete_score', 'referee', 'referee_name', 'athlete_name',
            'score', 'submitted_date', 'notes'
        ]
        read_only_fields = ['submitted_date']
    
    def get_referee_name(self, obj):
        """Return referee's full name"""
        if obj.referee:
            return f"{obj.referee.first_name} {obj.referee.last_name}"
        return None
    
    def get_athlete_name(self, obj):
        """Return athlete's full name"""
        if obj.athlete_score and obj.athlete_score.athlete:
            athlete = obj.athlete_score.athlete
            return f"{athlete.first_name} {athlete.last_name}"
        return None
    
    def validate(self, data):
        """Validate that referee scoring is only for solo/team categories"""
        athlete_score = data.get('athlete_score')
        if athlete_score and athlete_score.type not in ['solo', 'teams']:
            raise serializers.ValidationError({
                'athlete_score': 'Referee scoring is only applicable to solo and team categories.'
            })
        return data


class CategoryAthleteScoreSerializer(serializers.ModelSerializer):
    """Serializer for athlete category scores with approval workflow (supports both individual and team results)"""
    athlete = serializers.PrimaryKeyRelatedField(read_only=True)
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
                }
                for member in instance.team_members.all()
            ]
        
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
        # support both Competition.date and Event.start_date
        date = getattr(ent, 'date', None) or getattr(ent, 'start_date', None)
        return date

    def validate(self, data):
        """Custom validation for CategoryAthleteScore"""
        result_type = data.get('type', 'solo')
        team_members = data.get('team_members', [])
        
        # Validate team_members based on type
        if result_type != 'teams' and team_members:
            raise serializers.ValidationError({
                'team_members': 'Team members can only be specified for team results.'
            })
        
        if result_type == 'teams' and not team_members:
            raise serializers.ValidationError({
                'team_members': 'Team members are required for team results.'
            })
        
        return data

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
            
            # Log the submission
            CategoryScoreActivity.objects.create(
                score=result,
                action='submitted',
                performed_by=request.user,
                notes=f"{'Team' if result.type == 'teams' else 'Individual'} result submitted for {result.category.name} in {result.category.competition.name}"
            )
            
            # Create notification for result submission
            from .notification_utils import create_result_submitted_notification
            create_result_submitted_notification(result)
            
            return result
        else:
            raise serializers.ValidationError("User must have an athlete profile to submit results")


class CategoryScoreActivitySerializer(serializers.ModelSerializer):
    """Serializer for category score activity log"""
    performed_by = serializers.StringRelatedField(read_only=True)
    score = serializers.StringRelatedField(read_only=True)
    
    class Meta:
        model = CategoryScoreActivity
        fields = ['id', 'score', 'action', 'performed_by', 'notes', 'timestamp']
        read_only_fields = ['timestamp', 'performed_by']


class CategoryScoreApprovalSerializer(serializers.Serializer):
    """Serializer for admin approval/rejection actions on category scores"""
    action = serializers.ChoiceField(choices=['approve', 'reject', 'request_revision'])
    notes = serializers.CharField(required=False, allow_blank=True, help_text='Admin notes for the action')


# CategoryTeamAthleteScoreSerializer deprecated - team functionality consolidated into CategoryAthleteScoreSerializer


# Notification System Serializers
class NotificationSerializer(serializers.ModelSerializer):
    """Serializer for user notifications"""
    recipient_name = serializers.CharField(source='recipient.__str__', read_only=True)
    time_since_created = serializers.SerializerMethodField()
    
    class Meta:
        model = Notification
        fields = [
            'id', 'recipient', 'recipient_name', 'notification_type', 'title', 'message',
            'is_read', 'created_at', 'read_at', 'time_since_created', 'related_result',
            'related_competition', 'action_data'
        ]
        read_only_fields = ['recipient', 'created_at', 'read_at', 'time_since_created']
    
    def get_time_since_created(self, obj):
        """Get human-readable time since notification was created"""
        from django.utils import timezone
        from datetime import timedelta
        
        now = timezone.now()
        diff = now - obj.created_at
        
        if diff < timedelta(minutes=1):
            return "Just now"
        elif diff < timedelta(hours=1):
            minutes = int(diff.total_seconds() / 60)
            return f"{minutes} minute{'s' if minutes > 1 else ''} ago"
        elif diff < timedelta(days=1):
            hours = int(diff.total_seconds() / 3600)
            return f"{hours} hour{'s' if hours > 1 else ''} ago"
        elif diff < timedelta(days=7):
            days = diff.days
            return f"{days} day{'s' if days > 1 else ''} ago"
        else:
            return obj.created_at.strftime('%B %d, %Y')


class NotificationSettingsSerializer(serializers.ModelSerializer):
    """Serializer for user notification settings"""
    
    class Meta:
        model = NotificationSettings
        fields = [
            'id', 'user', 'email_on_result_status_change', 'email_on_competition_updates',
            'email_on_system_announcements', 'notify_result_submitted', 'notify_result_approved',
            'notify_result_rejected', 'notify_result_revision_required', 'notify_competition_created',
            'notify_competition_updated', 'notify_system_announcements', 'created_at', 'updated_at'
        ]
        read_only_fields = ['user', 'created_at', 'updated_at']


class NotificationActionSerializer(serializers.Serializer):
    """Serializer for notification actions (mark as read, etc.)"""
    action = serializers.ChoiceField(choices=['mark_read', 'mark_unread', 'mark_all_read'])
    notification_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        help_text="List of notification IDs for batch operations"
    )