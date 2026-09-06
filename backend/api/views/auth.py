from django.shortcuts import render
from datetime import datetime, timedelta
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from django.db import models, transaction
from django.db.models import Prefetch, Q
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.decorators import api_view, action, permission_classes
from rest_framework import viewsets, permissions, status
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from ..serializers import *
from ..models import *
from ..permissions import IsAdminOrReadOnly, IsAdmin, IsOwnerOrAdmin, IsClubCoachOrAdmin, IsAthleteOwnerCoachOrAdmin
from rest_framework.response import Response
from rest_framework.reverse import reverse
from rest_framework_simplejwt.tokens import RefreshToken
from django.conf import settings
from django.core.files.base import ContentFile
import logging
from pathlib import Path
from django.db import IntegrityError


class RegisterView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = UserRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': UserSerializer(user).data,
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                }
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LoginView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = UserLoginSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data['user']
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': UserSerializer(user).data,
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                }
            })
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        refresh_token = request.data.get("refresh")
        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
            except Exception:
                return Response({"error": "Invalid token"}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"message": "Successfully logged out"}, status=status.HTTP_200_OK)


class SessionCheckView(APIView):
    """Check if user has an active Django session (e.g., from admin login)"""
    permission_classes = [AllowAny]
    
    def get(self, request):
        # Check if user is authenticated via Django session
        if request.user.is_authenticated:
            return Response({
                'authenticated': True,
                'user': UserSerializer(request.user).data
            })
        else:
            return Response({
                'authenticated': False,
                'user': None
            })


class SessionLoginView(APIView):
    """Convert Django session authentication to JWT tokens"""
    permission_classes = [AllowAny]
    
    def post(self, request):
        # Check if user is authenticated via Django session
        if request.user.is_authenticated:
            refresh = RefreshToken.for_user(request.user)
            return Response({
                'user': UserSerializer(request.user).data,
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                }
            })
        else:
            return Response(
                {'error': 'No active session found'}, 
                status=status.HTTP_401_UNAUTHORIZED
            )


class SessionLogoutView(APIView):
    """Logout from Django session"""
    permission_classes = [AllowAny]
    
    def post(self, request):
        from django.contrib.auth import logout
        # Also revoke any JWT refresh token the client held from a prior
        # session-login bridge, so it stops working after this logout.
        refresh_token = request.data.get("refresh")
        if refresh_token:
            try:
                RefreshToken(refresh_token).blacklist()
            except Exception:
                pass
        logout(request)
        return Response({'message': 'Session logged out successfully'})


# =====================================
# ATHLETE WORKFLOW VIEWS
# =====================================


class UserRegistrationView(APIView):
    """Enhanced user registration with role selection"""
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = UserRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            
            # Generate tokens
            refresh = RefreshToken.for_user(user)
            
            return Response({
                'user': UserProfileSerializer(user).data,
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                },
                'message': 'Registration successful'
            }, status=status.HTTP_201_CREATED)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UserProfileView(APIView):
    """User profile management"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        """Get current user profile"""
        serializer = UserProfileSerializer(request.user)
        return Response(serializer.data)
    
    def put(self, request):
        """Update current user profile"""
        serializer = UserProfileSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class OnboardingRoleView(APIView):
    """Step 2 of the public onboarding wizard: choose account type.

    POST body: {"role": "athlete" | "supporter"}. Deliberately whitelists
    only these two values server-side - 'admin' is never accepted here,
    admin accounts are only ever created via Django admin.

    - 'supporter': no athlete profile needed, onboarding is complete
      immediately (profile_completed=True).
    - 'athlete': profile_completed stays False until the athlete profile
      itself is submitted via POST /api/athletes/my-profile/ (which also
      covers coaches - see AthleteViewSet.my_profile).
    """
    permission_classes = [permissions.IsAuthenticated]

    ALLOWED_ROLES = ('athlete', 'supporter')

    def post(self, request):
        role = request.data.get('role')
        if role not in self.ALLOWED_ROLES:
            return Response(
                {'error': f"role must be one of {self.ALLOWED_ROLES}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user
        user.role = role
        if role == 'supporter':
            user.profile_completed = True
        user.save(update_fields=['role', 'profile_completed'])
        return Response(UserProfileSerializer(user).data)
