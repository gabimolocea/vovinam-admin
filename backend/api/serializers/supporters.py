from rest_framework import serializers
from django.db.models import Q
from ..models import *
from landing.models import Event


class SupporterAthleteRelationSerializer(serializers.ModelSerializer):
    """Serializer for supporter-athlete relationships"""
    supporter = serializers.PrimaryKeyRelatedField(read_only=True)
    athlete = serializers.PrimaryKeyRelatedField(queryset=Athlete.objects.all())
    
    class Meta:
        model = SupporterAthleteRelation
        fields = [
            'id', 'supporter', 'athlete', 'relationship',
            'can_edit', 'can_register_competitions', 'status',
            'reviewed_by', 'reviewed_date', 'created',
        ]
        read_only_fields = ['created', 'status', 'reviewed_by', 'reviewed_date']
    
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


