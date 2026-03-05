from django.shortcuts import render
from django.utils import timezone
from django.db import models
from django.db.models import Q
from rest_framework.decorators import api_view, action, permission_classes
from rest_framework import viewsets, permissions, status
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.exceptions import ValidationError
from .serializers import *
from .models import *
from .permissions import IsAdminOrReadOnly, IsAdmin, IsOwnerOrAdmin, IsClubCoachOrAdmin, IsAthleteOwnerCoachOrAdmin
from rest_framework.response import Response
from rest_framework.reverse import reverse
from django.conf import settings
import logging

# Ensure logger output appears in the console for debugging
logging.basicConfig(level=logging.WARNING, format='%(asctime)s %(levelname)s %(name)s %(message)s')
from django.db import IntegrityError
# Create your views here.


class RefereeAssignedCategoriesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            athlete = request.user.athlete
        except Exception:
            return Response([], status=status.HTTP_200_OK)

        assignments = CategoryRefereeAssignment.objects.filter(
            Q(referee_1=athlete) |
            Q(referee_2=athlete) |
            Q(referee_3=athlete) |
            Q(referee_4=athlete) |
            Q(referee_5=athlete)
        ).select_related('category')

        data = []
        for assignment in assignments:
            cat = assignment.category
            field_assignment = getattr(cat, 'field_assignment', None)
            field = field_assignment.field if field_assignment else None
            data.append({
                'id': cat.id,
                'name': cat.name,
                'type': cat.type,
                'gender': cat.gender,
                'field_status': field_assignment.status if field_assignment else None,
                'field_id': field.id if field else None,
                'field_name': field.name if field else None,
                'field_number': field.field_number if field else None,
            })

        return Response(data)


class RefereeAssignedMatchesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            athlete = request.user.athlete
        except Exception:
            return Response([], status=status.HTTP_200_OK)

        match_ids = MatchRefereeAssignment.objects.filter(
            Q(referee_1=athlete) |
            Q(referee_2=athlete) |
            Q(referee_3=athlete) |
            Q(referee_4=athlete) |
            Q(referee_5=athlete)
        ).values_list('match_id', flat=True)

        matches = Match.objects.filter(pk__in=match_ids).select_related('category')
        serializer = MatchSerializer(matches, many=True)
        return Response(serializer.data)


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

    payload = {"status": "ok", "database": db_status}
    if db_error:
        if getattr(settings, 'DEBUG', False):
            payload["database_error"] = db_error[:200]
        else:
            payload["database_error"] = "unavailable"
    return Response(payload)


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


class CityViewSet(viewsets.ViewSet):
    permission_classes = [permissions.AllowAny]
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
        status_filter = request.query_params.get('status')
        if status_filter:
            events = events.filter(status=status_filter)
        elif request.user.is_authenticated and request.user.role == 'referee' and not request.user.is_admin:
            events = events.filter(status='ongoing')
        # Prefetch categories + field assignments to avoid N+1 queries
        events = events.prefetch_related(
            'categories__field_assignment__field'
        )
        data = []
        for ev in events:
            cats = []
            for cat in ev.categories.all():
                assignment = getattr(cat, 'field_assignment', None)
                field = assignment.field if assignment else None
                cats.append({
                    'id': cat.id,
                    'name': cat.name,
                    'type': cat.type,
                    'gender': cat.gender,
                    'field_status': assignment.status if assignment else None,
                    'field_id': field.id if field else None,
                    'field_name': field.name if field else None,
                    'field_number': field.field_number if field else None,
                })
            data.append({
                'id': ev.id,
                'name': ev.title,
                'place': ev.address,
                'start_date': ev.start_date,
                'end_date': ev.end_date,
                'status': getattr(ev, 'status', None),
                'categories': cats
            })
        return Response(data)

    def _serialize_event(self, ev, include_categories=False):
        """Helper to serialize an Event into the competition response format."""
        data = {
            'id': ev.id,
            'name': ev.title,
            'place': ev.address,
            'start_date': ev.start_date,
            'end_date': ev.end_date,
            'status': getattr(ev, 'status', None),
            'description': ev.description,
        }
        if include_categories:
            cats = []
            for cat in Category.objects.filter(event=ev).select_related('field_assignment__field'):
                assignment = getattr(cat, 'field_assignment', None)
                field = assignment.field if assignment else None
                cats.append({
                    'id': cat.id,
                    'name': cat.name,
                    'type': cat.type,
                    'gender': cat.gender,
                    'field_status': assignment.status if assignment else None,
                    'field_id': field.id if field else None,
                    'field_name': field.name if field else None,
                    'field_number': field.field_number if field else None,
                })
            data['categories'] = cats
        return data

    def retrieve(self, request, pk=None):
        from landing.models import Event
        try:
            ev = Event.objects.get(pk=pk, event_type='competition')
            status_filter = request.query_params.get('status')
            if status_filter and ev.status != status_filter:
                return Response({'detail': 'Not found.'}, status=404)
            if request.user.is_authenticated and request.user.role == 'referee' and not request.user.is_admin:
                if ev.status != 'ongoing':
                    return Response({'detail': 'Not found.'}, status=404)
        except Event.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        return Response(self._serialize_event(ev, include_categories=True))

    def create(self, request):
        from landing.models import Event
        from django.utils.text import slugify
        d = request.data
        title = d.get('name', '').strip()
        if not title:
            return Response({'name': ['This field is required.']}, status=400)
        start_date = d.get('start_date')
        if not start_date:
            return Response({'start_date': ['This field is required.']}, status=400)
        # Build a unique slug
        base_slug = slugify(title) or 'competition'
        slug = base_slug
        counter = 1
        while Event.objects.filter(slug=slug).exists():
            slug = f'{base_slug}-{counter}'
            counter += 1
        ev = Event.objects.create(
            title=title,
            slug=slug,
            address=d.get('location', '') or d.get('place', ''),
            start_date=start_date,
            end_date=d.get('end_date') or start_date,
            description=d.get('description', ''),
            event_type='competition',
            status=d.get('status', 'upcoming'),
        )
        return Response(self._serialize_event(ev), status=201)

    def partial_update(self, request, pk=None):
        from landing.models import Event
        try:
            ev = Event.objects.get(pk=pk, event_type='competition')
        except Event.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        d = request.data
        if 'name' in d:
            ev.title = d['name']
        if 'location' in d or 'place' in d:
            ev.address = d.get('location', d.get('place', ev.address))
        if 'start_date' in d:
            ev.start_date = d['start_date']
        if 'end_date' in d:
            ev.end_date = d['end_date']
        if 'description' in d:
            ev.description = d['description']
        if 'status' in d:
            ev.status = d['status']
        ev.save()
        return Response(self._serialize_event(ev, include_categories=True))

    def destroy(self, request, pk=None):
        from landing.models import Event
        try:
            ev = Event.objects.get(pk=pk, event_type='competition')
        except Event.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        ev.delete()
        return Response(status=204)

    @action(detail=True, methods=['get'], permission_classes=[IsAdminOrReadOnly], url_path='stats')
    def stats(self, request, pk=None):
        from landing.models import Event
        try:
            ev = Event.objects.get(pk=pk, event_type='competition')
        except Event.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        categories = Category.objects.filter(event=ev)
        fields_active = CompetitionField.objects.filter(event=ev).count()

        referee_ids = set()
        for assignment in CategoryRefereeAssignment.objects.filter(category__in=categories):
            for ref in [assignment.referee_1, assignment.referee_2, assignment.referee_3, assignment.referee_4, assignment.referee_5]:
                if ref_id := getattr(ref, 'id', None):
                    referee_ids.add(ref_id)

        match_ids = Match.objects.filter(category__in=categories).values_list('id', flat=True)
        for assignment in MatchRefereeAssignment.objects.filter(match_id__in=match_ids):
            for ref in [assignment.referee_1, assignment.referee_2, assignment.referee_3, assignment.referee_4, assignment.referee_5]:
                if ref_id := getattr(ref, 'id', None):
                    referee_ids.add(ref_id)

        scores_submitted = (
            CategoryRefereeScore.objects.filter(athlete_score__category__in=categories).count()
            + MatchRefereeScore.objects.filter(match__category__in=categories).count()
        )

        pending_approval = CategoryAthleteScore.objects.filter(category__in=categories, status='pending').count()

        return Response({
            'fields_active': fields_active,
            'referees_assigned': len(referee_ids),
            'scores_submitted': scores_submitted,
            'pending_approval': pending_approval,
        })
    

class ClubViewSet(viewsets.ViewSet):
    permission_classes = [permissions.AllowAny]
    queryset = Club.objects.all()
    serializer_class = ClubSerializer

    def list(self, request):
        queryset = Club.objects.all().order_by('display_order', 'name')
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

    @action(detail=False, methods=['post'], url_path='reorder')
    def reorder(self, request):
        """Bulk reorder clubs.
        Accepts { order: [id1, id2, id3, ...] }
        Updates display_order for each club based on position in the list.
        """
        order = request.data.get('order', [])
        if not order:
            return Response({'detail': 'order list is required.'}, status=400)
        for idx, club_id in enumerate(order):
            Club.objects.filter(pk=club_id).update(display_order=idx)
        return Response({'status': 'ok'})

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


class OfflineSyncViewSet(viewsets.ViewSet):
    """Offline snapshot and results upload endpoints for competition manager."""
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=['get'], url_path='athletes')
    def athletes(self, request):
        athletes = Athlete.objects.filter(status='approved', is_deleted=False)
        serializer = OfflineAthleteSerializer(athletes, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='clubs')
    def clubs(self, request):
        clubs = Club.objects.all()
        serializer = OfflineClubSerializer(clubs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='competition-pack')
    def competition_pack(self, request):
        from landing.models import Event

        competitions = Event.objects.filter(event_type='competition')
        categories = Category.objects.filter(event__in=competitions)
        matches = Match.objects.filter(category__in=categories)

        return Response({
            'competitions': OfflineCompetitionSerializer(competitions, many=True).data,
            'categories': OfflineCategorySerializer(categories, many=True).data,
            'matches': OfflineMatchSerializer(matches, many=True).data,
        })

    @action(detail=False, methods=['post'], url_path='results')
    def results(self, request):
        results = request.data.get('results', [])
        if not isinstance(results, list):
            return Response({'detail': 'results must be a list'}, status=400)

        created = []
        failed = []

        for item in results:
            try:
                category_id = item.get('category_id') or item.get('category')
                if not category_id:
                    raise ValidationError({'category_id': 'This field is required.'})

                category = Category.objects.get(pk=category_id)
                result_type = item.get('type') or category.type
                score = item.get('score')
                placement_claimed = item.get('placement_claimed')
                notes = item.get('notes')

                payload = {
                    'category': category.id,
                    'type': result_type,
                    'score': score,
                    'placement_claimed': placement_claimed,
                    'notes': notes,
                    'submitted_by_athlete': False,
                    'status': 'pending'
                }

                if result_type == 'teams':
                    team_member_ids = item.get('team_member_ids') or item.get('team_members') or []
                    team_name = item.get('team_name')
                    payload['team_members'] = team_member_ids
                    payload['team_name'] = team_name
                    serializer = OfflineCategoryAthleteScoreSerializer(data=payload)
                    serializer.is_valid(raise_exception=True)
                    obj = serializer.save()
                else:
                    athlete_id = item.get('athlete_id') or item.get('athlete')
                    if not athlete_id:
                        raise ValidationError({'athlete_id': 'This field is required for solo/fight results.'})
                    payload['athlete'] = athlete_id
                    serializer = OfflineCategoryAthleteScoreSerializer(data=payload)
                    serializer.is_valid(raise_exception=True)
                    obj = serializer.save()

                created.append({'id': obj.id, 'category': obj.category_id})
            except Exception as exc:
                failed.append({'item': item, 'error': str(exc)})

        return Response({
            'created': created,
            'failed': failed,
        })

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
        """Use minimal serializer for list, full for detail"""
        if self.action == 'retrieve':
            return AthleteDetailSerializer
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
        
        # Apply filters
        club_id = self.request.query_params.get('club')
        if club_id:
            queryset = queryset.filter(club_id=club_id)
        
        return queryset

    def list(self, request):
        # Support optional filtering by coach status and simple search
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
            queryset = queryset.filter(models.Q(first_name__icontains=q) | models.Q(last_name__icontains=q))

        serializer = self.get_serializer_class()
        ser = serializer(queryset, many=True)
        return Response(ser.data)

    def retrieve(self, request, pk=None):
        athlete = self.get_object()
        serializer = self.get_serializer_class()
        ser = serializer(athlete)
        return Response(ser.data)

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
    permission_classes = [permissions.AllowAny]
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

class TeamViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    queryset = Team.objects.all()
    serializer_class = TeamSerializer

    def list(self, request):
        queryset = Team.objects.all()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        # Ensure name field is provided (required by database)
        data = request.data.copy()
        if not data.get('name'):
            # Generate a temporary name - will be overridden when members are added
            import uuid
            data['name'] = f"Team {str(uuid.uuid4())[:8]}"
        
        serializer = self.serializer_class(data=data)
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
    

class TeamMemberViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    queryset = TeamMember.objects.all()
    serializer_class = TeamMemberSerializer

    def list(self, request):
        queryset = self.queryset.all()
        team_id = request.query_params.get('team_id')
        if team_id:
            queryset = queryset.filter(team_id=team_id)
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        try:
            instance = self.queryset.get(pk=pk)
            serializer = self.serializer_class(instance)
            return Response(serializer.data)
        except TeamMember.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

    def destroy(self, request, pk=None):
        try:
            instance = self.queryset.get(pk=pk)
            instance.delete()
            return Response(status=204)
        except TeamMember.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)


class MatchViewSet(viewsets.ViewSet):
    permission_classes = [permissions.AllowAny]
    queryset = Match.objects.all()
    serializer_class = MatchSerializer

    def list(self, request):
        queryset = Match.objects.all()
        event_id = request.query_params.get('event_id')
        field_id = request.query_params.get('field_id')
        category_id = request.query_params.get('category_id')
        if event_id:
            queryset = queryset.filter(category__event_id=event_id)
        if field_id:
            queryset = queryset.filter(
                Q(field_assignment__field_id=field_id) | Q(field_id=field_id)
            )
        if category_id:
            queryset = queryset.filter(category_id=category_id)
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
    serializer_class = CategorySerializer

    def get_queryset(self):
        return Category.objects.all()

    def _create_category(self, data):
        """Create the right Category subclass based on category_type."""
        cat_type = data.pop('category_type', 'solo')
        model_map = {
            'solo': SoloCategory,
            'team': TeamCategory,
            'fight': FightCategory,
        }
        model_cls = model_map.get(cat_type, SoloCategory)
        return model_cls.objects.create(**data)

    def list(self, request):
        queryset = self.get_queryset()
        event_id = request.query_params.get('event')
        if event_id:
            try:
                event_id_int = int(str(event_id).split(':')[0])
            except (TypeError, ValueError):
                return Response({'detail': 'Invalid event id.'}, status=400)
            queryset = queryset.filter(event_id=event_id_int)
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        d = request.data.copy()
        name = d.get('name', '').strip()
        if not name:
            return Response({'name': ['This field is required.']}, status=400)
        create_data = {
            'name': name,
            'event_id': d.get('event'),
            'gender': d.get('gender', 'mixt'),
            'category_type': d.get('category_type', 'solo'),
        }
        group_id = d.get('group') or d.get('group_id')
        if group_id:
            create_data['group_id'] = group_id
        cat = self._create_category(create_data)
        serializer = self.serializer_class(cat)
        return Response(serializer.data, status=201)

    def retrieve(self, request, pk=None):
        try:
            instance = self.get_queryset().get(pk=pk)
        except Category.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        serializer = self.serializer_class(instance)
        return Response(serializer.data)

    def update(self, request, pk=None):
        try:
            instance = self.get_queryset().get(pk=pk)
        except Category.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        # Only allow updating safe fields (name, gender, display_order)
        allowed = {'name', 'gender', 'display_order'}
        data = {k: v for k, v in request.data.items() if k in allowed}
        for field, value in data.items():
            setattr(instance, field, value)
        instance.save(update_fields=list(data.keys()))
        serializer = self.serializer_class(instance)
        return Response(serializer.data)

    def partial_update(self, request, pk=None):
        return self.update(request, pk)

    def destroy(self, request, pk=None):
        try:
            cat = self.get_queryset().get(pk=pk)
        except Category.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        cat.delete()
        return Response(status=204)

    @action(detail=False, methods=['post'], url_path='bulk-add')
    def bulk_add(self, request):
        """Bulk add categories to an event.
        Accepts { event_id: int, categories: [{ name, category_type, gender, group_id? }] }
        Skips duplicates (same name + event + group).
        """
        event_id = request.data.get('event_id')
        items = request.data.get('categories', [])
        if not event_id or not items:
            return Response({'detail': 'event_id and categories are required.'}, status=400)
        from landing.models import Event
        try:
            Event.objects.get(pk=event_id)
        except Event.DoesNotExist:
            return Response({'detail': 'Event not found.'}, status=404)

        # Build set of (name, group_id) pairs that already exist
        existing_pairs = set(
            Category.objects.filter(event_id=event_id)
            .values_list('name', 'group_id')
        )
        created = []
        for item in items:
            name = item.get('name', '').strip()
            if not name:
                continue
            group_id = item.get('group') or item.get('group_id') or None
            if group_id:
                group_id = int(group_id)
            if (name, group_id) in existing_pairs:
                continue
            create_data = {
                'name': name,
                'event_id': event_id,
                'gender': item.get('gender', 'mixt'),
                'category_type': item.get('category_type', 'solo'),
            }
            if group_id:
                create_data['group_id'] = group_id
            cat = self._create_category(create_data)
            created.append(cat)
            existing_pairs.add((name, group_id))

        serializer = self.serializer_class(created, many=True)
        return Response(serializer.data, status=201)

    @action(detail=False, methods=['post'], url_path='reorder')
    def reorder(self, request):
        """Bulk reorder categories within a group.
        Accepts { order: [id1, id2, id3, ...] }
        Updates display_order for each category based on position in the list.
        """
        order = request.data.get('order', [])
        if not order:
            return Response({'detail': 'order list is required.'}, status=400)
        for idx, cat_id in enumerate(order):
            Category.objects.filter(pk=cat_id).update(display_order=idx)
        return Response({'status': 'ok'})


class CategoryAthleteViewSet(viewsets.ViewSet):
    """
    ViewSet for CategoryAthlete - basic enrollment without scores.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CategoryAthleteSerializer

    def get_queryset(self):
        queryset = CategoryAthlete.objects.select_related('athlete', 'category').all()
        
        # Filter by category if provided
        category_id = self.request.query_params.get('category', None)
        if category_id is not None:
            queryset = queryset.filter(category_id=category_id)

        # Filter by event if provided
        event_id = self.request.query_params.get('event', None)
        if event_id is not None:
            queryset = queryset.filter(category__event_id=event_id)
        
        return queryset

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

    def partial_update(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        serializer = self.serializer_class(instance, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def destroy(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        instance.delete()
        return Response(status=204)


class CategoryTeamViewSet(viewsets.ViewSet):
    """
    ViewSet for CategoryTeam - team enrollment in categories.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CategoryTeamSerializer

    def get_queryset(self):
        queryset = CategoryTeam.objects.select_related('team', 'category').all()
        
        # Filter by category if provided
        category_id = self.request.query_params.get('category', None)
        if category_id is not None:
            queryset = queryset.filter(category_id=category_id)

        # Filter by event if provided
        event_id = self.request.query_params.get('event', None)
        if event_id is not None:
            queryset = queryset.filter(category__event_id=event_id)
        
        # Filter by club if provided
        club_id = self.request.query_params.get('club', None)
        if club_id is not None:
            queryset = queryset.filter(team__club_id=club_id)
        
        return queryset

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

    def destroy(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        instance.delete()
        return Response(status=204)


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
        event_id = request.query_params.get('event')
        if event_id:
            queryset = queryset.filter(event_id=event_id)
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

    @action(detail=False, methods=['post'], url_path='reorder')
    def reorder(self, request):
        """Bulk reorder groups within an event.
        Accepts { order: [id1, id2, id3, ...] }
        Updates display_order for each group based on position in the list.
        """
        order = request.data.get('order', [])
        if not order:
            return Response({'detail': 'order list is required.'}, status=400)
        for idx, group_id in enumerate(order):
            Group.objects.filter(pk=group_id).update(display_order=idx)
        return Response({'status': 'ok'})

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


# Reference Data Endpoints for Athlete Workflow
@api_view(['GET'])
def sports_list(request):
    """Get list of available sports/disciplines for Vovinam Viet Vo Dao."""
    sports = [
        {'id': 1, 'name': 'Quyen (Forms)', 'code': 'quyen'},
        {'id': 2, 'name': 'Song Luyện (Combat Choreography)', 'code': 'song_luyen'},
        {'id': 3, 'name': 'Đối Kháng (Fighting)', 'code': 'doi_khang'},
        {'id': 4, 'name': 'Tự Vệ (Self Defense)', 'code': 'tu_ve'},
        {'id': 5, 'name': 'Biểu Diễn (Performance)', 'code': 'bieu_dien'},
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

        event_id = self.request.query_params.get('event_id')
        if event_id is not None:
            queryset = queryset.filter(category__event_id=event_id)
        
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
        # Allow filtering by event via query param (for coach enrollment workflow)
        event_param = self.request.query_params.get('event')
        if event_param:
            try:
                event_id = int(event_param)
            except (TypeError, ValueError):
                return TrainingSeminarParticipation.objects.none()
            
            # Return all approved participations for this event (for coach to see who's already enrolled)
            return TrainingSeminarParticipation.objects.filter(
                event__id=event_id,
                status='approved'
            ).select_related('athlete', 'event')
        
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


class EventEnrollmentViewSet(viewsets.ViewSet):
    """ViewSet for coaches to enroll their club athletes in events"""
    permission_classes = [IsAuthenticated]
    
    def create(self, request):
        """Enroll a club athlete in an event"""
        athlete_id = request.data.get('athlete')
        event_id = request.data.get('event')
        
        if not athlete_id or not event_id:
            return Response(
                {'error': 'athlete and event are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            athlete = Athlete.objects.get(id=athlete_id)
            event = Event.objects.get(id=event_id)
        except (Athlete.DoesNotExist, Event.DoesNotExist):
            return Response(
                {'error': 'Athlete or event not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Verify the requester is a coach in the athlete's club
        if not hasattr(request.user, 'athlete'):
            return Response(
                {'error': 'User is not an athlete/coach'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        coach = request.user.athlete
        if not coach.is_coach or coach.club_id != athlete.club_id:
            return Response(
                {'error': 'You can only enroll athletes from your own club'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check if already enrolled
        from landing.models import Event as LandingEvent
        existing = TrainingSeminarParticipation.objects.filter(
            athlete=athlete,
            event=event
        ).exists()
        if existing:
            return Response(
                {'error': 'Athlete is already enrolled in this event'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create the event participation
        participation = TrainingSeminarParticipation.objects.create(
            athlete=athlete,
            event=event,
            submitted_by_athlete=False,
            status='approved'  # Auto-approve coach enrollments
        )
        
        serializer = TrainingSeminarParticipationSerializer(participation)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    def destroy(self, request, pk=None):
        """Unenroll a club athlete from an event"""
        try:
            participation = TrainingSeminarParticipation.objects.get(pk=pk)
        except TrainingSeminarParticipation.DoesNotExist:
            return Response(
                {'error': 'Enrollment not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Verify the requester is a coach in the athlete's club
        if not hasattr(request.user, 'athlete'):
            return Response(
                {'error': 'User is not an athlete/coach'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        coach = request.user.athlete
        if not coach.is_coach or coach.club_id != participation.athlete.club_id:
            return Response(
                {'error': 'You can only unenroll athletes from your own club'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        athlete_id = participation.athlete_id
        participation.delete()
        
        return Response(
            {'message': 'Athlete unenrolled successfully', 'athlete_id': athlete_id},
            status=status.HTTP_200_OK
        )


# ============================================================================
# PWA COMPETITION MANAGEMENT VIEWSETS
# ============================================================================

class CompetitionFieldViewSet(viewsets.ViewSet):
    """ViewSet for managing competition fields/tatamis"""
    permission_classes = [IsAdminOrReadOnly]
    
    def list(self, request):
        """List all fields for an event"""
        event_id = request.query_params.get('event_id') or request.query_params.get('competition')
        if event_id:
            fields = CompetitionField.objects.filter(event_id=event_id).order_by('field_number')
        else:
            fields = CompetitionField.objects.all().order_by('field_number')
        
        serializer = CompetitionFieldSerializer(fields, many=True)
        return Response(serializer.data)
    
    def create(self, request):
        """Create a new competition field"""
        serializer = CompetitionFieldSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='set-count')
    def set_count(self, request):
        """Bulk set the number of fields for an event.
        Accepts { event_id: int, count: int }.
        Creates/deletes fields so the event ends up with exactly `count` tatamis.
        """
        event_id = request.data.get('event_id') or request.data.get('competition')
        count = request.data.get('count')
        if not event_id or count is None:
            return Response({'detail': 'event_id and count are required.'}, status=400)
        try:
            count = int(count)
            if count < 0 or count > 20:
                raise ValueError
        except (ValueError, TypeError):
            return Response({'detail': 'count must be an integer between 0 and 20.'}, status=400)
        from landing.models import Event
        try:
            Event.objects.get(pk=event_id, event_type='competition')
        except Event.DoesNotExist:
            return Response({'detail': 'Competition not found.'}, status=404)

        existing = list(CompetitionField.objects.filter(event_id=event_id).order_by('field_number'))
        current_count = len(existing)

        if count > current_count:
            # Add fields
            for i in range(current_count + 1, count + 1):
                CompetitionField.objects.create(
                    event_id=event_id,
                    name=f'Tatami {i}',
                    field_number=i,
                )
        elif count < current_count:
            # Remove from the end (highest field_number first)
            to_delete = existing[count:]
            CompetitionField.objects.filter(id__in=[f.id for f in to_delete]).delete()

        fields = CompetitionField.objects.filter(event_id=event_id).order_by('field_number')
        serializer = CompetitionFieldSerializer(fields, many=True)
        return Response(serializer.data)
    
    def retrieve(self, request, pk=None):
        """Retrieve a single competition field"""
        try:
            field = CompetitionField.objects.get(pk=pk)
            serializer = CompetitionFieldSerializer(field)
            return Response(serializer.data)
        except CompetitionField.DoesNotExist:
            return Response({'error': 'Field not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def update(self, request, pk=None):
        """Update a competition field"""
        try:
            field = CompetitionField.objects.get(pk=pk)
            serializer = CompetitionFieldSerializer(field, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except CompetitionField.DoesNotExist:
            return Response({'error': 'Field not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def destroy(self, request, pk=None):
        """Delete a competition field"""
        try:
            field = CompetitionField.objects.get(pk=pk)
            field.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except CompetitionField.DoesNotExist:
            return Response({'error': 'Field not found'}, status=status.HTTP_404_NOT_FOUND)


class CategoryFieldAssignmentViewSet(viewsets.ViewSet):
    """ViewSet for category-to-field assignments"""
    permission_classes = [IsAdminOrReadOnly]
    
    def list(self, request):
        """List all category-field assignments"""
        event_id = request.query_params.get('event_id')
        field_id = request.query_params.get('field_id')
        
        assignments = CategoryFieldAssignment.objects.all()
        
        if event_id:
            assignments = assignments.filter(field__event_id=event_id)
        if field_id:
            assignments = assignments.filter(field_id=field_id)
        
        assignments = assignments.order_by('order')
        serializer = CategoryFieldAssignmentSerializer(assignments, many=True)
        return Response(serializer.data)
    
    def create(self, request):
        """Create a category-field assignment"""
        serializer = CategoryFieldAssignmentSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def retrieve(self, request, pk=None):
        """Retrieve a single assignment"""
        try:
            assignment = CategoryFieldAssignment.objects.get(pk=pk)
            serializer = CategoryFieldAssignmentSerializer(assignment)
            return Response(serializer.data)
        except CategoryFieldAssignment.DoesNotExist:
            return Response({'error': 'Assignment not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def update(self, request, pk=None):
        """Update a category-field assignment"""
        try:
            assignment = CategoryFieldAssignment.objects.get(pk=pk)
            serializer = CategoryFieldAssignmentSerializer(assignment, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except CategoryFieldAssignment.DoesNotExist:
            return Response({'error': 'Assignment not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def destroy(self, request, pk=None):
        """Delete a category-field assignment"""
        try:
            assignment = CategoryFieldAssignment.objects.get(pk=pk)
            assignment.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except CategoryFieldAssignment.DoesNotExist:
            return Response({'error': 'Assignment not found'}, status=status.HTTP_404_NOT_FOUND)


class DisplayMonitorSessionViewSet(viewsets.ViewSet):
    """ViewSet for managing display monitor sessions"""
    permission_classes = [IsAdminOrReadOnly]
    
    def list(self, request):
        """List all monitor sessions"""
        event_id = request.query_params.get('event_id')
        sessions = DisplayMonitorSession.objects.all()
        
        if event_id:
            sessions = sessions.filter(field__event_id=event_id)
        
        serializer = DisplayMonitorSessionSerializer(sessions, many=True)
        return Response(serializer.data)
    
    def create(self, request):
        """Create a new monitor session"""
        serializer = DisplayMonitorSessionSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def retrieve(self, request, pk=None):
        """Retrieve a single monitor session"""
        try:
            session = DisplayMonitorSession.objects.get(pk=pk)
            serializer = DisplayMonitorSessionSerializer(session)
            return Response(serializer.data)
        except DisplayMonitorSession.DoesNotExist:
            return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def update(self, request, pk=None):
        """Update a monitor session"""
        try:
            session = DisplayMonitorSession.objects.get(pk=pk)
            serializer = DisplayMonitorSessionSerializer(session, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except DisplayMonitorSession.DoesNotExist:
            return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def destroy(self, request, pk=None):
        """Delete a monitor session"""
        try:
            session = DisplayMonitorSession.objects.get(pk=pk)
            session.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except DisplayMonitorSession.DoesNotExist:
            return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)


class MatchRoundViewSet(viewsets.ViewSet):
    """ViewSet for managing match rounds in fighting competitions"""
    permission_classes = [IsAdminOrReadOnly]
    
    def list(self, request):
        """List all match rounds"""
        match_id = request.query_params.get('match_id')
        rounds = MatchRound.objects.all()
        
        if match_id:
            rounds = rounds.filter(match_id=match_id)
        
        rounds = rounds.order_by('round_number')
        serializer = MatchRoundSerializer(rounds, many=True)
        return Response(serializer.data)
    
    def create(self, request):
        """Create a new match round"""
        serializer = MatchRoundSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def retrieve(self, request, pk=None):
        """Retrieve a single match round"""
        try:
            round_obj = MatchRound.objects.get(pk=pk)
            serializer = MatchRoundSerializer(round_obj)
            return Response(serializer.data)
        except MatchRound.DoesNotExist:
            return Response({'error': 'Round not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def update(self, request, pk=None):
        """Update a match round"""
        try:
            round_obj = MatchRound.objects.get(pk=pk)
            serializer = MatchRoundSerializer(round_obj, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except MatchRound.DoesNotExist:
            return Response({'error': 'Round not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def destroy(self, request, pk=None):
        """Delete a match round"""
        try:
            round_obj = MatchRound.objects.get(pk=pk)
            round_obj.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except MatchRound.DoesNotExist:
            return Response({'error': 'Round not found'}, status=status.HTTP_404_NOT_FOUND)


class QRCodeAssignmentViewSet(viewsets.ViewSet):
    """ViewSet for QR code assignments"""
    permission_classes = [IsAdminOrReadOnly]
    
    def list(self, request):
        """List all QR code assignments"""
        referee_id = request.query_params.get('referee_id')
        active_only = request.query_params.get('active_only', 'false').lower() == 'true'
        
        qr_codes = QRCodeAssignment.objects.all()
        
        if referee_id:
            qr_codes = qr_codes.filter(referee_id=referee_id)
        if active_only:
            qr_codes = qr_codes.filter(is_active=True)
        
        serializer = QRCodeAssignmentSerializer(qr_codes, many=True)
        return Response(serializer.data)
    
    def create(self, request):
        """Create a new QR code assignment"""
        serializer = QRCodeAssignmentSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def retrieve(self, request, pk=None):
        """Retrieve a single QR code assignment"""
        try:
            qr_code = QRCodeAssignment.objects.get(pk=pk)
            serializer = QRCodeAssignmentSerializer(qr_code)
            return Response(serializer.data)
        except QRCodeAssignment.DoesNotExist:
            return Response({'error': 'QR code not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def update(self, request, pk=None):
        """Update a QR code assignment"""
        try:
            qr_code = QRCodeAssignment.objects.get(pk=pk)
            serializer = QRCodeAssignmentSerializer(qr_code, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except QRCodeAssignment.DoesNotExist:
            return Response({'error': 'QR code not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def destroy(self, request, pk=None):
        """Delete a QR code assignment"""
        try:
            qr_code = QRCodeAssignment.objects.get(pk=pk)
            qr_code.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except QRCodeAssignment.DoesNotExist:
            return Response({'error': 'QR code not found'}, status=status.HTTP_404_NOT_FOUND)
    
    @action(detail=False, methods=['post'])
    def verify_qr_code(self, request):
        """Verify a QR code and get referee assignment"""
        code = request.data.get('code')
        if not code:
            return Response({'error': 'QR code required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            qr_assignment = QRCodeAssignment.objects.get(code=code, is_active=True)
            # Check if QR code has expired
            if qr_assignment.expires_at and timezone.now() > qr_assignment.expires_at:
                return Response({'error': 'QR code has expired'}, status=status.HTTP_400_BAD_REQUEST)
            
            serializer = QRCodeAssignmentSerializer(qr_assignment)
            return Response(serializer.data)
        except QRCodeAssignment.DoesNotExist:
            return Response({'error': 'Invalid or inactive QR code'}, status=status.HTTP_400_BAD_REQUEST)
