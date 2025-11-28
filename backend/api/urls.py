from django.contrib import admin
from django.urls import path, include
from .views import *
from . import views
from rest_framework.routers import DefaultRouter

router = DefaultRouter()

router.register(r'cities', CityViewSet, basename='city')
router.register('clubs', ClubViewSet, basename='club')
router.register('competitions', CompetitionViewSet, basename='competition')
router.register('athletes', AthleteViewSet, basename='athlete')
# 'athlete-profiles' was consolidated into 'athletes' (profile actions moved to AthleteViewSet)
router.register('supporter-athlete-relations', SupporterAthleteRelationViewSet, basename='supporter-athlete-relation')
router.register('titles', TitleViewSet, basename='title')
router.register('federation-roles', FederationRoleViewSet, basename='federation-role')
router.register('grades', GradeViewSet, basename='grade')
router.register('teams', TeamViewSet, basename='team')
router.register('matches', MatchViewSet, basename='match')
router.register('annual-visas', AnnualVisaViewSet, basename='annual-visa')
router.register('categories', CategoryViewSet, basename='category')
router.register('category-athletes', CategoryAthleteViewSet, basename='category-athlete')
router.register('grade-histories', GradeHistoryViewSet, basename='grade-history')
router.register('medical-visas', MedicalVisaViewSet, basename='medical-visa')
# Training seminars removed - use Events API instead
router.register('groups', GroupViewSet, basename='group')
router.register('category-athlete-score', CategoryAthleteScoreViewSet, basename='category-athlete-score')
router.register('category-referee-score', CategoryRefereeScoreViewSet, basename='category-referee-score')
router.register('category-score-activity', CategoryScoreActivityViewSet, basename='category-score-activity')
router.register('notifications', NotificationViewSet, basename='notification')
router.register('notification-settings', NotificationSettingsViewSet, basename='notification-settings')
router.register('grade-submissions', GradeHistorySubmissionViewSet, basename='grade-submission')
router.register('seminar-submissions', TrainingSeminarParticipationViewSet, basename='seminar-submission')
router.register('coaches', CoachesViewSet, basename='coach')
# team-scores endpoint deprecated - use category-athlete-score with type='teams' filter

# Compatibility shim: keep responding to old athlete-profiles paths with a deprecation/redirect
from . import views as _views
urlpatterns = [
    path('athlete-profiles/', _views.athlete_profiles_compat, name='athlete-profiles-compat-root'),
    path('athlete-profiles/<path:subpath>/', _views.athlete_profiles_compat, name='athlete-profiles-compat'),
]

# then append the rest of the urlpatterns below

urlpatterns = [
    # CSRF token endpoint
    path('auth/csrf/', views.get_csrf_token, name='csrf-token'),
    
    # Category referee lookup for admin
    path('category-athlete-score/<int:pk>/referees/', views.get_category_referees, name='category-referees'),
    
    # Authentication URLs (existing)
    path('auth/register/', RegisterView.as_view(), name='register'),
    path('auth/login/', LoginView.as_view(), name='login'),
    path('auth/logout/', LogoutView.as_view(), name='logout'),
    path('auth/profile/', UserProfileView.as_view(), name='profile'),
    path('auth/session-check/', SessionCheckView.as_view(), name='session-check'),
    path('auth/session-login/', SessionLoginView.as_view(), name='session-login'),
    path('auth/session-logout/', SessionLogoutView.as_view(), name='session-logout'),
    
    # New athlete workflow URLs (must come before router.urls for specific endpoints)
    path('auth/register-enhanced/', UserRegistrationView.as_view(), name='register-enhanced'),
    path('auth/profile-enhanced/', views.UserProfileView.as_view(), name='profile-enhanced'),
    # legacy route removed: use /api/athletes/my-profile/ (provided by AthleteViewSet.my_profile)
    path('admin-approvals/pending/', PendingApprovalsView.as_view(), name='pending-approvals'),
    # Simple public athlete detail endpoint (stable URL for frontend)
    path('athletes/<int:pk>/', views.athlete_detail, name='athlete-detail-public'),
    
    # Reference data endpoints (non-conflicting with router)
    path('sports/', views.sports_list, name='sports-list'),
    
    # Router URLs (should come last to avoid conflicts)
    path('', include(router.urls)),  # This will handle the actual endpoints
]
