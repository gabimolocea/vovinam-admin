# api/sync_api.py
"""
Specialized API views for offline sync operations
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db.models import Q, F
from django.db import transaction
from .models import Athlete, Club, Category, GradeHistory
from .permissions import IsAdmin
import hashlib


class SyncAPIViewSet(viewsets.ViewSet):
    """
    Specialized endpoints for offline sync operations
    Handles bulk operations, conflict resolution, and sync metadata
    """
    permission_classes = [IsAuthenticated]
    
    @action(detail=False, methods=['get'])
    def sync_metadata(self, request):
        """
        Return sync metadata for all syncable entities.
        Used by offline clients to determine what needs to be downloaded.
        
        Query params:
        - since: ISO timestamp, only return records modified after this time
        - entities: comma-separated list of entity types (athletes,clubs,competitions)
        """
        since = request.query_params.get('since')
        entities = request.query_params.get('entities', 'athletes,clubs,competitions,grades').split(',')
        
        metadata = {}
        
        if 'athletes' in entities:
            qs = Athlete.objects.all()
            if since:
                # Use submitted_date since updated_at doesn't exist yet (add TimestampMixin to enable)
                qs = qs.filter(submitted_date__gt=since)
            # Return available fields (version and sync_hash will be None until SyncMixin is added)
            metadata['athletes'] = list(qs.values('id', 'submitted_date', 'status'))
        
        if 'clubs' in entities:
            qs = Club.objects.all()
            if since:
                qs = qs.filter(modified__gt=since)
            metadata['clubs'] = list(qs.values('id', 'modified', 'name'))
        
        if 'competitions' in entities:
            from landing.models import Event
            qs = Event.objects.filter(event_type='competition')
            if since:
                # Use created_at if available, otherwise no time filter
                if hasattr(Event, 'created_at'):
                    qs = qs.filter(created_at__gt=since)
            metadata['competitions'] = list(qs.values('id', 'title', 'start_date'))
        
        if 'grades' in entities:
            from .models import Grade
            qs = Grade.objects.all()
            if since:
                qs = qs.filter(modified__gt=since)
            metadata['grades'] = list(qs.values('id', 'modified', 'name', 'rank_order'))
        
        return Response({
            'timestamp': timezone.now().isoformat(),
            'metadata': metadata
        })
    
    @action(detail=False, methods=['post'])
    def bulk_sync(self, request):
        """
        Sync multiple records in one request.
        Handles create, update, and conflict detection.
        
        Request body:
        {
            "athletes": [
                {"id": 1, "version": 5, "data": {...}},
                {"temp_id": "offline_123", "data": {...}}
            ],
            "clubs": [...],
            "grades": [...]
        }
        
        Response:
        {
            "success": [...],
            "conflicts": [...],
            "errors": [...]
        }
        """
        results = {
            'success': [],
            'conflicts': [],
            'errors': []
        }
        
        with transaction.atomic():
            # Process athletes
            for item in request.data.get('athletes', []):
                try:
                    result = self._sync_athlete(item, request.user)
                    if result['status'] == 'conflict':
                        results['conflicts'].append(result)
                    else:
                        results['success'].append(result)
                except Exception as e:
                    results['errors'].append({
                        'entity': 'athlete',
                        'data': item,
                        'error': str(e)
                    })
            
            # Process clubs
            for item in request.data.get('clubs', []):
                try:
                    result = self._sync_club(item, request.user)
                    if result['status'] == 'conflict':
                        results['conflicts'].append(result)
                    else:
                        results['success'].append(result)
                except Exception as e:
                    results['errors'].append({
                        'entity': 'club',
                        'data': item,
                        'error': str(e)
                    })
        
        return Response(results)
    
    def _sync_athlete(self, item, user):
        """Sync a single athlete record with conflict detection"""
        athlete_id = item.get('id')
        temp_id = item.get('temp_id')
        client_version = item.get('version', 1)
        data = item.get('data', {})
        
        # New record (created offline)
        if not athlete_id and temp_id:
            # Check if already synced by temp_id
            existing = Athlete.objects.filter(temp_id=temp_id).first()
            if existing:
                return {
                    'status': 'already_synced',
                    'entity': 'athlete',
                    'temp_id': temp_id,
                    'id': existing.id
                }
            
            # Create new athlete
            from .serializers import AthleteSerializer
            serializer = AthleteSerializer(data=data)
            if serializer.is_valid():
                athlete = serializer.save()
                # Set offline creation tracking if SyncMixin is added
                if hasattr(athlete, 'created_offline'):
                    athlete.created_offline = True
                    athlete.temp_id = temp_id
                    athlete.save(update_fields=['created_offline', 'temp_id'])
                # Set created_by if AuditMixin is added
                if hasattr(athlete, 'created_by'):
                    athlete.created_by = user
                    athlete.save(update_fields=['created_by'])
                return {
                    'status': 'created',
                    'entity': 'athlete',
                    'temp_id': temp_id,
                    'id': athlete.id,
                    'version': getattr(athlete, 'version', 1)
                }
            else:
                raise ValueError(f"Validation failed: {serializer.errors}")
        
        # Update existing record
        elif athlete_id:
            try:
                athlete = Athlete.objects.get(pk=athlete_id)
                
                # Check for version conflict (if SyncMixin is added to model)
                server_version = getattr(athlete, 'version', 1)
                if hasattr(athlete, 'version') and server_version != client_version:
                    return {
                        'status': 'conflict',
                        'server_version': athlete.version if hasattr(athlete, 'version') else 1,
                        'client_version': client_version,
                        'server_data': {
                            'submitted_date': athlete.submitted_date.isoformat() if athlete.submitted_date else None,
                            'status': athlete.status,
                            'modified_by': athlete.modified_by.email if hasattr(athlete, 'modified_by') and athlete.modified_by else None
                        }
                    }
                
                # No conflict, update
                from .serializers import AthleteSerializer
                serializer = AthleteSerializer(athlete, data=data, partial=True)
                if serializer.is_valid():
                    updated_athlete = serializer.save()
                    # Set modified_by if AuditMixin is added
                    if hasattr(updated_athlete, 'modified_by'):
                        updated_athlete.modified_by = user
                        updated_athlete.save(update_fields=['modified_by'])
                    return {
                        'status': 'updated',
                        'entity': 'athlete',
                        'id': athlete.id,
                        'version': getattr(athlete, 'version', 1)
                    }
                else:
                    raise ValueError(f"Validation failed: {serializer.errors}")
                    
            except Athlete.DoesNotExist:
                raise ValueError(f"Athlete {athlete_id} not found")
        
        raise ValueError("Must provide either id or temp_id")
    
    def _sync_club(self, item, user):
        """Sync a single club record"""
        # Similar to _sync_athlete but for clubs
        club_id = item.get('id')
        data = item.get('data', {})
        
        if club_id:
            club = Club.objects.get(pk=club_id)
            from .serializers import ClubSerializer
            serializer = ClubSerializer(club, data=data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return {
                    'status': 'updated',
                    'entity': 'club',
                    'id': club.id
                }
        else:
            from .serializers import ClubSerializer
            serializer = ClubSerializer(data=data)
            if serializer.is_valid():
                club = serializer.save()
                return {
                    'status': 'created',
                    'entity': 'club',
                    'id': club.id
                }
        
        raise ValueError("Sync failed")
    
    @action(detail=False, methods=['post'], permission_classes=[IsAdmin])
    def resolve_conflict(self, request):
        """
        Admin endpoint to resolve sync conflicts.
        
        Request body:
        {
            "entity": "athlete",
            "id": 123,
            "resolution": "use_server" | "use_client" | "merge",
            "client_data": {...}
        }
        """
        entity_type = request.data.get('entity')
        entity_id = request.data.get('id')
        resolution = request.data.get('resolution')
        client_data = request.data.get('client_data', {})
        
        if entity_type == 'athlete':
            athlete = Athlete.objects.get(pk=entity_id)
            
            if resolution == 'use_client':
                # Override server with client data
                from .serializers import AthleteSerializer
                serializer = AthleteSerializer(athlete, data=client_data, partial=True)
                if serializer.is_valid():
                    serializer.save(modified_by=request.user)
                    return Response({'status': 'resolved', 'resolution': 'use_client', 'version': athlete.version})
            
            elif resolution == 'use_server':
                # Keep server data, just return it
                from .serializers import AthleteSerializer
                return Response({
                    'status': 'resolved',
                    'resolution': 'use_server',
                    'data': AthleteSerializer(athlete).data
                })
            
            elif resolution == 'merge':
                # Admin provides merged data in client_data
                from .serializers import AthleteSerializer
                serializer = AthleteSerializer(athlete, data=client_data, partial=True)
                if serializer.is_valid():
                    serializer.save(modified_by=request.user)
                    return Response({'status': 'resolved', 'resolution': 'merge', 'version': athlete.version})
        
        return Response({'error': 'Invalid request'}, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'])
    def mark_synced(self, request):
        """
        Mark records as successfully synced to offline client.
        
        Request body:
        {
            "athletes": [1, 2, 3],
            "clubs": [1, 2],
            "timestamp": "2024-01-01T12:00:00Z"
        }
        """
        timestamp = timezone.now()
        
        athlete_ids = request.data.get('athletes', [])
        if athlete_ids:
            Athlete.objects.filter(id__in=athlete_ids).update(
                is_synced=True,
                last_synced_at=timestamp
            )
        
        club_ids = request.data.get('clubs', [])
        if club_ids:
            Club.objects.filter(id__in=club_ids).update(
                modified=timestamp
            )
        
        return Response({'status': 'marked_synced', 'count': len(athlete_ids) + len(club_ids)})
