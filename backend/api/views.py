from django.shortcuts import render
from rest_framework.decorators import api_view
from rest_framework import viewsets, permissions
from .serializers import *
from .models import *
from rest_framework.response import Response
from rest_framework.reverse import reverse
from django.conf import settings
# Create your views here.


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
        # Include detailed error only when DEBUG is True; otherwise mask it
        if getattr(settings, 'DEBUG', False):
            payload["database_error"] = db_error[:200]
        else:
            payload["database_error"] = "unavailable"
    return Response(payload)

class CityViewSet(viewsets.ViewSet):
    permission_classes = [permissions.AllowAny]
    queryset = City.objects.all()
    serializer_class = CitySerializer

    def list(self, request):
        queryset = City.objects.all()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)
    
class CompetitionViewSet(viewsets.ViewSet):
    permission_classes = [permissions.AllowAny]
    queryset = Competition.objects.all()
    serializer_class = CompetitionSerializer
    def list(self, request):
        queryset = Competition.objects.all()
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
    

class ClubViewSet(viewsets.ViewSet):
    permission_classes = [permissions.AllowAny]
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

class AthleteViewSet(viewsets.ViewSet):
    permission_classes = [permissions.AllowAny]
    queryset = Athlete.objects.all()
    serializer_class = AthleteSerializer

    def list(self, request):
        queryset = Athlete.objects.all()
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
    
class TitleViewSet(viewsets.ViewSet):
    permission_classes = [permissions.AllowAny]
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
    permission_classes = [permissions.AllowAny]
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
class GradeHistoryViewSet(viewsets.ViewSet):
    permission_classes = [permissions.AllowAny]
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
    permission_classes = [permissions.AllowAny]
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
    permission_classes = [permissions.AllowAny]
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
    permission_classes = [permissions.AllowAny]
    serializer_class = AnnualVisaSerializer

    def get_queryset(self):
        return AnnualVisa.objects.all()

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
    permission_classes = [permissions.AllowAny]
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
    


class GradeHistoryViewSet(viewsets.ViewSet):
    permission_classes = [permissions.AllowAny]
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
    permission_classes = [permissions.AllowAny]
    serializer_class = MedicalVisaSerializer

    def get_queryset(self):
        return MedicalVisa.objects.all()

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


class TrainingSeminarViewSet(viewsets.ViewSet):
    permission_classes = [permissions.AllowAny]
    queryset = TrainingSeminar.objects.all()
    serializer_class = TrainingSeminarSerializer

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

class GroupViewSet(viewsets.ViewSet):
    permission_classes = [permissions.AllowAny]
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