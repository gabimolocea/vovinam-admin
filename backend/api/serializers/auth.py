from rest_framework import serializers
from django.db.models import Q
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
import re
from ..models import *
from landing.models import Event


from .supporters import SupporterAthleteRelationSerializer
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

class UserRegistrationSerializer(serializers.ModelSerializer):
    """Simple email+password registration.

    Intentionally minimal: only email/password are collected up front. Role
    selection (athlete/supporter) and the athlete profile itself (name, date
    of birth, club, etc.) are filled in afterwards through the onboarding
    steps (`OnboardingRoleView` + `AthleteViewSet.my_profile`), not here.
    `username` is derived from the email since the model still requires a
    unique username but the public-facing forms no longer ask for one.
    """
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['email', 'password', 'password_confirm']
        extra_kwargs = {
            'password': {'write_only': True},
        }

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('Există deja un cont cu acest email.')
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError("Passwords don't match.")
        validate_password(attrs['password'])
        return attrs

    def _generate_username(self, email):
        base = re.sub(r'[^a-zA-Z0-9_.]', '', email.split('@')[0]) or 'user'
        username = base
        suffix = 0
        while User.objects.filter(username=username).exists():
            suffix += 1
            username = f'{base}{suffix}'
        return username

    def create(self, validated_data):
        validated_data.pop('password_confirm', None)
        password = validated_data.pop('password')
        email = validated_data['email']
        user = User.objects.create_user(
            username=self._generate_username(email),
            email=email,
            password=password,
            first_name='',
            last_name='',
            role='user',
        )
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
        # `role` is read-only here: self-service role selection (athlete vs
        # supporter, never admin) goes through OnboardingRoleView, which
        # validates the value server-side. Letting this generic profile
        # serializer accept an arbitrary `role` would let any authenticated
        # user PUT their way to role='admin'.
        read_only_fields = ['username', 'role', 'date_joined', 'is_active']
    
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
                'admin_notes': athlete.admin_notes,
                'club': athlete.club_id if hasattr(athlete, 'club_id') else (athlete.club.id if athlete.club else None),
                'is_coach': athlete.is_coach if hasattr(athlete, 'is_coach') else False,
                'is_referee': athlete.is_referee if hasattr(athlete, 'is_referee') else False,
            }
            representation['athlete_id'] = athlete.id
        
        return representation

