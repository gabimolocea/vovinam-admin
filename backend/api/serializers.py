from rest_framework import serializers
from .models import *

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
    class Meta:
        model = Competition
        fields = '__all__'
        depth = 1  # This will include the related clubs in the output


class AthleteSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    club = serializers.PrimaryKeyRelatedField(queryset=Club.objects.all(), allow_null=True)  # Accept club ID only
    city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), allow_null=True)  # Accept city ID only
    current_grade = serializers.PrimaryKeyRelatedField(queryset=Grade.objects.all(), allow_null=True)  # Accept grade ID only
    federation_role = serializers.PrimaryKeyRelatedField(queryset=FederationRole.objects.all(), allow_null=True)  # Accept role ID only
    title = serializers.PrimaryKeyRelatedField(queryset=Title.objects.all(), allow_null=True)  # Accept title ID only
    approved_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = Athlete
        fields = '__all__'
        depth = 1  # This will include related objects in the output
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
                    'last_name': member.athlete.last_name
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
    competition_name = serializers.CharField(source='competition.name', read_only=True)
    enrolled_athletes = CategoryAthleteSerializer(many=True, read_only=True)  # Include enrolled athletes
    teams = TeamSerializer(many=True, read_only=True)  # Use the existing TeamSerializer for teams
    first_place_name = serializers.CharField(source='first_place.first_name', read_only=True, allow_null=True)
    second_place_name = serializers.CharField(source='second_place.first_name', read_only=True, allow_null=True)
    third_place_name = serializers.CharField(source='third_place.first_name', read_only=True, allow_null=True)
    first_place_team = TeamSerializer(read_only=True)  # Include detailed team information
    second_place_team = TeamSerializer(read_only=True)  # Include detailed team information
    third_place_team = TeamSerializer(read_only=True)  # Include detailed team information
    group_name = serializers.CharField(source='group.name', read_only=True, allow_null=True)  # Include group name

    class Meta:
        model = Category
        fields = [
            'id', 'name', 'competition', 'competition_name', 'group', 'group_name', 'type', 'gender',
            'enrolled_athletes', 'teams', 'first_place', 'second_place', 'third_place',
            'first_place_name', 'second_place_name', 'third_place_name',
            'first_place_team', 'second_place_team', 'third_place_team',
        ]

class GradeHistorySerializer(serializers.ModelSerializer):
    athlete_name = serializers.CharField(source='athlete.first_name', read_only=True)
    grade_name = serializers.CharField(source='grade.name', read_only=True)

    class Meta:
        model = GradeHistory
        fields = [
            'id', 'athlete', 'athlete_name', 'grade', 'grade_name', 'obtained_date',
            'level', 'exam_date', 'exam_place', 'technical_director', 'president',
        ]

class MedicalVisaSerializer(serializers.ModelSerializer):
    is_valid = serializers.BooleanField(read_only=True)  # Include the computed property

    class Meta:
        model = MedicalVisa
        fields = ['id', 'athlete', 'issued_date', 'health_status', 'is_valid']
        read_only_fields = ['is_valid']

class TrainingSeminarSerializer(serializers.ModelSerializer):
    athletes_names = serializers.StringRelatedField(many=True, source='athletes')  # Display athlete names

    class Meta:
        model = TrainingSeminar
        fields = ['id', 'name', 'start_date', 'end_date', 'place', 'athletes', 'athletes_names']


class GroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = ['id', 'name', 'competition', 'categories']
        read_only_fields = ['id']


class FrontendThemeSerializer(serializers.ModelSerializer):
    tokens = serializers.ReadOnlyField()  # Use the property method from the model
    
    class Meta:
        model = FrontendTheme
        fields = [
            'id', 'name', 'is_active', 'tokens',
            'primary_color', 'primary_light', 'primary_dark', 'secondary_color',
            'background_default', 'background_paper', 'text_primary', 'text_secondary',
            'font_family', 'font_size_base', 'font_weight_normal', 'font_weight_medium', 'font_weight_bold',
            'border_radius', 'spacing_unit', 'button_border_radius', 'card_elevation', 'table_row_hover',
            'custom_tokens', 'created', 'modified'
        ]
        read_only_fields = ['created', 'modified', 'tokens']


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
    """Serializer for athlete category scores with approval workflow"""
    athlete = serializers.PrimaryKeyRelatedField(read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    competition_name = serializers.CharField(source='category.competition.name', read_only=True)
    competition_date = serializers.DateField(source='category.competition.date', read_only=True)
    reviewed_by = serializers.StringRelatedField(read_only=True)
    
    class Meta:
        model = CategoryAthleteScore
        fields = [
            'id', 'athlete', 'category', 'category_name', 'competition_name', 'competition_date',
            'score', 'submitted_by_athlete', 'placement_claimed', 'notes', 'certificate_image', 
            'result_document', 'status', 'submitted_date', 'reviewed_date', 'reviewed_by', 'admin_notes'
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
        
        # Include reviewer details
        if instance.reviewed_by:
            representation['reviewed_by'] = {
                'id': instance.reviewed_by.id,
                'name': instance.reviewed_by.get_full_name() or instance.reviewed_by.username,
                'username': instance.reviewed_by.username
            }
        
        return representation

    def create(self, validated_data):
        """Auto-assign current user's athlete profile and set submission flag"""
        request = self.context.get('request')
        if request and hasattr(request.user, 'athlete'):
            validated_data['athlete'] = request.user.athlete
            validated_data['submitted_by_athlete'] = True
        else:
            raise serializers.ValidationError("User must have an athlete profile to submit results")
        
        # Log the submission
        result = super().create(validated_data)
        CategoryScoreActivity.objects.create(
            score=result,
            action='submitted',
            performed_by=request.user,
            notes=f"Result submitted for {result.category.name} in {result.category.competition.name}"
        )
        
        return result


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