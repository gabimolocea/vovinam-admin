from django.shortcuts import render
from django.utils import timezone
from django.db import models
from rest_framework.decorators import api_view, action, permission_classes
from rest_framework import viewsets, permissions, status
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from rest_framework.exceptions import ValidationError
from .serializers import *
from .models import *
from .permissions import IsAdminOrReadOnly, IsAdmin, IsOwnerOrAdmin, IsClubCoachOrAdmin, IsAthleteOwnerCoachOrAdmin
from rest_framework.response import Response
from rest_framework.reverse import reverse
from django.conf import settings
from django.db import IntegrityError
# Create your views here.


@api_view(['GET'])
@permission_classes([AllowAny])
def athlete_detail(request, pk):
    """Public-facing athlete detail endpoint used by the frontend.

    This complements the ViewSet detail route which may not always be available
    during dynamic registrations in development. Returning this as a plain
    function-based view ensures a stable URL for public athlete pages.
    """
    try:
        athlete = Athlete.objects.get(pk=pk)
    except Athlete.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    serializer = AthleteSerializer(athlete, context={'request': request})
    return Response(serializer.data)


@api_view(["GET"])
def health(request):
    """Simple health endpoint used by CI readiness checks."""
    # Check database connectivity
    db_status = "ok"
    db_error = None
    try:
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception as e:
        db_status = "failed"
        db_error = str(e)


@api_view(["GET"])
def get_csrf_token(request):
    """
    Returns a CSRF token for the frontend to use.
    This endpoint ensures the csrftoken cookie is set.
    """
    from django.middleware.csrf import get_token
    return Response({'csrfToken': get_token(request)})

@api_view(['GET'])
def get_category_referees(request, pk):
    """
    Get the list of assigned referees for a category (via CategoryAthleteScore).
    Used by admin to filter referee dropdown.
    """
    try:
        athlete_score = CategoryAthleteScore.objects.select_related(
            'category__referee_assignment'
        ).get(pk=pk)
        
        if not athlete_score.category:
            return Response({'referees': []})
        
        try:
            assignment = athlete_score.category.referee_assignment
            referees = []
            for i in range(1, 6):
                ref = getattr(assignment, f'referee_{i}', None)
                if ref:
                    referees.append({
                        'id': ref.id,
                        'name': f"{ref.first_name} {ref.last_name}",
                        'position': f'R{i}'
                    })
            return Response({'referees': referees})
        except:
            return Response({'referees': []})
    except CategoryAthleteScore.DoesNotExist:
        return Response({'referees': []}, status=404)

    payload = {"status": "ok", "database": db_status}
    if db_error:
        # Include detailed error only when DEBUG is True; otherwise mask it
        if getattr(settings, 'DEBUG', False):
            payload["database_error"] = db_error[:200]
        else:
            payload["database_error"] = "unavailable"
    return Response(payload)

class CityViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    queryset = City.objects.all()
    serializer_class = CitySerializer

    def list(self, request):
        queryset = City.objects.all()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk=None):
        """Return a single athlete by PK."""
        try:
            instance = self.queryset.get(pk=pk)
        except Athlete.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        serializer = self.serializer_class(instance)
        return Response(serializer.data)
    
class CompetitionViewSet(viewsets.ViewSet):
    """
    Compatibility viewset: expose Events marked as competition under the legacy /competitions/ endpoint.
    This returns a list of competitions with nested categories like the old Competition model used to provide.
    """
    permission_classes = [IsAdminOrReadOnly]

    def list(self, request):
        from landing.models import Event
        events = Event.objects.filter(event_type='competition')
        data = []
        for ev in events:
            cats = []
            for cat in Category.objects.filter(event=ev):
                cats.append({'id': cat.id, 'name': cat.name, 'type': cat.type, 'gender': cat.gender})
            data.append({
                'id': ev.id,
                'name': ev.title,
                'place': ev.address,
                'start_date': ev.start_date,
                'end_date': ev.end_date,
                'categories': cats
            })
        return Response(data)

    def retrieve(self, request, pk=None):
        from landing.models import Event
        try:
            ev = Event.objects.get(pk=pk, event_type='competition')
        except Event.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        cats = []
        for cat in Category.objects.filter(event=ev):
            cats.append({'id': cat.id, 'name': cat.name, 'type': cat.type, 'gender': cat.gender})
        data = {
            'id': ev.id,
            'name': ev.title,
            'place': ev.address,
            'start_date': ev.start_date,
            'end_date': ev.end_date,
            'categories': cats
        }
        return Response(data)
    

class ClubViewSet(viewsets.ViewSet):
    permission_classes = [IsClubCoachOrAdmin]
    queryset = Club.objects.all()
    serializer_class = ClubSerializer

    def list(self, request):
        queryset = Club.objects.all()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        queryset = self.queryset.get(pk=pk)
        serializer = self.serializer_class(queryset)
        return Response(serializer.data)

    def update(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        serializer = self.serializer_class(instance, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def destroy(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        instance.delete()
        return Response(status=204)

    @action(detail=True, methods=['get', 'post'], permission_classes=[IsAdminOrReadOnly])
    def point_events(self, request, pk=None):
        """List or create referee point events for a match (async mode).

        GET returns the audit trail. POST creates a RefereePointEvent (processed=false)
        which can later be consumed by the aggregation command.
        """
        from .serializers import RefereePointEventSerializer
        try:
            match = Match.objects.get(pk=pk)
        except Match.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        if request.method == 'GET':
            events = match.point_events.all().order_by('timestamp')
            serializer = RefereePointEventSerializer(events, many=True)
            return Response(serializer.data)

        # POST: create event
        data = request.data.copy()
        data['match'] = pk
        serializer = RefereePointEventSerializer(data=data, context={'request': request})
        if serializer.is_valid():
            ev = serializer.save(created_by=(request.user if getattr(request, 'user', None) and request.user.is_authenticated else None))
            return Response(RefereePointEventSerializer(ev).data, status=201)
        return Response(serializer.errors, status=400)

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

    def list(self, request):
        # Support optional filtering by coach status and simple search
        is_coach = request.query_params.get('is_coach')
        queryset = Athlete.objects.all()
        if is_coach is not None:
            if str(is_coach).lower() in ('1', 'true', 'yes'):
                queryset = queryset.filter(is_coach=True)
            else:
                queryset = queryset.filter(is_coach=False)

        q = request.query_params.get('q')
        if q:
            queryset = queryset.filter(models.Q(first_name__icontains=q) | models.Q(last_name__icontains=q))

        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk=None):
        athlete = self.get_object()
        serializer = self.serializer_class(athlete)
        return Response(serializer.data)

    def create(self, request):
        """Create athlete profile for the current user (uses profile serializer semantics)."""
        if not request.user or not request.user.is_authenticated:
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

        # Prevent creating more than one profile per user
        if hasattr(request.user, 'athlete') and request.user.athlete:
            return Response({'error': 'You already have an athlete profile.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = AthleteProfileSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            athlete = serializer.save(user=request.user, status='pending')
            AthleteActivity.objects.create(athlete=athlete, action='submitted', performed_by=request.user)
            return Response(AthleteProfileSerializer(athlete).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def update(self, request, pk=None):
        # Allow partial updates via AthleteProfileSerializer when editing own profile
        athlete = self.get_object()
        # Only allow owner or admin to update
        if athlete.user != request.user and not (request.user and request.user.is_admin):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        serializer = AthleteProfileSerializer(athlete, data=request.data, partial=True, context={'request': request})
        if serializer.is_valid():
            updated = serializer.save()
            return Response(AthleteProfileSerializer(updated).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def approve(self, request, pk=None):
        athlete = self.get_object()
        if athlete.status != 'pending':
            return Response({'error': 'Athlete profile is not pending approval'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            athlete.approve(request.user)
            return Response({'message': 'Athlete profile approved successfully', 'athlete_id': athlete.id})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def process_application(self, request, pk=None):
        athlete = self.get_object()
        serializer = AthleteProfileApprovalSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        action = serializer.validated_data['action']
        notes = serializer.validated_data.get('notes', '')
        if athlete.status != 'pending':
            return Response({'error': 'Athlete profile is not pending approval'}, status=status.HTTP_400_BAD_REQUEST)
        try:
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

    @action(detail=True, methods=['get'])
    def activity_log(self, request, pk=None):
        athlete = self.get_object()
        activities = athlete.activity_log.all()
        serializer = AthleteActivitySerializer(activities, many=True)
        return Response(serializer.data)

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
                AthleteActivity.objects.create(athlete=athlete, action='submitted', performed_by=user)
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
                else:
                    AthleteActivity.objects.create(athlete=updated, action='updated', performed_by=user)
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

    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        queryset = self.queryset.get(pk=pk)
        serializer = self.serializer_class(queryset)
        return Response(serializer.data)

    def update(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        serializer = self.serializer_class(instance, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def destroy(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        instance.delete()
        return Response(status=204)
    
class TitleViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    queryset = Title.objects.all()
    serializer_class = TitleSerializer

    def list(self, request):
        queryset = Title.objects.all()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        queryset = self.queryset.get(pk=pk)
        serializer = self.serializer_class(queryset)
        return Response(serializer.data)

    def update(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        serializer = self.serializer_class(instance, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def destroy(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        instance.delete()
        return Response(status=204)
    

class FederationRoleViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    queryset = FederationRole.objects.all()
    serializer_class = FederationRoleSerializer
    def list(self, request):
        queryset = FederationRole.objects.all()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)
    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)
    def retrieve(self, request, pk=None):
        queryset = self.queryset.get(pk=pk)
        serializer = self.serializer_class(queryset)
        return Response(serializer.data)
    def update(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        serializer = self.serializer_class(instance, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)
    def destroy(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        instance.delete()
        return Response(status=204)
class GradeViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    queryset = Grade.objects.all()
    serializer_class = GradeSerializer
    def list(self, request):
        queryset = Grade.objects.all()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)
    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)
    def retrieve(self, request, pk=None):
        queryset = self.queryset.get(pk=pk)
        serializer = self.serializer_class(queryset)
        return Response(serializer.data)
    def update(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        serializer = self.serializer_class(instance, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)
    def destroy(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        instance.delete()
        return Response(status=204)
class GradeHistoryViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    serializer_class = GradeHistorySerializer

    def get_queryset(self):
        return GradeHistory.objects.all()

    def list(self, request):
        queryset = self.get_queryset()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        serializer = self.serializer_class(instance)
        return Response(serializer.data)

    def update(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        serializer = self.serializer_class(instance, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def destroy(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        instance.delete()
        return Response(status=204)
    
class TeamViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    queryset = Team.objects.all()
    serializer_class = TeamSerializer

    def list(self, request):
        queryset = Team.objects.all()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        queryset = self.queryset.get(pk=pk)
        serializer = self.serializer_class(queryset)
        return Response(serializer.data)

    def update(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        serializer = self.serializer_class(instance, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def destroy(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        instance.delete()
        return Response(status=204)
    

class MatchViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    queryset = Match.objects.all()
    serializer_class = MatchSerializer

    def list(self, request):
        queryset = Match.objects.all()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        queryset = self.queryset.get(pk=pk)
        serializer = self.serializer_class(queryset)
        return Response(serializer.data)

    def update(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        serializer = self.serializer_class(instance, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def destroy(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        instance.delete()
        return Response(status=204)
    
class AnnualVisaViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    # Use the unified Visa model under the hood (filter by type) so the
    # endpoint continues to work while we migrate data into Visa.
    serializer_class = None  # set in __init__ below

    def get_queryset(self):
        from .models import Visa
        return Visa.objects.filter(visa_type='annual')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Dynamically set serializer to VisaSerializer to avoid circular imports on startup
        try:
            from .serializers import VisaSerializer
            self.serializer_class = VisaSerializer
        except Exception:
            self.serializer_class = AnnualVisaSerializer

    def list(self, request):
        queryset = self.get_queryset()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        serializer = self.serializer_class(instance)
        return Response(serializer.data)

    def update(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        serializer = self.serializer_class(instance, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def destroy(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        instance.delete()
        return Response(status=204)


class CategoryViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    queryset = Category.objects.prefetch_related('enrolled_athletes__athlete').all()  # Prefetch athletes for optimization
    serializer_class = CategorySerializer

    def get_queryset(self):
        return Category.objects.all()

    def list(self, request):
        queryset = self.get_queryset()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        serializer = self.serializer_class(instance)
        return Response(serializer.data)


class CategoryAthleteViewSet(viewsets.ViewSet):
    """
    ViewSet for CategoryAthlete - basic enrollment without scores.
    """
    permission_classes = [IsAdminOrReadOnly]
    serializer_class = CategoryAthleteSerializer

    def get_queryset(self):
        queryset = CategoryAthlete.objects.select_related('athlete', 'category').all()
        
        # Filter by category if provided
        category_id = self.request.query_params.get('category', None)
        if category_id is not None:
            queryset = queryset.filter(category_id=category_id)
        
        return queryset

    def list(self, request):
        queryset = self.get_queryset()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        serializer = self.serializer_class(instance)
        return Response(serializer.data)


# FrontendTheme API removed — this viewset was intentionally deleted to disable theme management via the API.


class GradeHistoryViewSet(viewsets.ViewSet):
    permission_classes = [IsAthleteOwnerCoachOrAdmin]
    serializer_class = GradeHistorySerializer

    def get_queryset(self):
        return GradeHistory.objects.all()

    def list(self, request):
        queryset = self.get_queryset()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        serializer = self.serializer_class(instance)
        return Response(serializer.data)

    def update(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        serializer = self.serializer_class(instance, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def destroy(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        instance.delete()
        return Response(status=204)


class MedicalVisaViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    # Proxy to the unified Visa model using visa_type='medical'
    serializer_class = None

    def get_queryset(self):
        from .models import Visa
        return Visa.objects.filter(visa_type='medical')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        try:
            from .serializers import VisaSerializer
            self.serializer_class = VisaSerializer
        except Exception:
            self.serializer_class = MedicalVisaSerializer

    def list(self, request):
        queryset = self.get_queryset()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        serializer = self.serializer_class(instance)
        return Response(serializer.data)

    def update(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        serializer = self.serializer_class(instance, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def destroy(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        instance.delete()
        return Response(status=204)


# TrainingSeminarViewSet removed - use Events API instead

class GroupViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    queryset = Group.objects.all()
    serializer_class = GroupSerializer

    def list(self, request):
        queryset = self.queryset
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        serializer = self.serializer_class(instance)
        return Response(serializer.data)

    def update(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        serializer = self.serializer_class(instance, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def destroy(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        instance.delete()
        return Response(status=204)

@api_view(['GET'])
def api_root(request, format=None):
    """
    API Root - Lists all available endpoints
    """
    return Response({
        # Main API endpoints
        'city': reverse('city-list', request=request, format=format),
        'club': reverse('club-list', request=request, format=format),
        'competition': reverse('competition-list', request=request, format=format),
        'athlete': reverse('athlete-list', request=request, format=format),
        'title': reverse('title-list', request=request, format=format),
        'federation-role': reverse('federation-role-list', request=request, format=format),
        'grade': reverse('grade-list', request=request, format=format),
        'team': reverse('team-list', request=request, format=format),
        'match': reverse('match-list', request=request, format=format),
        'category': reverse('category-list', request=request, format=format),
        'grade-history': reverse('grade-history-list', request=request, format=format),
        'medical-visa': reverse('medical-visa-list', request=request, format=format),
        'training-seminar': reverse('training-seminar-list', request=request, format=format),
        'group': reverse('group-list', request=request, format=format),
        
        # Additional APIs
        '_other_apis': {
            'description': 'Other available API endpoints',
            'landing_api': {
                'url': request.build_absolute_uri('/landing/'),
                'description': 'Landing page content management API (news, events, about, contact)'
            },
            'admin': {
                'url': request.build_absolute_uri('/admin/'),
                'description': 'Django admin interface'
            }
        }
    })


# Authentication Views
from rest_framework import status
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import IsAuthenticated, AllowAny


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


class UserProfileView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)
    
    def put(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        try:
            refresh_token = request.data["refresh"]
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({"message": "Successfully logged out"}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": "Invalid token"}, status=status.HTTP_400_BAD_REQUEST)


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
        logout(request)
        return Response({'message': 'Session logged out successfully'})


# =====================================
# ATHLETE WORKFLOW VIEWS
# =====================================


class SupporterAthleteRelationViewSet(viewsets.ModelViewSet):
    """ViewSet for managing supporter-athlete relationships"""
    serializer_class = SupporterAthleteRelationSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        if user.is_supporter:
            return SupporterAthleteRelation.objects.filter(supporter=user)
        elif user.is_admin:
            return SupporterAthleteRelation.objects.all()
        else:
            return SupporterAthleteRelation.objects.none()
    
    def perform_create(self, serializer):
        """Create relationship for current supporter"""
        if not self.request.user.is_supporter:
            raise ValidationError("Only supporters can create athlete relationships.")
        
        serializer.save(supporter=self.request.user)


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
            athlete = Athlete.objects.get(id=profile_id)
            
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
    
    def post(self, request):
        """Create athlete profile for current user"""
        # Debug: Print received data
        print("=== ATHLETE PROFILE CREATION DEBUG ===")
        print("Request data keys:", list(request.data.keys()))
        for key, value in request.data.items():
            print(f"  {key}: {repr(value)} (type: {type(value).__name__})")
        print("User:", request.user.username, "Role:", request.user.role)
        print("=" * 40)
        
        # Check if user already has an athlete profile
        if hasattr(request.user, 'athlete') and request.user.athlete:
            return Response(
                {'error': 'You already have an athlete profile'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = AthleteProfileSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            athlete = serializer.save()
            
            # Log the submission
            AthleteActivity.objects.create(
                athlete=athlete,
                action='submitted',
                performed_by=request.user
            )
            
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        
        # Debug: Print serializer errors to console
        print("=== ATHLETE PROFILE VALIDATION ERRORS ===")
        for field, errors in serializer.errors.items():
            print(f"  {field}: {errors}")
        print("=" * 42)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def put(self, request):
        """Update athlete profile (only if pending or revision required)"""
        try:
            athlete = Athlete.objects.get(user=request.user)
            
            if athlete.status not in ['pending', 'revision_required']:
                return Response(
                    {'error': 'Profile cannot be edited in current status'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            serializer = AthleteProfileSerializer(athlete, data=request.data, partial=True, context={'request': request})
            if serializer.is_valid():
                updated_athlete = serializer.save()
                
                # Use the resubmit method for revision_required status
                if athlete.status == 'revision_required':
                    updated_athlete.resubmit()
                else:
                    # Log the update for pending status
                    AthleteActivity.objects.create(
                        athlete=updated_athlete,
                        action='updated',
                        performed_by=request.user
                    )
                
                return Response(serializer.data)
            
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
        except Athlete.DoesNotExist:
            return Response(
                {'error': 'No athlete profile found'},
                status=status.HTTP_404_NOT_FOUND
            )


# Reference Data Endpoints for Athlete Workflow
@api_view(['GET'])
def sports_list(request):
    """Get list of available sports."""
    sports = [
        {'id': 1, 'name': 'Volleyball', 'code': 'volleyball'},
        {'id': 2, 'name': 'Beach Volleyball', 'code': 'beach_volleyball'},
        {'id': 3, 'name': 'Sitting Volleyball', 'code': 'sitting_volleyball'},
    ]
    return Response(sports)

@api_view(['GET'])
def categories_list(request):
    """Get list of available categories."""
    try:
        categories = Category.objects.all()
        serializer = CategorySerializer(categories, many=True)
        return Response(serializer.data)
    except Exception as e:
        # Return empty list if no categories exist
        return Response([])

@api_view(['GET'])
def clubs_list(request):
    """Get list of available clubs."""
    try:
        clubs = Club.objects.all()
        serializer = ClubSerializer(clubs, many=True)
        return Response(serializer.data)
    except Exception as e:
        # Return empty list if no clubs exist
        return Response([])


class CategoryRefereeScoreViewSet(viewsets.ViewSet):
    """ViewSet for referees to submit scores for athletes/teams in solo/team categories"""
    permission_classes = [IsAuthenticated]
    
    def list(self, request):
        """List referee scores - referees see their own, admins see all"""
        user = request.user
        
        if user.is_staff or (hasattr(user, 'role') and user.role == 'admin'):
            # Admins see all referee scores
            queryset = CategoryRefereeScore.objects.all()
        elif hasattr(user, 'athlete') and user.athlete.is_referee:
            # Referees see only their own scores
            queryset = CategoryRefereeScore.objects.filter(referee=user.athlete)
        else:
            # Non-referees cannot access
            return Response(
                {'error': 'Only referees and admins can access referee scores'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        queryset = queryset.select_related('athlete_score__athlete', 'athlete_score__category', 'referee')
        serializer = CategoryRefereeScoreSerializer(queryset, many=True)
        return Response(serializer.data)
    
    def create(self, request):
        """Create a new referee score"""
        user = request.user
        
        # Validate user is a referee
        if not (hasattr(user, 'athlete') and user.athlete.is_referee):
            return Response(
                {'error': 'Only referees can submit scores'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Auto-assign referee to current user's athlete
        data = request.data.copy()
        data['referee'] = user.athlete.id
        
        serializer = CategoryRefereeScoreSerializer(data=data)
        if serializer.is_valid():
            # Validate that the athlete_score is for solo/team category
            athlete_score = serializer.validated_data['athlete_score']
            if athlete_score.type not in ['solo', 'teams']:
                return Response(
                    {'error': 'Referee scoring is only applicable to solo and team categories'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if referee already scored this athlete
            existing = CategoryRefereeScore.objects.filter(
                athlete_score=athlete_score,
                referee=user.athlete
            ).first()
            
            if existing:
                return Response(
                    {'error': 'You have already scored this athlete/team'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def retrieve(self, request, pk=None):
        """Get a specific referee score"""
        try:
            score = CategoryRefereeScore.objects.select_related(
                'athlete_score__athlete', 'athlete_score__category', 'referee'
            ).get(pk=pk)
        except CategoryRefereeScore.DoesNotExist:
            return Response({'error': 'Score not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Check permissions
        user = request.user
        if not (user.is_staff or 
                (hasattr(user, 'role') and user.role == 'admin') or
                (hasattr(user, 'athlete') and user.athlete == score.referee)):
            return Response(
                {'error': 'You do not have permission to view this score'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        serializer = CategoryRefereeScoreSerializer(score)
        return Response(serializer.data)
    
    def update(self, request, pk=None):
        """Update a referee score (only by the referee who created it or admin)"""
        try:
            score = CategoryRefereeScore.objects.get(pk=pk)
        except CategoryRefereeScore.DoesNotExist:
            return Response({'error': 'Score not found'}, status=status.HTTP_404_NOT_FOUND)
        
        user = request.user
        
        # Check permissions: only the referee who created it or admin can update
        if not (user.is_staff or
                (hasattr(user, 'role') and user.role == 'admin') or
                (hasattr(user, 'athlete') and user.athlete == score.referee)):
            return Response(
                {'error': 'You can only update your own scores'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        serializer = CategoryRefereeScoreSerializer(score, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def destroy(self, request, pk=None):
        """Delete a referee score (only admin)"""
        try:
            score = CategoryRefereeScore.objects.get(pk=pk)
        except CategoryRefereeScore.DoesNotExist:
            return Response({'error': 'Score not found'}, status=status.HTTP_404_NOT_FOUND)
        
        user = request.user
        
        # Only admins can delete
        if not (user.is_staff or (hasattr(user, 'role') and user.role == 'admin')):
            return Response(
                {'error': 'Only admins can delete referee scores'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        score.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CategoryAthleteScoreViewSet(viewsets.ModelViewSet):
    """ViewSet for managing athlete category scores with approval workflow"""
    serializer_class = CategoryAthleteScoreSerializer
    permission_classes = [IsAthleteOwnerCoachOrAdmin]

    def get_queryset(self):
        """Return scores based on user role and visibility (includes individual and team results)"""
        user = self.request.user
        
        # Get base queryset based on user role
        if user.is_staff or hasattr(user, 'role') and user.role == 'admin':
            # Admins can see all scores (individual and team)
            queryset = CategoryAthleteScore.objects.all().select_related('athlete', 'category__event', 'reviewed_by').prefetch_related('team_members')
        elif hasattr(user, 'athlete'):
            athlete = user.athlete
            # Athletes can see their own scores + team scores they're part of + approved scores from others
            own_scores = CategoryAthleteScore.objects.filter(athlete=athlete)
            team_scores = CategoryAthleteScore.objects.filter(team_members=athlete)
            approved_scores = CategoryAthleteScore.objects.filter(status='approved').exclude(athlete=athlete).exclude(team_members=athlete)
            
            # Coaches can also see scores from athletes in their club
            if athlete.is_coach and athlete.club:
                club_athletes_scores = CategoryAthleteScore.objects.filter(athlete__club=athlete.club)
                queryset = (own_scores | team_scores | approved_scores | club_athletes_scores).select_related('athlete', 'category__event', 'reviewed_by').prefetch_related('team_members').distinct()
            else:
                queryset = (own_scores | team_scores | approved_scores).select_related('athlete', 'category__event', 'reviewed_by').prefetch_related('team_members').distinct()
        else:
            # Other users only see approved scores
            queryset = CategoryAthleteScore.objects.filter(status='approved').select_related('athlete', 'category__event', 'reviewed_by').prefetch_related('team_members')
        
        # Filter by category if provided in query params
        category_id = self.request.query_params.get('category', None)
        if category_id is not None:
            queryset = queryset.filter(category_id=category_id)
        
        return queryset

    def perform_create(self, serializer):
        """Ensure only athletes can create scores for themselves"""
        if not hasattr(self.request.user, 'athlete'):
            raise ValidationError("Only athletes can submit competition results")
        
        # The serializer will handle setting the athlete and logging the activity
        serializer.save()

    def update(self, request, *args, **kwargs):
        """Allow athletes to update their own scores, and coaches to update their club athletes' scores"""
        instance = self.get_object()
        
        # Check if user has permission
        if not hasattr(request.user, 'athlete'):
            return Response(
                {'error': 'Only athletes and coaches can edit results'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        user_athlete = request.user.athlete
        is_own_result = instance.athlete == user_athlete
        is_coach_of_club = (user_athlete.is_coach and 
                           user_athlete.club and 
                           instance.athlete.club == user_athlete.club and
                           user_athlete.club.coaches.filter(pk=user_athlete.pk).exists())
        
        if not (is_own_result or is_coach_of_club) or not instance.submitted_by_athlete:
            return Response(
                {'error': 'You can only edit your own submitted results or your club athletes\' results'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check status
        if instance.status not in ['pending', 'revision_required']:
            return Response(
                {'error': 'Can only edit pending or revision-required results'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Reset status to pending if it was revision_required
        if instance.status == 'revision_required':
            instance.status = 'pending'
            instance.reviewed_date = None
            instance.reviewed_by = None
            instance.admin_notes = ''
            instance.save()
            
            # Log the resubmission
            CategoryScoreActivity.objects.create(
                score=instance,
                action='resubmitted',
                performed_by=request.user,
                notes='Result updated and resubmitted for review'
            )
        
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """Only allow athletes to delete their own pending scores"""
        instance = self.get_object()
        
        # Check ownership
        if not hasattr(request.user, 'athlete') or instance.athlete != request.user.athlete or not instance.submitted_by_athlete:
            return Response(
                {'error': 'You can only delete your own submitted results'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check status
        if instance.status != 'pending':
            return Response(
                {'error': 'Can only delete pending results'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Log the deletion
        CategoryScoreActivity.objects.create(
            score=instance,
            action='deleted',
            performed_by=request.user,
            notes=f'Result for {instance.category.name} deleted by athlete'
        )
        
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def approve(self, request, pk=None):
        """Admin action to approve a score"""
        score = self.get_object()
        serializer = CategoryScoreApprovalSerializer(data=request.data)
        
        if serializer.is_valid():
            notes = serializer.validated_data.get('notes', '')
            score.approve(request.user, notes)
            
            return Response({
                'message': 'Result approved successfully',
                'status': score.status
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def reject(self, request, pk=None):
        """Admin action to reject a score"""
        score = self.get_object()
        serializer = CategoryScoreApprovalSerializer(data=request.data)
        
        if serializer.is_valid():
            notes = serializer.validated_data.get('notes', '')
            score.reject(request.user, notes)
            
            return Response({
                'message': 'Result rejected successfully',
                'status': score.status
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def request_revision(self, request, pk=None):
        """Admin action to request revision on a score"""
        score = self.get_object()
        serializer = CategoryScoreApprovalSerializer(data=request.data)
        
        if serializer.is_valid():
            notes = serializer.validated_data.get('notes', '')
            score.request_revision(request.user, notes)
            
            return Response({
                'message': 'Revision requested successfully',
                'status': score.status
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def my_results(self, request):
        """Get all results for the current athlete (submitted by them OR team results they're part of)"""
        if not hasattr(request.user, 'athlete'):
            return Response(
                {'error': 'User does not have an athlete profile'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get results submitted by this athlete OR team results where they are a member
        scores = CategoryAthleteScore.objects.filter(
            models.Q(athlete=request.user.athlete, submitted_by_athlete=True) |  # Individual results they submitted
            models.Q(team_members=request.user.athlete, type='teams')     # Team results they're part of
        ).select_related('category__competition', 'reviewed_by', 'athlete').prefetch_related('team_members').distinct()
        
        serializer = self.get_serializer(scores, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], permission_classes=[permissions.AllowAny])
    def all_results(self, request):
        """Get ALL results for the current athlete (both official and submitted)"""
        # Check if an athlete_id parameter is provided (for viewing other athletes)
        athlete_id = request.query_params.get('athlete_id')
        
        if athlete_id:
            # Get results for specific athlete (requires authentication)
            try:
                target_athlete = Athlete.objects.get(id=athlete_id)
            except Athlete.DoesNotExist:
                return Response(
                    {'error': 'Athlete not found'}, 
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            # Get results for current user's athlete
            if not hasattr(request.user, 'athlete'):
                return Response(
                    {'error': 'User does not have an athlete profile'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            target_athlete = request.user.athlete
        
        # Get results for the target athlete with visibility rules:
        # 1. Individual results where they are the athlete 
        # 2. Team results where they are a team member
        base_query = CategoryAthleteScore.objects.filter(
            models.Q(athlete=target_athlete) |                              # All individual results (official + submitted)
            models.Q(team_members=target_athlete, type='teams')      # All team results they're part of
        ).select_related('category__competition', 'reviewed_by', 'athlete').prefetch_related('team_members').distinct()
        
        # Apply visibility rules based on authentication and status
        if athlete_id:
            # Viewing a specific athlete's profile
            if request.user.is_authenticated and hasattr(request.user, 'athlete') and request.user.athlete.id == int(athlete_id):
                # User viewing their own profile - show all results
                scores = base_query
            else:
                # User viewing someone else's profile (or unauthenticated) - only show approved results
                scores = base_query.filter(status='approved')
        else:
            # Viewing current user's own results via my-profile - requires authentication
            if not request.user.is_authenticated:
                return Response(
                    {'error': 'Authentication required when not specifying athlete_id'}, 
                    status=status.HTTP_401_UNAUTHORIZED
                )
            # User viewing their own results via my-profile - show all results
            scores = base_query
        
        serializer = self.get_serializer(scores, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], permission_classes=[IsAdmin])
    def pending_review(self, request):
        """Get all scores pending admin review (individual and team)"""
        scores = CategoryAthleteScore.objects.filter(
            status='pending', 
            submitted_by_athlete=True
        ).select_related('athlete', 'category__event').prefetch_related('team_members')
        serializer = self.get_serializer(scores, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def my_team_results(self, request):
        """Get all team results for the current athlete"""
        if not hasattr(request.user, 'athlete'):
            return Response(
                {'error': 'User does not have an athlete profile'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get team results where user is submitter or team member
        team_scores = CategoryAthleteScore.objects.filter(
            models.Q(athlete=request.user.athlete, type='teams') |
            models.Q(team_members=request.user.athlete, type='teams')
        ).select_related('category__event', 'reviewed_by').prefetch_related('team_members').distinct()
        
        serializer = self.get_serializer(team_scores, many=True)
        return Response(serializer.data)


class CategoryScoreActivityViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing category score activity logs"""
    serializer_class = CategoryScoreActivitySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """Return activity logs based on user permissions"""
        user = self.request.user
        
        if user.is_staff or hasattr(user, 'role') and user.role == 'admin':
            # Admins can see all activity
            return CategoryScoreActivity.objects.all().select_related('score__athlete', 'performed_by')
        elif hasattr(user, 'athlete'):
            # Athletes can see activity for their own scores
            return CategoryScoreActivity.objects.filter(
                score__athlete=user.athlete,
                score__submitted_by_athlete=True
            ).select_related('score', 'performed_by')
        else:
            # No access for other users
            return CategoryScoreActivity.objects.none()


# CategoryTeamAthleteScoreViewSet deprecated - team functionality consolidated into CategoryAthleteScoreViewSet
        """Ensure only athletes can create team scores"""
        if not hasattr(self.request.user, 'athlete'):
            raise ValidationError("Only athletes can submit team competition results")
        
        # The serializer will handle setting the submitted_by athlete
        serializer.save()

    def update(self, request, *args, **kwargs):
        """Only allow team submitters to update their own pending/revision_required scores"""
        instance = self.get_object()
        
        # Check ownership
        if not hasattr(request.user, 'athlete') or instance.submitted_by != request.user.athlete:
            return Response(
                {'error': 'You can only edit team results you submitted'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check status
        if instance.status not in ['pending', 'revision_required']:
            return Response(
                {'error': 'Can only edit pending or revision-required team results'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Reset status to pending if it was revision_required
        if instance.status == 'revision_required':
            instance.status = 'pending'
            instance.reviewed_date = None
            instance.reviewed_by = None
            instance.admin_notes = ''
            instance.save()
        
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """Only allow submitters to delete their own pending team scores"""
        instance = self.get_object()
        
        # Check ownership
        if not hasattr(request.user, 'athlete') or instance.submitted_by != request.user.athlete:
            return Response(
                {'error': 'You can only delete team results you submitted'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check status
        if instance.status != 'pending':
            return Response(
                {'error': 'Can only delete pending team results'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def approve(self, request, pk=None):
        """Admin action to approve a team score"""
        score = self.get_object()
        serializer = CategoryScoreApprovalSerializer(data=request.data)
        
        if serializer.is_valid():
            notes = serializer.validated_data.get('notes', '')
            score.approve()
            if notes:
                score.admin_notes = notes
                score.save()
            
            return Response({
                'message': 'Team result approved successfully',
                'status': score.status
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def reject(self, request, pk=None):
        """Admin action to reject a team score"""
        score = self.get_object()
        serializer = CategoryScoreApprovalSerializer(data=request.data)
        
        if serializer.is_valid():
            notes = serializer.validated_data.get('notes', '')
            score.reject(notes)
            
            return Response({
                'message': 'Team result rejected successfully',
                'status': score.status
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    # Team methods moved to CategoryAthleteScoreViewSet - filter by type='teams'


# Notification System Views
class NotificationViewSet(viewsets.ModelViewSet):
    """ViewSet for user notifications"""
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Return notifications for the current user"""
        return Notification.objects.filter(recipient=self.request.user)
    
    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        """Get count of unread notifications"""
        from .notification_utils import get_unread_notification_count
        count = get_unread_notification_count(request.user)
        return Response({'unread_count': count})
    
    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        """Mark a specific notification as read"""
        notification = self.get_object()
        notification.mark_as_read()
        return Response({'message': 'Notification marked as read'})
    
    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        """Mark all notifications as read for the current user"""
        from .notification_utils import mark_notifications_as_read
        updated_count = mark_notifications_as_read(request.user)
        return Response({
            'message': f'{updated_count} notifications marked as read',
            'updated_count': updated_count
        })
    
    @action(detail=False, methods=['post'])
    def mark_selected_read(self, request):
        """Mark selected notifications as read"""
        serializer = NotificationActionSerializer(data=request.data)
        if serializer.is_valid():
            notification_ids = serializer.validated_data.get('notification_ids', [])
            if notification_ids:
                from .notification_utils import mark_notifications_as_read
                updated_count = mark_notifications_as_read(request.user, notification_ids)
                return Response({
                    'message': f'{updated_count} notifications marked as read',
                    'updated_count': updated_count
                })
            else:
                return Response({'error': 'No notification IDs provided'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class NotificationSettingsViewSet(viewsets.ModelViewSet):
    """ViewSet for user notification settings"""
    serializer_class = NotificationSettingsSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Return notification settings for the current user"""
        return NotificationSettings.objects.filter(user=self.request.user)
    
    def get_object(self):
        """Get or create notification settings for the current user"""
        settings, created = NotificationSettings.objects.get_or_create(user=self.request.user)
        return settings
    
    def update(self, request, *args, **kwargs):
        """Update notification settings"""
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# Grade History Submission Views
class GradeHistorySubmissionViewSet(viewsets.ModelViewSet):
    """ViewSet for athlete grade history submissions with approval workflow"""
    serializer_class = GradeHistorySubmissionSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Return grade history for the current user if athlete, all if admin"""
        if hasattr(self.request.user, 'athlete'):
            return GradeHistory.objects.filter(athlete=self.request.user.athlete)
        elif self.request.user.role == 'admin':
            return GradeHistory.objects.all()
        return GradeHistory.objects.none()

    def create(self, request, *args, **kwargs):
        """Robust create handler: ensure any unexpected post-save failures
        do not leave the client with an unclear 500 when the record was
        actually persisted. Returns serialized object on success.
        """
        serializer = self.get_serializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        try:
            instance = serializer.save()
        except Exception as e:
            # If save raised, attempt to detect if an instance was created and
            # return a helpful error payload including the traceback so the
            # frontend can surface it during development.
            import logging, traceback
            logger = logging.getLogger(__name__)
            tb = traceback.format_exc()
            logger.error('Unhandled exception during GradeHistorySubmission create: %s\n%s', e, tb)
            # Try to return a serialized instance if serializer.instance is set
            try:
                inst = getattr(serializer, 'instance', None)
                if inst is not None:
                    out_serializer = self.get_serializer(inst)
                    return Response(out_serializer.data, status=status.HTTP_201_CREATED)
            except Exception:
                pass
            return Response({'detail': 'Failed to process submission, please contact support.', 'error': str(e), 'traceback': tb}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        out_serializer = self.get_serializer(instance)
        return Response(out_serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def approve(self, request, pk=None):
        """Admin action to approve a grade history"""
        grade_history = self.get_object()
        serializer = GradeHistoryApprovalSerializer(data=request.data)
        
        if serializer.is_valid():
            notes = serializer.validated_data.get('notes', '')
            grade_history.approve(request.user, notes)
            
            return Response({
                'message': 'Grade history approved successfully',
                'status': grade_history.status
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def reject(self, request, pk=None):
        """Admin action to reject a grade history"""
        grade_history = self.get_object()
        serializer = GradeHistoryApprovalSerializer(data=request.data)
        
        if serializer.is_valid():
            notes = serializer.validated_data.get('notes', '')
            grade_history.reject(request.user, notes)
            
            return Response({
                'message': 'Grade history rejected successfully',
                'status': grade_history.status
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def request_revision(self, request, pk=None):
        """Admin action to request revision of a grade history"""
        grade_history = self.get_object()
        serializer = GradeHistoryApprovalSerializer(data=request.data)
        
        if serializer.is_valid():
            notes = serializer.validated_data.get('notes', '')
            grade_history.request_revision(request.user, notes)
            
            return Response({
                'message': 'Revision requested successfully',
                'status': grade_history.status
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# Training Seminar Participation Views
class TrainingSeminarParticipationViewSet(viewsets.ModelViewSet):
    """ViewSet for athlete training seminar participation submissions with approval workflow"""
    serializer_class = TrainingSeminarParticipationSerializer
    # Allow coaches to manage their club athletes' seminar participations
    permission_classes = [IsAthleteOwnerCoachOrAdmin]
    
    def perform_create(self, serializer):
        """Set the athlete and submitted_by_athlete flag when creating"""
        try:
            serializer.save(
                athlete=self.request.user.athlete,
                submitted_by_athlete=True
            )
        except IntegrityError:
            # In case of a race or missed validation, return a friendly 400
            # Use 'event' key as the canonical target now that we prefer events.
            raise ValidationError({'event': 'You have already submitted participation for this event.'})
    
    def get_queryset(self):
        """Return seminar participations for the current user if athlete, all if admin"""
        # Allow filtering by athlete via query param when the requester is admin
        athlete_param = self.request.query_params.get('athlete')
        # If an athlete query param is provided and requester is admin, return that athlete's participations
        if athlete_param:
            try:
                athlete_id = int(athlete_param)
            except (TypeError, ValueError):
                return TrainingSeminarParticipation.objects.none()

            # If the requester is admin, return everything for that athlete
            if self.request.user.is_authenticated and getattr(self.request.user, 'role', None) == 'admin':
                return TrainingSeminarParticipation.objects.filter(athlete__id=athlete_id)

            # If the requester is the athlete themself, allow access to their participations
            if hasattr(self.request.user, 'athlete') and getattr(self.request.user.athlete, 'id', None) == athlete_id:
                return TrainingSeminarParticipation.objects.filter(athlete=self.request.user.athlete)

            # Public access: allow anonymous viewers to see only approved participations for the athlete
            return TrainingSeminarParticipation.objects.filter(athlete__id=athlete_id, status='approved')

        # Default behaviour: if the user has an athlete profile, return their participations.
        if hasattr(self.request.user, 'athlete'):
            return TrainingSeminarParticipation.objects.filter(athlete=self.request.user.athlete).select_related('event')
        # Admins who didn't specify an athlete get all participations
        if self.request.user.is_authenticated and getattr(self.request.user, 'role', None) == 'admin':
            return TrainingSeminarParticipation.objects.all().select_related('event', 'athlete')
        return TrainingSeminarParticipation.objects.none()
    
    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def approve(self, request, pk=None):
        """Admin action to approve a seminar participation"""
        participation = self.get_object()
        serializer = TrainingSeminarParticipationApprovalSerializer(data=request.data)
        
        if serializer.is_valid():
            notes = serializer.validated_data.get('notes', '')
            participation.approve(request.user, notes)
            
            return Response({
                'message': 'Seminar participation approved successfully',
                'status': participation.status
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def reject(self, request, pk=None):
        """Admin action to reject a seminar participation"""
        participation = self.get_object()
        serializer = TrainingSeminarParticipationApprovalSerializer(data=request.data)
        
        if serializer.is_valid():
            notes = serializer.validated_data.get('notes', '')
            participation.reject(request.user, notes)
            
            return Response({
                'message': 'Seminar participation rejected successfully',
                'status': participation.status
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def request_revision(self, request, pk=None):
        """Admin action to request revision of a seminar participation"""
        participation = self.get_object()
        serializer = TrainingSeminarParticipationApprovalSerializer(data=request.data)
        
        if serializer.is_valid():
            notes = serializer.validated_data.get('notes', '')
            participation.request_revision(request.user, notes)
            
            return Response({
                'message': 'Revision requested successfully',
                'status': participation.status
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
