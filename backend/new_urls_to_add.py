# Add these URL patterns to your existing urls.py

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    AthleteRegistrationView, SupporterRegistrationView,
    MyAthleteProfileView, MyAthleteDataView,
    AthleteProfileViewSet, SupporterAthleteRelationViewSet,
    EnhancedUserProfileView
)

# Add to your existing router
router.register('athlete-profiles', AthleteProfileViewSet, basename='athlete-profiles')
router.register('supporter-relations', SupporterAthleteRelationViewSet, basename='supporter-relations')

# Add these to your urlpatterns list
additional_urls = [
    # Enhanced registration endpoints
    path('auth/register/athlete/', AthleteRegistrationView.as_view(), name='register-athlete'),
    path('auth/register/supporter/', SupporterRegistrationView.as_view(), name='register-supporter'),
    
    # Enhanced profile management
    path('auth/profile/enhanced/', EnhancedUserProfileView.as_view(), name='enhanced-profile'),
    
    # Athlete profile management (pending approval)
    path('athlete-profiles/my-profile/', MyAthleteProfileView.as_view(), name='my-athlete-profile'),
    
    # Approved athlete data management
    path('athletes/my-athlete/', MyAthleteDataView.as_view(), name='my-athlete-data'),
]

# Combine with existing urlpatterns
urlpatterns += additional_urls

# Example of complete URL structure:
"""
# Authentication & Registration
POST /api/auth/register/athlete/          # Register as athlete (pending approval)
POST /api/auth/register/supporter/        # Register as supporter (immediate access)
POST /api/auth/login/                     # Login (existing)
GET  /api/auth/profile/enhanced/          # Get enhanced user profile
PUT  /api/auth/profile/enhanced/          # Update user profile

# Athlete Profile Management (Pending Approval)
GET  /api/athlete-profiles/my-profile/    # Get my pending athlete profile
PUT  /api/athlete-profiles/my-profile/    # Update my pending athlete profile
POST /api/athlete-profiles/my-profile/    # Create athlete profile (for existing users)

# Admin: Athlete Profile Approval
GET  /api/athlete-profiles/               # List all profiles (admin)
GET  /api/athlete-profiles/pending/       # List pending profiles (admin)
GET  /api/athlete-profiles/statistics/    # Get approval statistics (admin)
POST /api/athlete-profiles/{id}/approve/  # Approve profile (admin)
POST /api/athlete-profiles/{id}/reject/   # Reject profile (admin)
POST /api/athlete-profiles/{id}/request_revision/  # Request revision (admin)
GET  /api/athlete-profiles/{id}/activity_log/      # Get activity log (admin)

# Approved Athlete Data Management
GET  /api/athletes/my-athlete/            # Get my approved athlete data
PUT  /api/athletes/my-athlete/            # Update my approved athlete data (limited fields)

# Supporter-Athlete Relationships
GET  /api/supporter-relations/            # List relationships (based on user role)
POST /api/supporter-relations/            # Create relationship (admin)
PUT  /api/supporter-relations/{id}/       # Update relationship (admin)
DELETE /api/supporter-relations/{id}/     # Delete relationship (admin)
"""