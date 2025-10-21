# Add these serializers to your existing serializers.py

from rest_framework import serializers
from .models import AthleteProfile, SupporterAthleteRelation, AthleteProfileActivity

class AthleteProfileSerializer(serializers.ModelSerializer):
    """Serializer for pending athlete profiles"""
    user_email = serializers.EmailField(source='user.email', read_only=True)
    reviewed_by_name = serializers.CharField(source='reviewed_by.get_full_name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    
    class Meta:
        model = AthleteProfile
        fields = [
            'id', 'user', 'user_email',
            'first_name', 'last_name', 'date_of_birth',
            'address', 'mobile_number', 'club', 'city',
            'previous_experience', 'emergency_contact_name', 'emergency_contact_phone',
            'status', 'status_display', 'submitted_date', 'reviewed_date',
            'reviewed_by', 'reviewed_by_name', 'admin_notes',
            'profile_image', 'medical_certificate', 'approved_athlete'
        ]
        read_only_fields = [
            'user', 'status', 'submitted_date', 'reviewed_date', 
            'reviewed_by', 'admin_notes', 'approved_athlete'
        ]

class AthleteProfileCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating athlete profiles during registration"""
    
    class Meta:
        model = AthleteProfile
        fields = [
            'first_name', 'last_name', 'date_of_birth',
            'address', 'mobile_number', 'club', 'city',
            'previous_experience', 'emergency_contact_name', 'emergency_contact_phone',
            'profile_image', 'medical_certificate'
        ]
    
    def create(self, validated_data):
        # User should be set by the view
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)

class AthleteRegistrationSerializer(serializers.Serializer):
    """Combined serializer for user + athlete profile registration"""
    # User fields
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    phone_number = serializers.CharField(max_length=15, required=False)
    date_of_birth = serializers.DateField(required=False)
    city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), required=False)
    
    # Athlete profile fields
    athlete_date_of_birth = serializers.DateField()
    address = serializers.CharField(required=False)
    mobile_number = serializers.CharField(max_length=15, required=False)
    club = serializers.PrimaryKeyRelatedField(queryset=Club.objects.all(), required=False)
    athlete_city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), required=False)
    previous_experience = serializers.CharField(required=False)
    emergency_contact_name = serializers.CharField(max_length=100, required=False)
    emergency_contact_phone = serializers.CharField(max_length=15, required=False)
    profile_image = serializers.ImageField(required=False)
    medical_certificate = serializers.FileField(required=False)
    
    def validate(self, data):
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError("Passwords don't match")
        return data
    
    def create(self, validated_data):
        # Extract athlete profile data
        athlete_data = {
            'first_name': validated_data['first_name'],
            'last_name': validated_data['last_name'],
            'date_of_birth': validated_data['athlete_date_of_birth'],
            'address': validated_data.get('address', ''),
            'mobile_number': validated_data.get('mobile_number', ''),
            'club': validated_data.get('club'),
            'city': validated_data.get('athlete_city'),
            'previous_experience': validated_data.get('previous_experience', ''),
            'emergency_contact_name': validated_data.get('emergency_contact_name', ''),
            'emergency_contact_phone': validated_data.get('emergency_contact_phone', ''),
            'profile_image': validated_data.get('profile_image'),
            'medical_certificate': validated_data.get('medical_certificate'),
        }
        
        # Create user
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=validated_data['first_name'],
            last_name=validated_data['last_name'],
            phone_number=validated_data.get('phone_number', ''),
            date_of_birth=validated_data.get('date_of_birth'),
            city=validated_data.get('city'),
            role='user'  # Will change to 'athlete' after approval
        )
        
        # Create athlete profile
        athlete_profile = AthleteProfile.objects.create(user=user, **athlete_data)
        
        # Log activity
        AthleteProfileActivity.objects.create(
            profile=athlete_profile,
            action='submitted',
            performed_by=user,
            notes='Initial profile submission'
        )
        
        return user

class SupporterRegistrationSerializer(serializers.Serializer):
    """Serializer for supporter registration"""
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    phone_number = serializers.CharField(max_length=15, required=False)
    date_of_birth = serializers.DateField(required=False)
    city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), required=False)
    
    def validate(self, data):
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError("Passwords don't match")
        return data
    
    def create(self, validated_data):
        validated_data.pop('password_confirm')
        validated_data['role'] = 'supporter'
        validated_data['profile_completed'] = True  # Supporters don't need approval
        return User.objects.create_user(**validated_data)

class AthleteProfileApprovalSerializer(serializers.Serializer):
    """Serializer for admin actions on athlete profiles"""
    action = serializers.ChoiceField(choices=['approve', 'reject', 'request_revision'])
    notes = serializers.CharField(required=False)
    
    def validate(self, data):
        if data['action'] in ['reject', 'request_revision'] and not data.get('notes'):
            raise serializers.ValidationError("Notes are required for rejection or revision requests")
        return data

class SupporterAthleteRelationSerializer(serializers.ModelSerializer):
    """Serializer for supporter-athlete relationships"""
    supporter_name = serializers.CharField(source='supporter.get_full_name', read_only=True)
    athlete_name = serializers.CharField(source='athlete.__str__', read_only=True)
    relationship_display = serializers.CharField(source='get_relationship_display', read_only=True)
    
    class Meta:
        model = SupporterAthleteRelation
        fields = [
            'id', 'supporter', 'supporter_name', 'athlete', 'athlete_name',
            'relationship', 'relationship_display', 'can_edit', 'can_register_competitions',
            'created'
        ]

class AthleteProfileActivitySerializer(serializers.ModelSerializer):
    """Serializer for profile activity log"""
    action_display = serializers.CharField(source='get_action_display', read_only=True)
    performed_by_name = serializers.CharField(source='performed_by.get_full_name', read_only=True)
    
    class Meta:
        model = AthleteProfileActivity
        fields = [
            'id', 'profile', 'action', 'action_display', 
            'performed_by', 'performed_by_name', 'notes', 'timestamp'
        ]

# Enhanced User serializer
class EnhancedUserSerializer(serializers.ModelSerializer):
    """Enhanced user serializer with athlete profile info"""
    has_pending_athlete_profile = serializers.BooleanField(read_only=True)
    has_approved_athlete_profile = serializers.BooleanField(read_only=True)
    athlete_profile_status = serializers.SerializerMethodField()
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 
            'role', 'role_display', 'phone_number', 'date_of_birth', 'city',
            'profile_completed', 'has_pending_athlete_profile', 'has_approved_athlete_profile',
            'athlete_profile_status', 'date_joined'
        ]
        read_only_fields = ['role', 'has_pending_athlete_profile', 'has_approved_athlete_profile']
    
    def get_athlete_profile_status(self, obj):
        if hasattr(obj, 'athlete_profile'):
            return obj.athlete_profile.status
        return None

# Enhanced Athlete serializer  
class EnhancedAthleteSerializer(serializers.ModelSerializer):
    """Enhanced athlete serializer with user info"""
    user_email = serializers.EmailField(source='user.email', read_only=True)
    can_edit_profile = serializers.BooleanField(read_only=True)
    can_add_results = serializers.BooleanField(read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True)
    
    class Meta:
        model = Athlete
        fields = [
            'id', 'user', 'user_email', 'first_name', 'last_name', 'date_of_birth',
            'address', 'mobile_number', 'club', 'city', 'current_grade',
            'federation_role', 'title', 'registered_date', 'expiration_date',
            'is_coach', 'is_referee', 'profile_image',
            'approved_date', 'approved_by', 'approved_by_name',
            'can_edit_profile', 'can_add_results'
        ]
        read_only_fields = ['user', 'approved_date', 'approved_by', 'current_grade']