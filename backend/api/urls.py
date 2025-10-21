from django.contrib import admin
from django.urls import path, include
from .views import *
from . import views
from rest_framework.routers import DefaultRouter

router = DefaultRouter()

router.register(r'city', CityViewSet, basename='city')
router.register('club', ClubViewSet, basename='club')
router.register('competition', CompetitionViewSet, basename='competition')
router.register('athlete', AthleteViewSet, basename='athlete')
router.register('athlete-profile', AthleteProfileViewSet, basename='athlete-profile')
router.register('supporter-athlete-relation', SupporterAthleteRelationViewSet, basename='supporter-athlete-relation')
router.register('title', TitleViewSet, basename='title')
router.register('federation-role', FederationRoleViewSet, basename='federation-role')
router.register('grade', GradeViewSet, basename='grade')
router.register('team', TeamViewSet, basename='team')
router.register('match', MatchViewSet, basename='match')
router.register('annual-visa', AnnualVisaViewSet, basename='annual-visa')
router.register('category', CategoryViewSet, basename='category')
router.register('grade-history', GradeHistoryViewSet, basename='grade-history')
router.register('medical-visa', MedicalVisaViewSet, basename='medical-visa')
router.register('training-seminar', TrainingSeminarViewSet, basename='training-seminar')
router.register('group', GroupViewSet, basename='group')
router.register('frontend-theme', FrontendThemeViewSet, basename='frontend-theme')
router.register('category-athlete-score', CategoryAthleteScoreViewSet, basename='category-athlete-score')
router.register('category-score-activity', CategoryScoreActivityViewSet, basename='category-score-activity')


urlpatterns = [
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
    path('athlete-profile/my-profile/', MyAthleteProfileView.as_view(), name='my-athlete-profile'),
    path('admin-approvals/pending/', PendingApprovalsView.as_view(), name='pending-approvals'),
    
    # Reference data endpoints
    path('sports/', views.sports_list, name='sports-list'),
    path('categories/', views.categories_list, name='categories-list'),
    path('clubs/', views.clubs_list, name='clubs-list'),
    
    # Router URLs (should come last to avoid conflicts)
    path('', include(router.urls)),  # This will handle the actual endpoints
]
