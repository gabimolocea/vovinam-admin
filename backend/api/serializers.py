from rest_framework import serializers
from django.db.models import Q
from .models import *
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
        return f"{obj.first_name} {obj.last_name}"


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
        return f"{obj.first_name} {obj.last_name}"

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

class AthleteDetailSerializer(serializers.ModelSerializer):
    """Full athlete data with all relationships"""
    user = UserMinimalSerializer(read_only=True)
    club = ClubMinimalSerializer(read_only=True)
    city = CityMinimalSerializer(read_only=True)
    current_grade = GradeMinimalSerializer(read_only=True)
    full_name = serializers.SerializerMethodField()
    
    class Meta:
        model = Athlete
        fields = [
            'id', 'user', 'first_name', 'last_name', 'full_name',
            'license_series', 'cnp', 'date_of_birth', 'address', 'mobile_number',
            'emergency_contact_name', 'emergency_contact_phone',
            'previous_experience',
            'club', 'city', 'current_grade',
            'federation_role', 'title', 'is_coach', 'is_referee',
            'status', 'registered_date', 'expiration_date',
            'approved_date', 'profile_image', 'medical_certificate',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}"


class CitySerializer(serializers.ModelSerializer):
    class Meta:
        model = City
        fields = ['id', 'name']

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
            athletes = obj.athletes.select_related('club', 'current_grade').all()[:10]  # Limit to 10
            return AthleteMinimalSerializer(athletes, many=True).data
        except Exception:
            return []

    def get_coaches(self, obj):
        """Return coaches using minimal serializer"""
        try:
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

class AthleteSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), allow_null=True)  # Accept city ID only
    current_grade = serializers.PrimaryKeyRelatedField(queryset=Grade.objects.all(), allow_null=True, required=False)  # Accept grade ID only
    federation_role = serializers.PrimaryKeyRelatedField(queryset=FederationRole.objects.all(), allow_null=True, required=False)  # Accept role ID only
    title = serializers.PrimaryKeyRelatedField(queryset=Title.objects.all(), allow_null=True, required=False)  # Accept title ID only
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
        try:
            representation = super().to_representation(instance)
        except Exception:
            club = _safe_related(instance, 'club')
            city = _safe_related(instance, 'city')
            grade = _safe_related(instance, 'current_grade')
            user = _safe_related(instance, 'user')
            federation_role = _safe_related(instance, 'federation_role')
            title = _safe_related(instance, 'title')
            representation = {
                'id': getattr(instance, 'id', None),
                'user': {
                    'id': getattr(user, 'id', None),
                    'email': getattr(user, 'email', None),
                    'username': getattr(user, 'username', None),
                } if user else None,
                'first_name': getattr(instance, 'first_name', ''),
                'last_name': getattr(instance, 'last_name', ''),
                'gender': getattr(instance, 'gender', None),
                'license_series': getattr(instance, 'license_series', None),
                'cnp': getattr(instance, 'cnp', None),
                'date_of_birth': _safe_scalar(getattr(instance, 'date_of_birth', None)),
                'team_place': getattr(instance, 'team_place', None),
                'address': getattr(instance, 'address', None),
                'mobile_number': getattr(instance, 'mobile_number', None),
                'emergency_contact_name': getattr(instance, 'emergency_contact_name', None),
                'emergency_contact_phone': getattr(instance, 'emergency_contact_phone', None),
                'previous_experience': getattr(instance, 'previous_experience', None),
                'club': {'id': getattr(club, 'id', None), 'name': getattr(club, 'name', None)} if club else None,
                'city': getattr(city, 'id', None),
                'current_grade': getattr(grade, 'id', None),
                'federation_role': getattr(federation_role, 'id', None),
                'title': getattr(title, 'id', None),
                'registered_date': _safe_scalar(getattr(instance, 'registered_date', None)),
                'expiration_date': _safe_scalar(getattr(instance, 'expiration_date', None)),
                'is_coach': getattr(instance, 'is_coach', False),
                'is_referee': getattr(instance, 'is_referee', False),
                'status': getattr(instance, 'status', None),
                'submitted_date': _safe_scalar(getattr(instance, 'submitted_date', None)),
                'reviewed_date': _safe_scalar(getattr(instance, 'reviewed_date', None)),
                'reviewed_by': getattr(getattr(instance, 'reviewed_by', None), 'id', None),
                'admin_notes': getattr(instance, 'admin_notes', None),
                'approved_date': _safe_scalar(getattr(instance, 'approved_date', None)),
                'approved_by': str(getattr(instance, 'approved_by', '')) if getattr(instance, 'approved_by', None) else None,
            }
        
        # Add user details if available
        user = _safe_related(instance, 'user')
        if user:
            representation['user'] = {
                'id': user.id,
                'email': user.email,
                'username': user.username
            }
        
        # Add club details if available
        club = _safe_related(instance, 'club')
        if club:
            representation['club'] = {
                'id': club.id,
                'name': club.name
            }
        else:
            representation['club'] = None
        
        # Add current grade details if available
        current_grade = _safe_related(instance, 'current_grade')
        if current_grade:
            representation['current_grade_details'] = {
                'id': current_grade.id,
                'name': current_grade.name,
                'image': _safe_file_url(getattr(current_grade, 'image', None)),
            }
        else:
            representation['current_grade_details'] = None
        
        # Ensure profile_image returns full URL
        representation['profile_image'] = _safe_file_url(getattr(instance, 'profile_image', None))
        
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


class TeamSerializer(serializers.ModelSerializer):
    categories = serializers.PrimaryKeyRelatedField(many=True, queryset=Category.objects.all(), allow_null=True, required=False)  # Accept category IDs only
    members = serializers.PrimaryKeyRelatedField(many=True, queryset=TeamMember.objects.all(), allow_null=True, required=False)  # Accept member IDs only
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
        athletes = _get_team_athletes(obj)
        first_athlete = athletes[0] if athletes else None
        if first_athlete and first_athlete.club:
            return first_athlete.club.name
        return "N/A"
    
    def to_representation(self, instance):
        """Customize the output to include full category and member details."""
        representation = super().to_representation(instance)
        representation['categories'] = [
            {
                'id': category.id,
                'name': category.name
            }
            for category in _get_team_categories(instance)
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
            for member in _get_team_members(instance)
        ]
        return representation
class TeamMemberSerializer(serializers.ModelSerializer):
    team = serializers.PrimaryKeyRelatedField(queryset=Team.objects.all())  # Accept team ID only
    athlete = serializers.PrimaryKeyRelatedField(queryset=Athlete.objects.all())  # Accept athlete ID only

    class Meta:
        model = TeamMember

        fields = ['id', 'team', 'athlete']

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
        if obj.red_corner:
            return f"{obj.red_corner.first_name} {obj.red_corner.last_name}"
        return None

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
        if obj.blue_corner:
            return f"{obj.blue_corner.first_name} {obj.blue_corner.last_name}"
        return None

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
            from .models import RefereePointEvent
            self.Meta.model = RefereePointEvent
        except Exception:
            self.Meta.model = None
        super().__init__(*args, **kwargs)

    def get_referee_name(self, obj):
        if obj.referee:
            return f"{obj.referee.first_name} {obj.referee.last_name}".strip()
        return None

    def validate(self, attrs):
        attrs = super().validate(attrs)
        validation_status = attrs.get('validation_status')
        if validation_status == 'rejected' and not attrs.get('metadata'):
            attrs['metadata'] = {'reason': 'rejected'}
        return attrs
    

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
        model = Visa
        fields = ['id', 'athlete', 'visa_type', 'issued_date', 'document', 'image', 'health_status', 'visa_status', 'is_valid', 'status', 'submitted_date']

    def get_is_valid(self, obj):
        try:
            return obj.is_valid() if hasattr(obj, 'is_valid') else False
        except Exception:
            return False

class CategoryAthleteSerializer(serializers.ModelSerializer):
    athlete = serializers.PrimaryKeyRelatedField(queryset=Athlete.objects.all())
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all())
    athlete_details = AthleteSerializer(source='athlete', read_only=True)

    class Meta:
        model = CategoryAthlete
        fields = ('id', 'athlete', 'category', 'weight', 'disqualified', 'athlete_details')
        read_only_fields = ('id', 'athlete_details')


class FightAthleteWeightSerializer(serializers.ModelSerializer):
    athlete_details = AthleteSerializer(source='athlete', read_only=True)
    weight_loss_display = serializers.SerializerMethodField()

    class Meta:
        model = FightAthleteWeight
        fields = (
            'id', 'category', 'athlete',
            'pre_weight_kg', 'current_weight_kg',
            'weight_loss_percentage',
            'is_disqualified', 'disqualification_reason',
            'place', 'recorded_at',
            'athlete_details', 'weight_loss_display',
        )
        read_only_fields = ('id', 'weight_loss_percentage', 'recorded_at', 'athlete_details', 'weight_loss_display')

    def get_weight_loss_display(self, obj):
        return obj.get_weight_loss_display()


class CategoryTeamSerializer(serializers.ModelSerializer):
    team = serializers.PrimaryKeyRelatedField(queryset=Team.objects.all())
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all())
    team_details = TeamMinimalSerializer(source='team', read_only=True)
    category_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = CategoryTeam
        fields = ('id', 'category', 'team', 'team_details', 'category_details', 'place', 'disqualified', 'ref1_score', 'ref2_score', 'ref3_score', 'ref4_score', 'ref5_score')
        read_only_fields = ('id', 'team_details', 'category_details')

    def get_category_details(self, obj):
        """Serialize the related Category object"""
        if obj.category:
            return {
                'id': obj.category.id,
                'name': obj.category.name,
                'type': obj.category.type,
            }
        return None

class CategorySerializer(serializers.ModelSerializer):
    # Prefer event when available; keep event_name for compatibility
    competition_name = serializers.SerializerMethodField()
    event_name = serializers.CharField(source='event.title', read_only=True)
    enrolled_athletes = CategoryAthleteSerializer(many=True, read_only=True)  # Include enrolled athletes
    enrolled_teams = serializers.SerializerMethodField()  # Include enrolled teams
    enrolled_athletes_count = serializers.SerializerMethodField()  # Count of enrolled athletes
    enrolled_teams_count = serializers.SerializerMethodField()  # Count of enrolled teams
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
            'id', 'category_number', 'name', 'competition_name', 'event', 'event_name', 'group', 'group_name', 'type', 'gender',
            'display_order', 'birth_year_start', 'birth_year_end',
            'enrolled_athletes', 'enrolled_athletes_count', 'enrolled_teams', 'enrolled_teams_count', 'teams', 'first_place', 'second_place', 'third_place',
            'first_place_name', 'second_place_name', 'third_place_name',
            'first_place_team', 'second_place_team', 'third_place_team',
        ]
    
    def get_enrolled_teams(self, obj):
        """Return list of enrolled teams with enrollment and member details."""
        enrolled = _get_prefetched_relation(obj, 'enrolled_teams')
        if enrolled is None:
            enrolled = obj.enrolled_teams.select_related('team').prefetch_related('team__members__athlete__club').all()
        payload = []
        for ct in enrolled:
            members = _get_team_athletes(ct.team)
            club_names = []
            for athlete in members:
                club = getattr(athlete, 'club', None)
                club_name = getattr(club, 'name', None)
                if club_name and club_name not in club_names:
                    club_names.append(club_name)

            payload.append({
                'id': ct.id,
                'team': ct.team.id,
                'team_name': ct.team.name,
                'club_name': ' / '.join(club_names),
                'disqualified': ct.disqualified,
                'place': ct.place,
                'members': [
                    {
                        'id': athlete.id,
                        'name': f"{athlete.first_name} {athlete.last_name}".strip(),
                        'first_name': athlete.first_name,
                        'last_name': athlete.last_name,
                        'club': {
                            'id': athlete.club.id,
                            'name': athlete.club.name,
                        } if athlete.club else None,
                    }
                    for athlete in members
                ],
            })
        return payload

    def get_enrolled_athletes_count(self, obj):
        """Return count of enrolled athletes"""
        prefetched = _get_prefetched_relation(obj, 'enrolled_athletes')
        if prefetched is not None:
            return len(prefetched)
        return obj.enrolled_athletes.count()

    def get_enrolled_teams_count(self, obj):
        """Return count of enrolled teams"""
        prefetched = _get_prefetched_relation(obj, 'enrolled_teams')
        if prefetched is not None:
            return len(prefetched)
        return obj.enrolled_teams.count()

    def get_teams(self, obj):
        """Serialize teams with category context for score calculation"""
        teams = _get_prefetched_relation(obj, 'teams')
        if teams is None:
            teams = obj.teams.all()
        return TeamSerializer(teams, many=True, context={'category_id': obj.id}).data
    
    def get_first_place_team(self, obj):
        """Serialize first place team with category context"""
        team = getattr(obj, 'first_place_team', None)
        if team:
            return TeamSerializer(team, context={'category_id': obj.id}).data
        return None
    
    def get_second_place_team(self, obj):
        """Serialize second place team with category context"""
        team = getattr(obj, 'second_place_team', None)
        if team:
            return TeamSerializer(team, context={'category_id': obj.id}).data
        return None
    
    def get_third_place_team(self, obj):
        """Serialize third place team with category context"""
        team = getattr(obj, 'third_place_team', None)
        if team:
            return TeamSerializer(team, context={'category_id': obj.id}).data
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
        extra_kwargs = {
            'obtained_date': {'required': False},
        }

    # get_technical_director removed


# Enhanced GradeHistory serializer with approval workflow
class GradeHistorySubmissionSerializer(serializers.ModelSerializer):
    """Serializer for athlete grade history submissions with approval workflow"""
    athlete = serializers.PrimaryKeyRelatedField(queryset=Athlete.objects.all(), required=False)
    athlete_name = serializers.CharField(source='athlete.__str__', read_only=True)
    grade_name = serializers.CharField(source='grade.name', read_only=True)
    reviewed_by_name = serializers.SerializerMethodField()
    
    # legacy technical_director removed; frontend should post examiner_1/examiner_2

    examiner_1 = serializers.PrimaryKeyRelatedField(queryset=Athlete.objects.filter(is_coach=True), allow_null=True, required=False)
    examiner_1_name = serializers.SerializerMethodField()
    examiner_2 = serializers.PrimaryKeyRelatedField(queryset=Athlete.objects.filter(is_coach=True), allow_null=True, required=False)
    examiner_2_name = serializers.SerializerMethodField()

    event = serializers.PrimaryKeyRelatedField(queryset=Event.objects.all(), allow_null=True, required=False)
    event_name = serializers.SerializerMethodField()

    class Meta:
        model = GradeHistory
        fields = [
            'id', 'athlete', 'athlete_name', 'grade', 'grade_name', 'obtained_date',
            'level', 'event', 'event_name', 'examiner_1', 'examiner_1_name', 'examiner_2', 'examiner_2_name', 'submitted_by_athlete', 'certificate_image', 'result_document', 'notes',
            'status', 'submitted_date', 'reviewed_date', 'reviewed_by', 'reviewed_by_name', 'admin_notes'
        ]
        read_only_fields = ['submitted_date', 'reviewed_date', 'reviewed_by', 'reviewed_by_name']

    def get_reviewed_by_name(self, obj):
        return str(obj.reviewed_by) if obj.reviewed_by else None

    def get_examiner_1_name(self, obj):
        return str(obj.examiner_1) if obj.examiner_1 else None

    def get_examiner_2_name(self, obj):
        return str(obj.examiner_2) if obj.examiner_2 else None

    def get_event_name(self, obj):
        return str(obj.event) if obj.event else None

    def validate(self, attrs):
        request = self.context.get('request')
        actor_athlete = getattr(request.user, 'athlete', None) if request else None
        target_athlete = attrs.get('athlete') or getattr(self.instance, 'athlete', None)
        event = attrs.get('event') or getattr(self.instance, 'event', None)

        if event and getattr(event, 'event_type', None) != 'examination':
            raise serializers.ValidationError({'event': 'Grade history poate fi completat doar pentru evenimente de tip examen.'})

        if request and request.user and getattr(request.user, 'is_admin', False):
            if not target_athlete:
                raise serializers.ValidationError({'athlete': 'Acest câmp este obligatoriu.'})
            return attrs

        if not actor_athlete:
            raise serializers.ValidationError('Utilizatorul trebuie să aibă profil de sportiv sau antrenor.')

        if actor_athlete.is_coach:
            if not target_athlete:
                raise serializers.ValidationError({'athlete': 'Selectează sportivul pentru fișa de examen.'})
            if actor_athlete.club_id != target_athlete.club_id:
                raise serializers.ValidationError({'athlete': 'Poți completa fișa doar pentru sportivi din clubul tău.'})
        else:
            attrs['athlete'] = actor_athlete

        return attrs
    
    def create(self, validated_data):
        """Allow athlete self-submission and coach submission for same-club athletes."""
        request = self.context.get('request')
        if not request:
            raise serializers.ValidationError('Cerere invalidă.')

        actor_athlete = getattr(request.user, 'athlete', None)
        if actor_athlete and not getattr(request.user, 'is_admin', False):
            validated_data['status'] = 'pending'
            validated_data['submitted_by_athlete'] = not actor_athlete.is_coach

        existing = GradeHistory.objects.filter(athlete=validated_data['athlete'], grade=validated_data.get('grade'))
        if existing.exists():
            from rest_framework.exceptions import ValidationError as DRFValidationError
            raise DRFValidationError({'grade': ['An entry for this athlete and grade already exists.']})

        grade_history = super().create(validated_data)

        try:
            from django.apps import apps
            GradeHistoryActivity = apps.get_model('api', 'GradeHistoryActivity')
            if GradeHistoryActivity is not None:
                GradeHistoryActivity.objects.create(
                    grade_history=grade_history,
                    action='submitted',
                    performed_by=request.user,
                    notes=f'Grade submission for {grade_history.grade.name}'
                )
        except Exception:
            pass

        from .notification_utils import create_grade_submitted_notification
        try:
            create_grade_submitted_notification(grade_history)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.exception('Failed to create grade submitted notification: %s', e)

        return grade_history


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
        fields = ['id', 'name', 'event', 'birth_year_start', 'birth_year_end', 'birth_date_start', 'birth_date_end', 'allow_younger', 'allowed_grade_type', 'display_order']
        read_only_fields = ['id']


# FrontendThemeSerializer removed — frontend theme API is no longer provided.


# Authentication Serializers
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password

class UserSerializer(serializers.ModelSerializer):
    athlete = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role', 'is_admin', 'date_joined', 'athlete']
        read_only_fields = ['id', 'is_admin', 'date_joined']

    def get_athlete(self, obj):
        """Return athlete details if user has an associated athlete"""
        if hasattr(obj, 'athlete') and obj.athlete:
            athlete = obj.athlete
            return {
                'id': athlete.id,
                'first_name': athlete.first_name,
                'last_name': athlete.last_name,
                'club': athlete.club_id if hasattr(athlete, 'club_id') else (athlete.club.id if athlete.club else None),
                'is_coach': athlete.is_coach if hasattr(athlete, 'is_coach') else False,
                'status': athlete.status,
            }
        return None


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
            'id', 'user', 'first_name', 'last_name', 'license_series', 'cnp', 'date_of_birth',
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
            athlete = instance.athlete
            representation['athlete'] = {
                'id': athlete.id,
                'first_name': athlete.first_name,
                'last_name': athlete.last_name,
                'status': athlete.status,
                'club': athlete.club_id if hasattr(athlete, 'club_id') else (athlete.club.id if athlete.club else None),
                'is_coach': athlete.is_coach if hasattr(athlete, 'is_coach') else False,
                'is_referee': athlete.is_referee if hasattr(athlete, 'is_referee') else False,
            }
            representation['athlete_id'] = athlete.id
        
        return representation


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
        if obj.referee:
            return f"{obj.referee.first_name} {obj.referee.last_name}"
        return None
    
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
            athlete = obj.athlete_score.athlete
            return f"{athlete.first_name} {athlete.last_name}"
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
        if obj.referee:
            return f"{obj.referee.first_name} {obj.referee.last_name}".strip()
        return None

    def get_athlete_name(self, obj):
        athlete_score = obj.athlete_score
        if athlete_score.type == 'teams' and athlete_score.team_name:
            return athlete_score.team_name
        athlete = athlete_score.athlete
        if athlete:
            return f"{athlete.first_name} {athlete.last_name}".strip()
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
        if obj.referee:
            return f"{obj.referee.first_name} {obj.referee.last_name}"
        return None


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
            from .notification_utils import create_result_submitted_notification
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


# ============================================================================
# PWA COMPETITION MANAGEMENT SERIALIZERS
# ============================================================================

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


class DiplomaTemplateSerializer(serializers.ModelSerializer):
    pdf_url = serializers.SerializerMethodField()
    event_name = serializers.CharField(source='event.title', read_only=True)

    class Meta:
        model = DiplomaTemplate
        fields = [
            'id', 'event', 'event_name', 'title', 'template_kind', 'category_scope', 'pdf_file', 'pdf_url',
            'preview_orientation', 'placements', 'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_pdf_url(self, obj):
        if not obj.pdf_file:
            return None
        request = self.context.get('request')
        url = obj.pdf_file.url
        return request.build_absolute_uri(url) if request else url

    def validate_placements(self, value):
        if value in [None, '']:
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError('placements must be a list.')

        allowed_align = {'left', 'center', 'right'}
        allowed_field_keys = {
            'athlete_name',
            'athlete_with_club',
            'club_name',
            'team_name',
            'team_with_club',
            'group_name',
            'group_with_gender',
            'category_name',
            'gender',
            'event_name',
            'place_label',
        }
        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError('Each placement must be an object.')
            if not item.get('field_key'):
                raise serializers.ValidationError('Each placement must include field_key.')
            if item.get('field_key') not in allowed_field_keys:
                raise serializers.ValidationError('Placement field_key is not supported.')
            if 'x' not in item or 'y' not in item:
                raise serializers.ValidationError('Each placement must include x and y coordinates.')
            try:
                x = float(item.get('x'))
                y = float(item.get('y'))
            except (TypeError, ValueError) as exc:
                raise serializers.ValidationError('Placement coordinates must be numeric.') from exc
            if x < 0 or x > 100 or y < 0 or y > 100:
                raise serializers.ValidationError('Placement coordinates must be between 0 and 100.')
            max_length = item.get('max_length', 0)
            try:
                max_length = int(max_length or 0)
            except (TypeError, ValueError) as exc:
                raise serializers.ValidationError('Placement max_length must be numeric.') from exc
            if max_length < 0 or max_length > 500:
                raise serializers.ValidationError('Placement max_length must be between 0 and 500.')
            align = item.get('align', 'center')
            if align not in allowed_align:
                raise serializers.ValidationError('Placement align must be left, center, or right.')
        return value


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
        return f"{obj.referee.first_name} {obj.referee.last_name}"


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
        return f"{obj.referee.first_name} {obj.referee.last_name}"
    
    def get_athlete_name(self, obj):
        """Get athlete name or team name"""
        if obj.athlete_score.athlete:
            athlete = obj.athlete_score.athlete
            return f"{athlete.first_name} {athlete.last_name}"
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
        rc = obj.match.red_corner
        return f"{rc.last_name} {rc.first_name}" if rc else None

    def get_blue_corner_name(self, obj):
        bc = obj.match.blue_corner
        return f"{bc.last_name} {bc.first_name}" if bc else None


# ── Category Referee Assignment ────────────────────────

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
        return f"{ref.last_name} {ref.first_name}" if ref else None

    def get_referee_1_name(self, obj): return self._referee_name(obj.referee_1)
    def get_referee_2_name(self, obj): return self._referee_name(obj.referee_2)
    def get_referee_3_name(self, obj): return self._referee_name(obj.referee_3)
    def get_referee_4_name(self, obj): return self._referee_name(obj.referee_4)
    def get_referee_5_name(self, obj): return self._referee_name(obj.referee_5)


# ── Match Referee Assignment ──────────────────────────

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
        return f"{ref.last_name} {ref.first_name}" if ref else None

    def get_referee_1_name(self, obj): return self._referee_name(obj.referee_1)
    def get_referee_2_name(self, obj): return self._referee_name(obj.referee_2)
    def get_referee_3_name(self, obj): return self._referee_name(obj.referee_3)
    def get_referee_4_name(self, obj): return self._referee_name(obj.referee_4)
    def get_referee_5_name(self, obj): return self._referee_name(obj.referee_5)


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