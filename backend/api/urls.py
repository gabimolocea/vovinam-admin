from django.contrib import admin
from django.urls import path, include
from .views import *
from . import views
from .views.public_content import (
    PublicNewsViewSet,
    PublicVideoViewSet,
    PublicAboutViewSet,
    PublicEventViewSet,
    PublicClubViewSet,
    PublicStaffViewSet,
    PublicRefereeViewSet,
    PublicDocumentViewSet,
    PublicGalleryViewSet,
)
from rest_framework.routers import DefaultRouter

router = DefaultRouter()

router.register(r'cities', CityViewSet, basename='city')
router.register('clubs', ClubViewSet, basename='club')
router.register('competitions', CompetitionViewSet, basename='competition')
router.register('events', CompetitionViewSet, basename='event')
router.register('athletes', AthleteViewSet, basename='athlete')
# 'athlete-profiles' was consolidated into 'athletes' (profile actions moved to AthleteViewSet)
router.register('supporter-athlete-relations', SupporterAthleteRelationViewSet, basename='supporter-athlete-relation')
router.register('titles', TitleViewSet, basename='title')
router.register('federation-roles', FederationRoleViewSet, basename='federation-role')
router.register('grades', GradeViewSet, basename='grade')
router.register('teams', TeamViewSet, basename='team')
router.register('team-members', TeamMemberViewSet, basename='team-member')
router.register('matches', MatchViewSet, basename='match')
router.register('annual-visas', AnnualVisaViewSet, basename='annual-visa')
router.register('categories', CategoryViewSet, basename='category')
router.register('diploma-templates', DiplomaTemplateViewSet, basename='diploma-template')
router.register('category-athletes', CategoryAthleteViewSet, basename='category-athlete')
router.register('fight-group-enrollments', FightGroupEnrollmentViewSet, basename='fight-group-enrollment')
router.register('fight-athlete-weights', FightAthleteWeightViewSet, basename='fight-athlete-weight')
router.register('category-teams', CategoryTeamViewSet, basename='category-team')
router.register('grade-histories', GradeHistoryViewSet, basename='grade-history')
router.register('medical-visas', MedicalVisaViewSet, basename='medical-visa')
# Training seminars removed - use Events API instead
router.register('groups', GroupViewSet, basename='group')
router.register('category-athlete-score', CategoryAthleteScoreViewSet, basename='category-athlete-score')
router.register('category-referee-score', CategoryRefereeScoreViewSet, basename='category-referee-score')
router.register('category-referee-score-events', CategoryRefereeScoreEventViewSet, basename='category-referee-score-event')
router.register('notifications', NotificationViewSet, basename='notification')
router.register('notification-settings', NotificationSettingsViewSet, basename='notification-settings')
router.register('grade-submissions', GradeHistorySubmissionViewSet, basename='grade-submission')
router.register('seminar-submissions', TrainingSeminarParticipationViewSet, basename='seminar-submission')
router.register('event-participations', TrainingSeminarParticipationViewSet, basename='event-participation')
router.register('visa-submissions', VisaSubmissionViewSet, basename='visa-submission')

# Import the new event enrollment viewset
from .views import EventEnrollmentViewSet
router.register('event-enrollments', EventEnrollmentViewSet, basename='event-enrollment')
router.register('coaches', CoachesViewSet, basename='coach')
# Offline competition sync endpoints
router.register('offline', OfflineSyncViewSet, basename='offline')
router.register('local-backups', LocalBackupViewSet, basename='local-backup')
# PWA competition management endpoints
router.register('competition-fields', CompetitionFieldViewSet, basename='competition-field')
router.register('field-breaks', FieldBreakViewSet, basename='field-break')
router.register('category-field-assignments', CategoryFieldAssignmentViewSet, basename='category-field-assignment')
router.register('match-field-assignments', MatchFieldAssignmentViewSet, basename='match-field-assignment')
router.register('category-referee-assignments', CategoryRefereeAssignmentViewSet, basename='category-referee-assignment')
router.register('match-referee-assignments', MatchRefereeAssignmentViewSet, basename='match-referee-assignment')
router.register('competition-referees', CompetitionRefereeViewSet, basename='competition-referee')
router.register('referee-presence', RefereePresenceViewSet, basename='referee-presence')
router.register('monitor-sessions', DisplayMonitorSessionViewSet, basename='monitor-session')
router.register('field-recording-sessions', FieldRecordingSessionViewSet, basename='field-recording-session')
router.register('match-rounds', MatchRoundViewSet, basename='match-round')
router.register('match-referee-scores', MatchRefereeScoreViewSet, basename='match-referee-score')
router.register('match-events', MatchEventViewSet, basename='match-event')
router.register('qr-codes', QRCodeAssignmentViewSet, basename='qr-code')
# team-scores endpoint deprecated - use category-athlete-score with type='teams' filter

# Sync and Excel endpoints
from .sync_api import SyncAPIViewSet
from .excel_views import ExcelSyncViewSet
router.register('sync', SyncAPIViewSet, basename='sync')
router.register('excel', ExcelSyncViewSet, basename='excel')

# Compatibility shim: keep responding to old athlete-profiles paths with a deprecation/redirect
from . import views as _views
from .autocomplete import (
    AthleteAutocomplete, ClubAutocomplete, CategoryAutocomplete,
    GradeAutocomplete, FederationRoleAutocomplete, TitleAutocomplete,
    CityAutocomplete, TeamAutocomplete, EventAutocomplete, MatchAutocomplete
)
autocomplete_urlpatterns = [
    path('athlete-profiles/', _views.athlete_profiles_compat, name='athlete-profiles-compat-root'),
    path('athlete-profiles/<path:subpath>/', _views.athlete_profiles_compat, name='athlete-profiles-compat'),
    
    # Autocomplete endpoints for django-autocomplete-light
    path('autocomplete/athletes/', AthleteAutocomplete.as_view(), name='athlete-autocomplete'),
    path('autocomplete/clubs/', ClubAutocomplete.as_view(), name='club-autocomplete'),
    path('autocomplete/categories/', CategoryAutocomplete.as_view(), name='category-autocomplete'),
    path('autocomplete/grades/', GradeAutocomplete.as_view(), name='grade-autocomplete'),
    path('autocomplete/federation-roles/', FederationRoleAutocomplete.as_view(), name='federation-role-autocomplete'),
    path('autocomplete/titles/', TitleAutocomplete.as_view(), name='title-autocomplete'),
    path('autocomplete/cities/', CityAutocomplete.as_view(), name='city-autocomplete'),
    path('autocomplete/teams/', TeamAutocomplete.as_view(), name='team-autocomplete'),
    path('autocomplete/events/', EventAutocomplete.as_view(), name='event-autocomplete'),
    path('autocomplete/matches/', MatchAutocomplete.as_view(), name='match-autocomplete'),
]

# then append the rest of the urlpatterns below

urlpatterns = autocomplete_urlpatterns + [
    # CSRF token endpoint
    path('auth/csrf/', views.get_csrf_token, name='csrf-token'),

    # @mention autocomplete search (CKEditor5) - athletes and clubs
    path('mentions/', views.mention_search, name='mention-search'),

    # Category referee lookup for admin
    path('category-athlete-score/<int:pk>/referees/', views.get_category_referees, name='category-referees'),
    
    # Authentication URLs (existing)
    path('auth/register/', RegisterView.as_view(), name='register'),
    path('auth/login/', LoginView.as_view(), name='login'),
    path('auth/logout/', LogoutView.as_view(), name='logout'),
    path('auth/password-reset/', PasswordResetRequestView.as_view(), name='password-reset-request'),
    path('auth/password-reset-confirm/', PasswordResetConfirmView.as_view(), name='password-reset-confirm'),
    path('auth/profile/', UserProfileView.as_view(), name='profile'),
    path('auth/me/', UserProfileView.as_view(), name='me'),  # Alias for /profile/
    path('auth/change-password/', ChangePasswordView.as_view(), name='change-password'),
    path('auth/session-check/', SessionCheckView.as_view(), name='session-check'),
    path('auth/session-login/', SessionLoginView.as_view(), name='session-login'),
    path('auth/session-logout/', SessionLogoutView.as_view(), name='session-logout'),
    path('referees/me/assigned-categories/', views.RefereeAssignedCategoriesView.as_view(), name='referee-assigned-categories'),
    path('referees/me/assigned-matches/', views.RefereeAssignedMatchesView.as_view(), name='referee-assigned-matches'),
    
    # New athlete workflow URLs (must come before router.urls for specific endpoints)
    path('auth/register-enhanced/', UserRegistrationView.as_view(), name='register-enhanced'),
    path('auth/profile-enhanced/', views.UserProfileView.as_view(), name='profile-enhanced'),
    path('onboarding/role/', views.OnboardingRoleView.as_view(), name='onboarding-role'),
    # legacy route removed: use /api/athletes/my-profile/ (provided by AthleteViewSet.my_profile)
    path('admin-approvals/list/', ApprovalsListView.as_view(), name='approvals-list'),
    
    # Reference data endpoints (non-conflicting with router)
    path('sports/', views.sports_list, name='sports-list'),
    path('system-info/', views.system_info, name='system-info'),
    
    # Bracket generation endpoints
    path('categories/<int:category_id>/generate-brackets/', views.generate_brackets, name='generate-brackets'),
    path('categories/<int:category_id>/add-bronze-match/', views.add_bronze_match, name='add-bronze-match'),
    path('categories/<int:category_id>/remove-bronze-match/', views.remove_bronze_match, name='remove-bronze-match'),
    path('events/<int:event_id>/auto-schedule-fields/', views.auto_schedule_fields, name='auto-schedule-fields'),
    path('events/<int:event_id>/auto-assign-referees/', views.auto_assign_referees, name='auto-assign-referees'),
    path('matches/<int:match_id>/advance-winner/', views.advance_match_winner, name='advance-match-winner'),

    # Referee QR login - scan-to-authenticate for referee-scoring
    path('events/<int:event_id>/referees/<int:athlete_id>/qr-login/', views.referee_qr_login_info, name='referee-qr-login-info'),
    path('events/<int:event_id>/referees/<int:athlete_id>/qr-login/reset/', views.referee_qr_login_reset, name='referee-qr-login-reset'),
    path('referee-qr-login/', views.referee_qr_login_exchange, name='referee-qr-login-exchange'),

    # AI chat assistant (admin/coach only - see api/assistant.py)
    path('assistant/chat/', AssistantChatView.as_view(), name='assistant-chat'),
    path('assistant/confirm/', AssistantConfirmView.as_view(), name='assistant-confirm'),
    path('assistant/conversations/', AssistantConversationsListView.as_view(), name='assistant-conversations'),
    path('assistant/conversations/<int:pk>/', AssistantConversationView.as_view(), name='assistant-conversation-detail'),
    path('assistant/report/', AssistantReportView.as_view(), name='assistant-report'),
    
    # -------------------------------------------------------------------
    # Public, unauthenticated content endpoints for the new public-facing
    # site (apps/public-site), replacing the WordPress vovinam.ro site.
    # These are intentionally NOT behind authentication and only ever
    # expose already-published content (see api/views/public_content.py).
    # -------------------------------------------------------------------
    path('public/news/', PublicNewsViewSet.as_view({'get': 'list'}), name='public-news-list'),
    path('public/news/<slug:pk>/', PublicNewsViewSet.as_view({'get': 'retrieve'}), name='public-news-detail'),
    path('public/news/<slug:pk>/react/', PublicNewsViewSet.as_view({'post': 'react'}), name='public-news-react'),
    path(
        'public/news/<slug:pk>/comments/',
        PublicNewsViewSet.as_view({'get': 'comments', 'post': 'comments'}),
        name='public-news-comments',
    ),
    path('public/videos/', PublicVideoViewSet.as_view({'get': 'list'}), name='public-video-list'),
    path('public/about/', PublicAboutViewSet.as_view({'get': 'list'}), name='public-about-list'),
    path('public/events/upcoming/', PublicEventViewSet.as_view({'get': 'upcoming'}), name='public-events-upcoming'),
    path('public/events/', PublicEventViewSet.as_view({'get': 'list'}), name='public-events-list'),
    path('public/events/<slug:pk>/', PublicEventViewSet.as_view({'get': 'retrieve'}), name='public-events-detail'),

    # Federation directory pages, backing the 'Federație' and 'Competiție'
    # dropdown nav items (full menu parity with the live vovinam.ro site).
    path('public/clubs/', PublicClubViewSet.as_view({'get': 'list'}), name='public-clubs-list'),
    path('public/clubs/<slug:pk>/', PublicClubViewSet.as_view({'get': 'retrieve'}), name='public-clubs-detail'),
    path('public/staff/', PublicStaffViewSet.as_view({'get': 'list'}), name='public-staff-list'),
    path('public/referees/', PublicRefereeViewSet.as_view({'get': 'list'}), name='public-referees-list'),
    path('public/documents/', PublicDocumentViewSet.as_view({'get': 'list'}), name='public-documents-list'),

    # Tagged photo gallery ('Poze' tab on club/athlete profiles + lightbox).
    path('public/gallery/', PublicGalleryViewSet.as_view({'get': 'list'}), name='public-gallery-list'),
    path('public/gallery/<int:pk>/', PublicGalleryViewSet.as_view({'get': 'retrieve'}), name='public-gallery-detail'),
    path('public/gallery/<int:pk>/react/', PublicGalleryViewSet.as_view({'post': 'react'}), name='public-gallery-react'),
    path(
        'public/gallery/<int:pk>/comments/',
        PublicGalleryViewSet.as_view({'get': 'comments', 'post': 'comments'}),
        name='public-gallery-comments',
    ),

    # Router URLs (should come last to avoid conflicts)
    path('', include(router.urls)),  # This will handle the actual endpoints including athletes CRUD
    
    # Simple public athlete detail endpoint (placed after router to not conflict with update/delete)
    # This is a read-only endpoint for public pages - the router handles CRUD
    path('athletes/<int:pk>/public/', views.athlete_detail, name='athlete-detail-public'),
]
