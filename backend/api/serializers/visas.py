from rest_framework import serializers
from django.db.models import Q
from ..models import *
from landing.models import Event


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

class MedicalVisaSerializer(serializers.ModelSerializer):
    is_valid = serializers.BooleanField(read_only=True)  # Include the computed property

    class Meta:
        # Use unified Visa model for admin/API compatibility
        model = Visa
        fields = ['id', 'athlete', 'issued_date', 'health_status', 'is_valid']
        read_only_fields = ['is_valid']


class VisaApprovalSerializer(serializers.Serializer):
    """Serializer for admin approval/rejection/revision requests for a visa"""
    notes = serializers.CharField(required=False, allow_blank=True, max_length=500)


class VisaSubmissionSerializer(serializers.ModelSerializer):
    """Serializer for athlete visa (medical/annual) submissions with
    approval workflow - mirrors GradeHistorySubmissionSerializer and
    TrainingSeminarParticipationSerializer."""
    athlete = serializers.PrimaryKeyRelatedField(read_only=True)
    athlete_name = serializers.CharField(source='athlete.__str__', read_only=True)
    reviewed_by_name = serializers.CharField(source='reviewed_by.__str__', read_only=True)

    class Meta:
        model = Visa
        fields = [
            'id', 'athlete', 'athlete_name', 'visa_type', 'issued_date', 'image', 'notes',
            'submitted_by_athlete', 'status', 'submitted_date', 'reviewed_date', 'reviewed_by', 'reviewed_by_name', 'admin_notes',
        ]
        read_only_fields = ['submitted_by_athlete', 'status', 'submitted_date', 'reviewed_date', 'reviewed_by', 'reviewed_by_name', 'admin_notes']

    def create(self, validated_data):
        """Auto-assign the current user's athlete profile and set the
        submission flag, same as TrainingSeminarParticipationSerializer."""
        request = self.context.get('request')
        if not request or not hasattr(request.user, 'athlete'):
            raise serializers.ValidationError('Utilizatorul trebuie să aibă profil de sportiv.')

        validated_data['athlete'] = request.user.athlete
        validated_data['submitted_by_athlete'] = True

        from ..notification_utils import create_visa_submitted_notification
        visa = super().create(validated_data)
        try:
            create_visa_submitted_notification(visa)
        except Exception:
            import logging
            logging.getLogger(__name__).exception('Failed to create visa submitted notification')
        return visa


# TrainingSeminarParticipation serializer with approval workflow