from rest_framework import serializers
from django.db.models import Q
from ..models import *
from landing.models import Event


class TitleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Title
        fields = ['id', 'name']

class FederationRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = FederationRole
        fields = ['id', 'name']
