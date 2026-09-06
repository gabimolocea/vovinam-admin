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
from django.conf import settings
from django.core.files.base import ContentFile
import logging
from pathlib import Path
from django.db import IntegrityError


@api_view(['GET'])
@permission_classes([AllowAny])
def athlete_detail(request, pk):
    """Public-facing athlete detail endpoint used by the frontend.

    This complements the ViewSet detail route which may not always be available
    during dynamic registrations in development. Returning this as a plain
    function-based view ensures a stable URL for public athlete pages.
    """
    try:
        athlete = Athlete.objects.select_related('club__city', 'city', 'current_grade').get(
            pk=pk,
            status='approved',
            is_deleted=False,
        )
    except Athlete.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    serializer = PublicAthleteSerializer(athlete, context={'request': request})
    return Response(serializer.data)


class AthleteViewSet(viewsets.ModelViewSet):
    """Public athlete endpoints plus profile creation and admin actions.

    - list/retrieve: public (AllowAny)
    - create/update: authenticated users (profile creation uses AthleteProfileSerializer)
    - admin-only actions: approve/process_application
    """
    queryset = Athlete.objects.all()
    serializer_class = AthleteSerializer
    
    def get_permissions(self):
        """Use different permissions based on action"""
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        elif self.action in ['update', 'partial_update', 'destroy']:
            return [IsClubCoachOrAdmin()]
        return [permissions.IsAuthenticated()]

    def get_serializer_class(self):
        """Use minimal serializer for list, full for detail, writable for mutations."""
        if self.action in ['list', 'retrieve'] and not (
            self.request.user and self.request.user.is_authenticated and self.request.user.is_admin
        ):
            return PublicAthleteSerializer
        if self.action == 'retrieve':
            return AthleteDetailSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return AthleteSerializer
        return AthleteMinimalSerializer

    def get_queryset(self):
        """Optimize queryset with select_related and prefetch_related"""
        queryset = Athlete.objects.select_related(
            'user',
            'club',
            'city',
            'current_grade',
            'federation_role',
            'title',
            'reviewed_by'
        ).prefetch_related(
            'grade_history',
            'visas',
            'team_members'
        )

        if self.action in ['list', 'retrieve'] and not (
            self.request.user and self.request.user.is_authenticated and self.request.user.is_admin
        ):
            queryset = queryset.filter(status='approved', is_deleted=False)
        
        # Apply filters
        club_id = self.request.query_params.get('club')
        if club_id:
            queryset = queryset.filter(club_id=club_id)

        # my_club filter — returns athletes from the authenticated user's club
        my_club = self.request.query_params.get('my_club')
        if my_club and str(my_club).lower() in ('1', 'true', 'yes'):
            user = self.request.user
            if user and user.is_authenticated and hasattr(user, 'athlete') and user.athlete and user.athlete.club_id:
                queryset = queryset.filter(club_id=user.athlete.club_id)
            else:
                queryset = queryset.none()
        
        return queryset

    def list(self, request):
        # Support filtering for operational lists and the public directory.
        is_coach = request.query_params.get('is_coach')
        is_referee = request.query_params.get('is_referee')
        queryset = self.get_queryset()
        if is_coach is not None:
            if str(is_coach).lower() in ('1', 'true', 'yes'):
                queryset = queryset.filter(is_coach=True)
            else:
                queryset = queryset.filter(is_coach=False)

        if is_referee is not None:
            if str(is_referee).lower() in ('1', 'true', 'yes'):
                queryset = queryset.filter(is_referee=True)
            else:
                queryset = queryset.filter(is_referee=False)

        q = request.query_params.get('q')
        if q:
            queryset = queryset.filter(
                models.Q(first_name__icontains=q)
                | models.Q(last_name__icontains=q)
                | models.Q(club__name__icontains=q)
                | models.Q(current_grade__name__icontains=q)
                | models.Q(city__name__icontains=q)
            )

        city_id = request.query_params.get('city')
        if city_id:
            queryset = queryset.filter(city_id=city_id)

        grade_id = request.query_params.get('grade')
        if grade_id:
            queryset = queryset.filter(current_grade_id=grade_id)

        age_group = request.query_params.get('age_group')
        if age_group:
            today = timezone.localdate()

            def years_ago(years):
                try:
                    return today.replace(year=today.year - years)
                except ValueError:
                    return today.replace(year=today.year - years, day=28)

            if age_group == 'u12':
                queryset = queryset.filter(date_of_birth__gt=years_ago(12))
            elif age_group == 'u16':
                queryset = queryset.filter(date_of_birth__lte=years_ago(12), date_of_birth__gt=years_ago(16))
            elif age_group == 'u21':
                queryset = queryset.filter(date_of_birth__lte=years_ago(16), date_of_birth__gt=years_ago(21))
            elif age_group == 'senior':
                queryset = queryset.filter(date_of_birth__lte=years_ago(21))

        queryset = queryset.order_by('last_name', 'first_name', 'id')

        serializer = self.get_serializer_class()
        paginate = str(request.query_params.get('paginate', '')).lower() in ('1', 'true', 'yes')
        if paginate:
            paginator = PageNumberPagination()
            paginator.page_size = 20
            paginator.page_size_query_param = 'page_size'
            paginator.max_page_size = 100
            page = paginator.paginate_queryset(queryset, request, view=self)
            ser = serializer(page, many=True)
            return paginator.get_paginated_response(ser.data)
        ser = serializer(queryset, many=True)
        return Response(ser.data)

    def retrieve(self, request, pk=None):
        athlete = self.get_object()
        serializer = self.get_serializer_class()
        ser = serializer(athlete)
        return Response(ser.data)

    def create(self, request):
        """Create athlete profile.
        
        - Coaches can create athletes for their own club (no user link).
        - Regular users create their own profile (linked to their user account).
        """
        if not request.user or not request.user.is_authenticated:
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

        # Check if this is a coach creating an athlete for their club
        is_coach = hasattr(request.user, 'athlete') and request.user.athlete and request.user.athlete.is_coach
        coach_create = request.data.get('coach_create', False)

        if is_coach and coach_create:
            # Coach creating athlete for their club
            serializer = AthleteSerializer(data=request.data, context={'request': request})
            if serializer.is_valid():
                club = request.user.athlete.club
                athlete = serializer.save(club=club, status='approved')
                # Handle profile image upload
                if 'profile_image' in request.FILES:
                    athlete.profile_image = request.FILES['profile_image']
                    athlete.save()
                return Response(AthleteSerializer(athlete).data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Regular user creating their own profile
        if hasattr(request.user, 'athlete') and request.user.athlete:
            return Response({'error': 'You already have an athlete profile.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = AthleteProfileSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            athlete = serializer.save(user=request.user, status='pending')
            return Response(AthleteProfileSerializer(athlete).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def update(self, request, pk=None, *args, **kwargs):
        # Allow partial updates via AthleteProfileSerializer when editing own profile
        partial = kwargs.pop('partial', False)
        athlete = self.get_object()
        # Allow: the athlete's own account, an admin, or a supporter explicitly
        # granted can_edit=True on their SupporterAthleteRelation. Previously
        # `can_edit` was stored but never checked anywhere, so it had no effect.
        is_owner_or_admin = athlete.user == request.user or (request.user and request.user.is_admin)
        is_authorized_supporter = (
            not is_owner_or_admin
            and request.user
            and request.user.is_authenticated
            and SupporterAthleteRelation.objects.filter(
                supporter=request.user, athlete=athlete, can_edit=True, status='approved'
            ).exists()
        )
        if not is_owner_or_admin and not is_authorized_supporter:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        serializer_class = AthleteSerializer if request.user and request.user.is_admin else AthleteProfileSerializer
        serializer = serializer_class(athlete, data=request.data, partial=partial, context={'request': request})
        if serializer.is_valid():
            updated = serializer.save()
            return Response(AthleteDetailSerializer(updated).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def approve(self, request, pk=None):
        try:
            with transaction.atomic():
                athlete = Athlete.objects.select_for_update().get(pk=self.get_object().pk)
                if athlete.status != 'pending':
                    return Response({'error': 'Athlete profile is not pending approval'}, status=status.HTTP_400_BAD_REQUEST)
                athlete.approve(request.user)
            return Response({'message': 'Athlete profile approved successfully', 'athlete_id': athlete.id})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def process_application(self, request, pk=None):
        athlete_pk = self.get_object().pk
        serializer = AthleteProfileApprovalSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        action = serializer.validated_data['action']
        notes = serializer.validated_data.get('notes', '')
        try:
            with transaction.atomic():
                athlete = Athlete.objects.select_for_update().get(pk=athlete_pk)
                if athlete.status != 'pending':
                    return Response({'error': 'Athlete profile is not pending approval'}, status=status.HTTP_400_BAD_REQUEST)
                if action == 'approve':
                    athlete.approve(request.user)
                    result_message = 'Athlete profile approved successfully'
                elif action == 'reject':
                    athlete.reject(request.user, notes)
                    result_message = 'Athlete profile rejected'
                elif action == 'request_revision':
                    athlete.request_revision(request.user, notes)
                    result_message = 'Revision requested'
            return Response({'message': result_message})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get', 'post', 'put'], permission_classes=[permissions.IsAuthenticated], url_path='my-profile')
    def my_profile(self, request):
        """Convenience endpoint for the current user's athlete profile.

        - GET /api/athletes/my-profile/ -> returns current user's profile
        - POST -> create a new profile for current user (if none)
        - PUT -> update current user's profile (if owner)
        """
        user = request.user
        if request.method == 'GET':
            try:
                athlete = Athlete.objects.get(user=user)
                serializer = AthleteProfileSerializer(athlete)
                return Response(serializer.data)
            except Athlete.DoesNotExist:
                return Response({'error': 'No athlete profile found'}, status=status.HTTP_404_NOT_FOUND)

        if request.method == 'POST':
            # create profile for current user
            if hasattr(user, 'athlete') and user.athlete:
                return Response({'error': 'You already have an athlete profile'}, status=status.HTTP_400_BAD_REQUEST)
            serializer = AthleteProfileSerializer(data=request.data, context={'request': request})
            if serializer.is_valid():
                athlete = serializer.save(user=user, status='pending')
                # Onboarding is complete once the athlete/coach profile is
                # submitted - admin approval (athlete.status) is tracked
                # separately and doesn't block the user from using their
                # account meanwhile.
                user.role = 'athlete'
                user.profile_completed = True
                user.save(update_fields=['role', 'profile_completed'])
                return Response(AthleteProfileSerializer(athlete).data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        if request.method == 'PUT':
            try:
                athlete = Athlete.objects.get(user=user)
            except Athlete.DoesNotExist:
                return Response({'error': 'No athlete profile found'}, status=status.HTTP_404_NOT_FOUND)

            if athlete.user != user and not user.is_admin:
                return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

            serializer = AthleteProfileSerializer(athlete, data=request.data, partial=True, context={'request': request})
            if serializer.is_valid():
                updated = serializer.save()
                # If the athlete was in revision_required and user updated, resubmit
                if updated.status == 'revision_required':
                    updated.resubmit()
                return Response(AthleteProfileSerializer(updated).data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CoachesViewSet(viewsets.ViewSet):
    """Lightweight endpoint that returns a compact list of coach-athletes for frontend selects.

    GET /api/coaches/?q=<name>
    """
    permission_classes = [AllowAny]

    def list(self, request):
        queryset = Athlete.objects.filter(is_coach=True)
        q = request.query_params.get('q')
        if q:
            queryset = queryset.filter(models.Q(first_name__icontains=q) | models.Q(last_name__icontains=q))
        # Use a minimal serializer to keep payload small
        serializer = CoachSimpleSerializer(queryset, many=True)
        return Response(serializer.data)


class PendingApprovalsView(APIView):
    """Admin view for pending athlete profile approvals"""
    permission_classes = [IsAdmin]
    
    def get(self, request):
        """Get all pending athlete profiles"""
        pending_athletes = Athlete.objects.filter(status='pending').order_by('-submitted_date')
        serializer = AthleteProfileSerializer(pending_athletes, many=True)
        return Response({
            'pending_count': pending_athletes.count(),
            'profiles': serializer.data
        })
    
    def post(self, request):
        """Handle approval/rejection actions"""
        profile_id = request.data.get('profile_id')
        action = request.data.get('action')  # 'approve', 'reject', 'request_revision'
        admin_notes = request.data.get('admin_notes', '')
        
        if not profile_id or not action:
            return Response(
                {'error': 'profile_id and action are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if action not in ['approve', 'reject', 'request_revision']:
            return Response(
                {'error': 'action must be approve, reject, or request_revision'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            with transaction.atomic():
                athlete = Athlete.objects.select_for_update().get(id=profile_id)

                if athlete.status != 'pending':
                    return Response(
                        {'error': 'Athlete profile is not in pending status'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                # Use the athlete workflow methods
                if action == 'approve':
                    athlete.approve(request.user)
                elif action == 'reject':
                    athlete.reject(request.user, admin_notes)
                elif action == 'request_revision':
                    athlete.request_revision(request.user, admin_notes)
            
            serializer = AthleteProfileSerializer(athlete)
            return Response({
                'message': f'Athlete profile {action}d successfully',
                'profile': serializer.data
            })
            
        except Athlete.DoesNotExist:
            return Response(
                {'error': 'Athlete profile not found'},
                status=status.HTTP_404_NOT_FOUND
            )


class MyAthleteProfileView(APIView):
    """User's own athlete profile management"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        """Get current user's athlete profile"""
        try:
            athlete = Athlete.objects.get(user=request.user)
            serializer = AthleteProfileSerializer(athlete)
            return Response(serializer.data)
        except Athlete.DoesNotExist:
            return Response(
                {'error': 'No athlete profile found'},
                status=status.HTTP_404_NOT_FOUND
            )
    


def athlete_profiles_compat(request, subpath=''):
    """Compatibility shim: redirect any /api/athlete-profiles/* requests to /api/athletes/*.

    Returns a 307 Temporary Redirect with Deprecation and Link headers so clients
    can migrate. The Location header points to the replacement URL.
    """
    try:
        # Build the new absolute URL by replacing the path segment
        original = request.get_full_path()
        new_path = original.replace('/api/athlete-profiles', '/api/athletes')
        new_url = request.build_absolute_uri(new_path)
    except Exception:
        # Fallback to site-root replacement
        new_url = request.build_absolute_uri('/api/athletes/')

    body = {
        'detail': 'This endpoint has moved. See Location header for the replacement URL.',
        'replacement': new_url,
        'deprecated': True
    }

    resp = JsonResponse(body, status=307)
    resp['Location'] = new_url
    resp['Deprecation'] = 'true'
    resp['Link'] = f'<{new_url}>; rel="replacement"'
    return resp


# Reference Data Endpoints for Athlete Workflow
