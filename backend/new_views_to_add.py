# Add these views to your existing views.py

from rest_framework import status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet
from django.utils import timezone
from django.db.models import Q
from .models import AthleteProfile, SupporterAthleteRelation, AthleteProfileActivity
from .serializers import (
    AthleteRegistrationSerializer, SupporterRegistrationSerializer,
    AthleteProfileSerializer, AthleteProfileCreateSerializer,
    AthleteProfileApprovalSerializer, SupporterAthleteRelationSerializer,
    AthleteProfileActivitySerializer, EnhancedUserSerializer, EnhancedAthleteSerializer
)

class AthleteRegistrationView(APIView):
    """Register new athlete (creates pending profile)"""
    permission_classes = [permissions.AllowAny]
    
    def post(self, request):
        serializer = AthleteRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            refresh = RefreshToken.for_user(user)
            return Response({
                'message': 'Athlete registration successful. Your profile is pending approval.',
                'user': EnhancedUserSerializer(user).data,
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                }
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class SupporterRegistrationView(APIView):
    """Register new supporter (immediate access)"""
    permission_classes = [permissions.AllowAny]
    
    def post(self, request):
        serializer = SupporterRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            refresh = RefreshToken.for_user(user)
            return Response({
                'message': 'Supporter registration successful.',
                'user': EnhancedUserSerializer(user).data,
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                }
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class MyAthleteProfileView(APIView):
    """Manage current user's athlete profile"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        try:
            profile = request.user.athlete_profile
            serializer = AthleteProfileSerializer(profile)
            return Response(serializer.data)
        except AthleteProfile.DoesNotExist:
            return Response({'error': 'No athlete profile found'}, status=status.HTTP_404_NOT_FOUND)
    
    def put(self, request):
        try:
            profile = request.user.athlete_profile
            if profile.status not in ['pending', 'revision_required']:
                return Response({
                    'error': 'Profile cannot be edited in current status'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            serializer = AthleteProfileSerializer(profile, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                
                # Log activity
                if profile.status == 'revision_required':
                    profile.status = 'pending'  # Back to pending after revision
                    profile.save()
                    
                    AthleteProfileActivity.objects.create(
                        profile=profile,
                        action='resubmitted',
                        performed_by=request.user,
                        notes='Profile updated after revision request'
                    )
                else:
                    AthleteProfileActivity.objects.create(
                        profile=profile,
                        action='updated',
                        performed_by=request.user,
                        notes='Profile updated'
                    )
                
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except AthleteProfile.DoesNotExist:
            return Response({'error': 'No athlete profile found'}, status=status.HTTP_404_NOT_FOUND)
    
    def post(self, request):
        """Create athlete profile for existing user"""
        if hasattr(request.user, 'athlete_profile'):
            return Response({
                'error': 'Athlete profile already exists'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = AthleteProfileCreateSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            profile = serializer.save()
            
            # Log activity
            AthleteProfileActivity.objects.create(
                profile=profile,
                action='submitted',
                performed_by=request.user,
                notes='Athlete profile created'
            )
            
            return Response(AthleteProfileSerializer(profile).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class AthleteProfileViewSet(ModelViewSet):
    """Admin viewset for managing athlete profiles"""
    serializer_class = AthleteProfileSerializer
    permission_classes = [IsAdmin]
    
    def get_queryset(self):
        queryset = AthleteProfile.objects.all()
        status_filter = self.request.query_params.get('status', None)
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset
    
    @action(detail=False, methods=['get'])
    def pending(self, request):
        """Get all pending profiles"""
        pending_profiles = AthleteProfile.objects.filter(status='pending')
        serializer = self.get_serializer(pending_profiles, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """Get approval statistics"""
        stats = {
            'pending': AthleteProfile.objects.filter(status='pending').count(),
            'approved': AthleteProfile.objects.filter(status='approved').count(),
            'rejected': AthleteProfile.objects.filter(status='rejected').count(),
            'revision_required': AthleteProfile.objects.filter(status='revision_required').count(),
        }
        return Response(stats)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve athlete profile"""
        profile = self.get_object()
        if profile.status != 'pending':
            return Response({
                'error': 'Only pending profiles can be approved'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = AthleteProfileApprovalSerializer(data=request.data)
        if serializer.is_valid():
            athlete = profile.approve(request.user)
            
            # Log activity
            AthleteProfileActivity.objects.create(
                profile=profile,
                action='approved',
                performed_by=request.user,
                notes=serializer.validated_data.get('notes', 'Profile approved')
            )
            
            return Response({
                'message': 'Profile approved successfully',
                'athlete_id': athlete.id
            })
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject athlete profile"""
        profile = self.get_object()
        if profile.status not in ['pending', 'revision_required']:
            return Response({
                'error': 'Profile cannot be rejected in current status'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = AthleteProfileApprovalSerializer(data=request.data)
        if serializer.is_valid():
            if serializer.validated_data['action'] != 'reject':
                return Response({
                    'error': 'Invalid action for this endpoint'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            profile.reject(request.user, serializer.validated_data['notes'])
            
            # Log activity
            AthleteProfileActivity.objects.create(
                profile=profile,
                action='rejected',
                performed_by=request.user,
                notes=serializer.validated_data['notes']
            )
            
            return Response({'message': 'Profile rejected'})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def request_revision(self, request, pk=None):
        """Request revision for athlete profile"""
        profile = self.get_object()
        if profile.status != 'pending':
            return Response({
                'error': 'Only pending profiles can have revision requested'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = AthleteProfileApprovalSerializer(data=request.data)
        if serializer.is_valid():
            if serializer.validated_data['action'] != 'request_revision':
                return Response({
                    'error': 'Invalid action for this endpoint'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            profile.request_revision(request.user, serializer.validated_data['notes'])
            
            # Log activity
            AthleteProfileActivity.objects.create(
                profile=profile,
                action='revision_requested',
                performed_by=request.user,
                notes=serializer.validated_data['notes']
            )
            
            return Response({'message': 'Revision requested'})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['get'])
    def activity_log(self, request, pk=None):
        """Get activity log for a profile"""
        profile = self.get_object()
        activities = profile.activity_log.all()
        serializer = AthleteProfileActivitySerializer(activities, many=True)
        return Response(serializer.data)

class MyAthleteDataView(APIView):
    """Manage approved athlete data (post-approval)"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        if not hasattr(request.user, 'athlete'):
            return Response({
                'error': 'No approved athlete profile found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        serializer = EnhancedAthleteSerializer(request.user.athlete)
        return Response(serializer.data)
    
    def put(self, request):
        if not hasattr(request.user, 'athlete'):
            return Response({
                'error': 'No approved athlete profile found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        athlete = request.user.athlete
        # Only allow editing certain fields
        allowed_fields = ['address', 'mobile_number', 'profile_image']
        filtered_data = {k: v for k, v in request.data.items() if k in allowed_fields}
        
        serializer = EnhancedAthleteSerializer(athlete, data=filtered_data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class SupporterAthleteRelationViewSet(ModelViewSet):
    """Manage supporter-athlete relationships"""
    serializer_class = SupporterAthleteRelationSerializer
    
    def get_queryset(self):
        if self.request.user.is_admin:
            return SupporterAthleteRelation.objects.all()
        elif self.request.user.is_supporter:
            return SupporterAthleteRelation.objects.filter(supporter=self.request.user)
        else:
            return SupporterAthleteRelation.objects.filter(athlete__user=self.request.user)
    
    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            permission_classes = [IsAdmin]  # Only admins can create relationships for now
        else:
            permission_classes = [permissions.IsAuthenticated]
        return [permission() for permission in permission_classes]

# Enhanced existing views
class EnhancedUserProfileView(APIView):
    """Enhanced user profile view with athlete status"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        serializer = EnhancedUserSerializer(request.user)
        return Response(serializer.data)
    
    def put(self, request):
        serializer = EnhancedUserSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)