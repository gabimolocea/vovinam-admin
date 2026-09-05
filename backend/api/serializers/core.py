from rest_framework import serializers
from django.db.models import Q
from ..models import *
from landing.models import Event


class CitySerializer(serializers.ModelSerializer):
    class Meta:
        model = City
        fields = ['id', 'name']

class GroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = ['id', 'name', 'event', 'birth_year_start', 'birth_year_end', 'birth_date_start', 'birth_date_end', 'allow_younger', 'allowed_grade_type', 'display_order']
        read_only_fields = ['id']


# FrontendThemeSerializer removed — frontend theme API is no longer provided.


# Authentication Serializers
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
