from rest_framework import serializers
from django.db.models import Q
from ..models import *
from landing.models import Event


from ._common import (
    CityMinimalSerializer,
    ClubMinimalSerializer,
    GradeMinimalSerializer,
    UserMinimalSerializer,
    _person_name,
    _safe_file_url,
    _safe_related,
    _safe_scalar,
)
class AthleteDetailSerializer(serializers.ModelSerializer):
    """Full athlete data with all relationships"""
    user = UserMinimalSerializer(read_only=True)
    club = ClubMinimalSerializer(read_only=True)
    city = CityMinimalSerializer(read_only=True)
    current_grade = GradeMinimalSerializer(read_only=True)
    full_name = serializers.SerializerMethodField()
    federation_role_name = serializers.SerializerMethodField()
    title_name = serializers.SerializerMethodField()
    gender_display = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()
    grade_history = serializers.SerializerMethodField()
    visas = serializers.SerializerMethodField()
    event_participations = serializers.SerializerMethodField()
    
    class Meta:
        model = Athlete
        fields = [
            'id', 'user', 'first_name', 'last_name', 'full_name',
            'gender', 'gender_display', 'license_series', 'cnp', 'date_of_birth', 'address', 'mobile_number',
            'emergency_contact_name', 'emergency_contact_phone',
            'previous_experience',
            'club', 'city', 'current_grade',
            'federation_role', 'federation_role_name', 'title', 'title_name', 'is_coach', 'is_referee',
            'status', 'registered_date', 'expiration_date',
            'status_display', 'submitted_date', 'reviewed_date', 'reviewed_by', 'reviewed_by_name',
            'admin_notes', 'approved_date', 'approved_by', 'profile_image', 'medical_certificate',
            'grade_history', 'visas', 'event_participations',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}"

    def get_federation_role_name(self, obj):
        return obj.federation_role.name if obj.federation_role else None

    def get_title_name(self, obj):
        return obj.title.name if obj.title else None

    def get_gender_display(self, obj):
        return obj.get_gender_display() if obj.gender else None

    def get_status_display(self, obj):
        return obj.get_status_display() if obj.status else None

    def get_reviewed_by_name(self, obj):
        return str(obj.reviewed_by) if obj.reviewed_by else None

    def get_grade_history(self, obj):
        rows = obj.grade_history.select_related('grade', 'event', 'examiner_1', 'examiner_2', 'reviewed_by').order_by('-obtained_date', '-id')
        return [
            {
                'id': row.id,
                'grade_name': row.grade.name if row.grade else None,
                'obtained_date': row.obtained_date,
                'level': row.get_level_display() if row.level else None,
                'event_name': str(row.event) if row.event else None,
                'examiner_1_name': str(row.examiner_1) if row.examiner_1 else None,
                'examiner_2_name': str(row.examiner_2) if row.examiner_2 else None,
                'submitted_by_athlete': row.submitted_by_athlete,
                'status': row.status,
                'status_display': row.get_status_display() if row.status else None,
                'submitted_date': row.submitted_date,
                'reviewed_date': row.reviewed_date,
                'reviewed_by_name': str(row.reviewed_by) if row.reviewed_by else None,
                'notes': row.notes,
                'admin_notes': row.admin_notes,
                'certificate_image': _safe_file_url(row.certificate_image),
                'result_document': _safe_file_url(row.result_document),
            }
            for row in rows
        ]

    def get_visas(self, obj):
        rows = obj.visas.order_by('-issued_date', '-id')
        return [
            {
                'id': row.id,
                'visa_type': row.visa_type,
                'visa_type_display': row.get_visa_type_display() if row.visa_type else None,
                'issued_date': row.issued_date,
                'visa_status': row.visa_status,
                'health_status': row.health_status,
                'status': row.status,
                'status_display': row.get_status_display() if row.status else None,
                'submitted_date': row.submitted_date,
                'is_valid': row.is_valid() if hasattr(row, 'is_valid') else False,
                'document': _safe_file_url(row.document),
                'image': _safe_file_url(row.image),
                'notes': row.notes,
            }
            for row in rows
        ]

    def get_event_participations(self, obj):
        rows = obj.seminar_participations.select_related('event', 'seminar', 'reviewed_by').order_by('-submitted_date', '-id')
        return [
            {
                'id': row.id,
                'event_name': row.event.title if row.event else (row.seminar.title if row.seminar else None),
                'event_type': row.event.event_type if row.event else (row.seminar.event_type if row.seminar else None),
                'start_date': row.event.start_date if row.event else (row.seminar.start_date if row.seminar else None),
                'end_date': row.event.end_date if row.event else (row.seminar.end_date if row.seminar else None),
                'submitted_by_athlete': row.submitted_by_athlete,
                'status': row.status,
                'status_display': row.get_status_display() if row.status else None,
                'submitted_date': row.submitted_date,
                'reviewed_date': row.reviewed_date,
                'reviewed_by_name': str(row.reviewed_by) if row.reviewed_by else None,
                'notes': row.notes,
                'admin_notes': row.admin_notes,
                'participation_certificate': _safe_file_url(row.participation_certificate),
                'participation_document': _safe_file_url(row.participation_document),
            }
            for row in rows
        ]


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

class CoachSimpleSerializer(serializers.ModelSerializer):
    """Minimal serializer used by the frontend when populating coach/examiner selects."""
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = Athlete
        fields = ['id', 'first_name', 'last_name', 'full_name']

    def get_full_name(self, obj):
        return _person_name(obj)


class AthleteProfileSerializer(serializers.ModelSerializer):
    """Serializer for athlete profiles with approval workflow"""
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    club = serializers.PrimaryKeyRelatedField(queryset=Club.objects.all(), allow_null=True, required=False)
    city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), allow_null=True, required=False)
    reviewed_by = serializers.StringRelatedField(read_only=True)
    
    class Meta:
        model = Athlete
        fields = [
            'id', 'user', 'first_name', 'last_name', 'gender', 'license_series', 'cnp', 'date_of_birth',
            'address', 'mobile_number', 'club', 'city', 'previous_experience', 'is_coach',
            'emergency_contact_name', 'emergency_contact_phone', 'status',
            'submitted_date', 'reviewed_date', 'reviewed_by', 'admin_notes',
            'profile_image', 'medical_certificate'
        ]
        read_only_fields = ['submitted_date', 'reviewed_date', 'reviewed_by']
        extra_kwargs = {
            'first_name': {'required': True},
            'last_name': {'required': True},
            'date_of_birth': {'required': True},
            # `is_coach` is self-declared here at onboarding time (athlete says
            # "I'm also a coach") but the profile still goes through the same
            # admin approval as any other athlete before it's trusted.
            'is_coach': {'required': False},
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

