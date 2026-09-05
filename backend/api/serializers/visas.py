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


# TrainingSeminarParticipation serializer with approval workflow