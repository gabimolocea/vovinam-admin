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

class CompetitionSerializer(serializers.ModelSerializer):
    categories = serializers.SerializerMethodField()
    
    class Meta:
        model = Competition
        fields = '__all__'
        depth = 1  # This will include the related clubs in the output
    
    def get_categories(self, obj):
        return [{'id': cat.id, 'name': cat.name, 'type': cat.type, 'gender': cat.gender} for cat in obj.categories.all()]


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
        fields = ['id', 'name']


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
    class Meta:
        model = Team
        fields = ['id', 'name', 'categories', 'members']
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
    winner_name = serializers.SerializerMethodField()  # Dynamically determine the winner name
    referees = serializers.StringRelatedField(many=True)  # Display referees as strings

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
            'winner',
            'winner_name',  # Dynamically determine the winner name
        ]
        read_only_fields = ['name', 'category_name', 'red_corner_full_name', 'red_corner_club_name', 'blue_corner_full_name', 'blue_corner_club_name']

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

    def get_winner_name(self, obj):
        """Determine the winner name dynamically."""
        if obj.winner == obj.red_corner:
            return self.get_red_corner_full_name(obj)
        elif obj.winner == obj.blue_corner:
            return self.get_blue_corner_full_name(obj)
        return None  # No winner

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
    

class AnnualVisaSerializer(serializers.ModelSerializer):
    is_valid = serializers.ReadOnlyField()   # Include the computed property

    class Meta:
        model = AnnualVisa
        fields = ['id', 'athlete', 'issued_date', 'visa_status', 'is_valid']
        read_only_fields = ['is_valid']

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
    teams = TeamSerializer(many=True, read_only=True)  # Use the existing TeamSerializer for teams
    first_place_name = serializers.CharField(source='first_place.first_name', read_only=True, allow_null=True)
    second_place_name = serializers.CharField(source='second_place.first_name', read_only=True, allow_null=True)
    third_place_name = serializers.CharField(source='third_place.first_name', read_only=True, allow_null=True)
    first_place_team = TeamSerializer(read_only=True)  # Include detailed team information
    second_place_team = TeamSerializer(read_only=True)  # Include detailed team information
    third_place_team = TeamSerializer(read_only=True)  # Include detailed team information
    first_place = AthleteSerializer(read_only=True)  # Include full athlete details for first place
    second_place = AthleteSerializer(read_only=True)  # Include full athlete details for second place
    third_place = AthleteSerializer(read_only=True)  # Include full athlete details for third place
    group_name = serializers.CharField(source='group.name', read_only=True, allow_null=True)  # Include group name

    class Meta:
        model = Category
        fields = [
            'id', 'name', 'competition', 'competition_name', 'event', 'event_name', 'group', 'group_name', 'type', 'gender',
            'enrolled_athletes', 'teams', 'first_place', 'second_place', 'third_place',
            'first_place_name', 'second_place_name', 'third_place_name',
            'first_place_team', 'second_place_team', 'third_place_team',
        ]

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
        model = MedicalVisa
        fields = ['id', 'athlete', 'issued_date', 'health_status', 'is_valid']
        read_only_fields = ['is_valid']

# Basic TrainingSeminar serializer for admin use
class TrainingSeminarSerializer(serializers.ModelSerializer):
    athletes_names = serializers.StringRelatedField(many=True, source='athletes')  # Display athlete names
    is_submitted = serializers.SerializerMethodField(read_only=True)
    submission_status = serializers.SerializerMethodField(read_only=True)
    submission_id = serializers.SerializerMethodField(read_only=True)
    submission_date = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = TrainingSeminar
        fields = [
            'id', 'name', 'start_date', 'end_date', 'place', 'athletes', 'athletes_names', 'is_submitted',
            'submission_status', 'submission_id', 'submission_date'
        ]

    def get_is_submitted(self, obj):
        """Return True if the current request user (when an athlete) has submitted participation for this seminar.

        This helps the frontend disable or mark seminars the athlete already submitted for.
        """
        request = self.context.get('request') if self.context else None
        if not request or not getattr(request.user, 'is_authenticated', False):
            return False

        # Only meaningful for users who have an Athlete profile
        if not hasattr(request.user, 'athlete') or request.user.athlete is None:
            return False

        try:
            from .models import TrainingSeminarParticipation
            return TrainingSeminarParticipation.objects.filter(
                athlete=request.user.athlete,
                seminar=obj
            ).exists()
        except Exception:
            # On any unexpected error (e.g., DB unavailable), return False so UI remains usable
            return False

    def _get_participation_for_user(self, obj):
        """Helper: return the participation instance for request.user.athlete and seminar=obj if any."""
        request = self.context.get('request') if self.context else None
        if not request or not getattr(request.user, 'is_authenticated', False):
            return None
        if not hasattr(request.user, 'athlete') or request.user.athlete is None:
            return None
        try:
            from .models import TrainingSeminarParticipation
            return TrainingSeminarParticipation.objects.filter(athlete=request.user.athlete, seminar=obj).first()
        except Exception:
            return None

    def get_submission_status(self, obj):
        part = self._get_participation_for_user(obj)
        return part.status if part else None

    def get_submission_id(self, obj):
        part = self._get_participation_for_user(obj)
        return part.id if part else None

    def get_submission_date(self, obj):
        part = self._get_participation_for_user(obj)
        if not part or not part.submitted_date:
            return None
        # ISO format is safe for JSON; frontend can format as needed
        return part.submitted_date.isoformat()


# TrainingSeminarParticipation serializer with approval workflow
class TrainingSeminarParticipationSerializer(serializers.ModelSerializer):
    """Serializer for athlete training seminar participation submissions with approval workflow"""
    athlete = serializers.PrimaryKeyRelatedField(read_only=True)
    athlete_name = serializers.CharField(source='athlete.__str__', read_only=True)
    seminar_name = serializers.CharField(source='seminar.name', read_only=True)
    event = serializers.PrimaryKeyRelatedField(read_only=True)
    event_name = serializers.SerializerMethodField(read_only=True)
    seminar_details = serializers.SerializerMethodField()
    reviewed_by_name = serializers.CharField(source='reviewed_by.__str__', read_only=True)
    
    class Meta:
        model = TrainingSeminarParticipation
        fields = [
            'id', 'athlete', 'athlete_name', 'seminar', 'seminar_name', 'event', 'event_name', 'seminar_details',
            'submitted_by_athlete', 'participation_certificate', 'participation_document', 'notes',
            'status', 'submitted_date', 'reviewed_date', 'reviewed_by', 'reviewed_by_name', 'admin_notes'
        ]
        read_only_fields = ['athlete', 'submitted_date', 'reviewed_date', 'reviewed_by', 'reviewed_by_name']
    
    def get_seminar_details(self, obj):
        """Get detailed seminar information"""
        # Prefer migrated Event when available
        if getattr(obj, 'event', None):
            ev = obj.event
            return {
                'id': ev.pk,
                'name': ev.title,
                'start_date': ev.start_date,
                'end_date': ev.end_date,
                'address': getattr(ev, 'address', None),
                'city': ev.city.name if ev.city else None,
                'event_type': getattr(ev, 'event_type', None),
            }
        # Fallback to legacy TrainingSeminar
        return {
            'name': obj.seminar.name,
            'start_date': obj.seminar.start_date,
            'end_date': obj.seminar.end_date,
            'place': obj.seminar.place
        }

    def get_event_name(self, obj):
        if getattr(obj, 'event', None):
            return obj.event.title
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
            'role', 'phone_number', 'date_of_birth', 'city'
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
            'phone_number', 'date_of_birth', 'city', 'profile_completed',
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
        
        # Include city details
        if instance.city:
            representation['city'] = {
                'id': instance.city.id,
                'name': instance.city.name
            }

        return representation


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
    
    class Meta:
        model = CategoryAthleteScore
        fields = [
            'id', 'athlete', 'category', 'category_name', 'group_name', 'competition_name', 'competition_date',
            'score', 'submitted_by_athlete', 'placement_claimed', 'notes', 'certificate_image', 
            'result_document', 'status', 'submitted_date', 'reviewed_date', 'reviewed_by', 'admin_notes',
            'type', 'group', 'team_members', 'team_name'
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