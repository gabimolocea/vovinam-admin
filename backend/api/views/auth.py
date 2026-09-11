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
from django.contrib.auth.tokens import default_token_generator
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoPasswordValidationError
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from ..email_utils import send_status_email


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


class PasswordResetRequestView(APIView):
    """Step 1 of self-service password reset: POST {"email"}. Always returns
    a generic 200 regardless of whether the email is registered, so this
    endpoint can't be used to enumerate accounts - only sends the reset
    email when a matching, usable-password account exists."""
    permission_classes = [AllowAny]

    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        generic_response = Response({
            'message': 'Dacă adresa de email există în sistem, vei primi un link de resetare a parolei.',
        })
        if not email:
            return Response({'error': 'Adresa de email este obligatorie.'}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(email__iexact=email).first()
        if not user or not user.has_usable_password():
            return generic_response

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_path = f'/reseteaza-parola?uid={uid}&token={token}'
        send_status_email(
            user,
            title='Resetare parolă',
            message='Am primit o cerere de resetare a parolei contului tău. Dacă nu ai cerut tu asta, poți ignora acest email - parola ta rămâne neschimbată.\n\nLinkul de mai jos este valabil o perioadă limitată.',
            cta_label='Resetează parola',
            cta_path=reset_path,
        )
        return generic_response


class PasswordResetConfirmView(APIView):
    """Step 2: POST {"uid", "token", "new_password"} - validates the token
    from the emailed link and sets the new password."""
    permission_classes = [AllowAny]

    def post(self, request):
        uid = request.data.get('uid')
        token = request.data.get('token')
        new_password = request.data.get('new_password')

        if not uid or not token or not new_password:
            return Response({'error': 'Cerere invalidă.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(pk=force_str(urlsafe_base64_decode(uid)))
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            return Response({'error': 'Link de resetare invalid.'}, status=status.HTTP_400_BAD_REQUEST)

        if not default_token_generator.check_token(user, token):
            return Response({'error': 'Link de resetare invalid sau expirat. Cere unul nou.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_password(new_password, user=user)
        except DjangoPasswordValidationError as exc:
            return Response({'error': ' '.join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save(update_fields=['password'])
        return Response({'message': 'Parola a fost resetată cu succes.'})


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


class ChangePasswordView(APIView):
    """Lets the logged-in user change their own password from account
    settings. Requires the current password to avoid a stolen/left-open
    session being used to lock the real owner out."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from django.contrib.auth.password_validation import validate_password

        current_password = request.data.get('current_password')
        new_password = request.data.get('new_password')
        if not current_password or not new_password:
            return Response(
                {'error': 'Parola curentă și noua parolă sunt obligatorii.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not request.user.check_password(current_password):
            return Response({'error': 'Parola curentă este incorectă.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(new_password, user=request.user)
        except DjangoValidationError as e:
            return Response({'error': ' '.join(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

        request.user.set_password(new_password)
        request.user.save(update_fields=['password'])
        return Response({'message': 'Parola a fost schimbată cu succes.'})


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
