"""
WebSocket consumers for real-time competition score updates and referee interactions
"""
import json
import logging
from datetime import datetime
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth import get_user_model
from django.utils import timezone
from .models import (
    DisplayMonitorSession, CompetitionField, CategoryRefereeScore,
    MatchRefereeScore, Match, Event
)

User = get_user_model()
logger = logging.getLogger(__name__)


class ScoringConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for real-time score submission and display.
    
    Manages:
    - Referee score submissions (category and match scores)
    - Real-time score display on monitors
    - Admin monitor control (switching categories/matches)
    - Winner selections for fighting matches
    """
    
    async def connect(self):
        """Handle WebSocket connection"""
        self.user = self.scope.get("user")
        self.field_id = self.scope['url_route']['kwargs'].get('field_id')
        self.event_id = self.scope['url_route']['kwargs'].get('event_id')
        
        # Create group names for different channels
        if self.field_id:
            self.field_group_name = f"field_{self.field_id}"
        elif self.event_id:
            self.field_group_name = f"event_{self.event_id}"
        else:
            self.field_group_name = None
        
        if self.field_group_name:
            # Join the field or event group
            await self.channel_layer.group_add(
                self.field_group_name,
                self.channel_name
            )
        
        await self.accept()
        logger.info(f"WebSocket connected: user={self.user}, field={self.field_id}, event={self.event_id}")
        
        # Send connection confirmation
        await self.send(json.dumps({
            "type": "connection",
            "status": "connected",
            "timestamp": timezone.now().isoformat()
        }))
    
    async def disconnect(self, close_code):
        """Handle WebSocket disconnection"""
        if self.field_group_name:
            await self.channel_layer.group_discard(
                self.field_group_name,
                self.channel_name
            )
        logger.info(f"WebSocket disconnected: user={self.user}, code={close_code}")
    
    async def receive(self, text_data):
        """Handle incoming WebSocket messages"""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            logger.info(f"WebSocket message received: type={message_type}, user={self.user}")
            
            if message_type == 'category_score':
                await self.handle_category_score(data)
            elif message_type == 'match_score':
                await self.handle_match_score(data)
            elif message_type == 'winner_selection':
                await self.handle_winner_selection(data)
            elif message_type == 'switch_display':
                await self.handle_switch_display(data)
            elif message_type == 'ping':
                await self.send(json.dumps({"type": "pong", "timestamp": timezone.now().isoformat()}))
            else:
                logger.warning(f"Unknown message type: {message_type}")
        
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON received: {text_data}")
            await self.send(json.dumps({
                "type": "error",
                "message": "Invalid JSON"
            }))
        except Exception as e:
            logger.error(f"Error processing message: {e}")
            await self.send(json.dumps({
                "type": "error",
                "message": str(e)
            }))
    
    async def handle_category_score(self, data):
        """Handle category score submission (solo/team competitions)"""
        athlete_score_id = data.get('athlete_score_id')
        deductions = data.get('deductions', {})
        notes = data.get('notes', '')
        
        try:
            # Save category score to database
            score = await self._save_category_score(
                athlete_score_id=athlete_score_id,
                referee=self.user,
                deductions=deductions,
                notes=notes
            )
            
            # Broadcast score update to all connected clients in this field/event
            await self.channel_layer.group_send(
                self.field_group_name,
                {
                    'type': 'category_score_update',
                    'athlete_score_id': athlete_score_id,
                    'referee_id': self.user.id,
                    'referee_name': f"{self.user.first_name} {self.user.last_name}",
                    'score': score['score'],
                    'submitted_at': score['submitted_date'],
                }
            )
            
            # Send confirmation to sender
            await self.send(json.dumps({
                'type': 'score_submitted',
                'athlete_score_id': athlete_score_id,
                'score': score['score'],
                'status': 'saved',
                'timestamp': timezone.now().isoformat()
            }))
        
        except Exception as e:
            logger.error(f"Error saving category score: {e}")
            await self.send(json.dumps({
                'type': 'error',
                'message': f"Failed to save score: {e}"
            }))
    
    async def handle_match_score(self, data):
        """Handle match score submission (fighting competitions)"""
        match_id = data.get('match_id')
        round_number = data.get('round_number')
        red_score = data.get('red_score', 0)
        blue_score = data.get('blue_score', 0)
        notes = data.get('notes', '')
        
        try:
            score = await self._save_match_score(
                match_id=match_id,
                referee=self.user,
                round_number=round_number,
                red_score=red_score,
                blue_score=blue_score,
                notes=notes
            )
            
            # Broadcast score update
            await self.channel_layer.group_send(
                self.field_group_name,
                {
                    'type': 'match_score_update',
                    'match_id': match_id,
                    'round_number': round_number,
                    'referee_id': self.user.id,
                    'referee_name': f"{self.user.first_name} {self.user.last_name}",
                    'red_score': red_score,
                    'blue_score': blue_score,
                    'submitted_at': score['submitted_date'],
                }
            )
            
            # Send confirmation
            await self.send(json.dumps({
                'type': 'score_submitted',
                'match_id': match_id,
                'round_number': round_number,
                'status': 'saved',
                'timestamp': timezone.now().isoformat()
            }))
        
        except Exception as e:
            logger.error(f"Error saving match score: {e}")
            await self.send(json.dumps({
                'type': 'error',
                'message': f"Failed to save score: {e}"
            }))
    
    async def handle_winner_selection(self, data):
        """Handle winner selection for fighting matches"""
        match_id = data.get('match_id')
        winner = data.get('winner')  # 'red', 'blue', or 'draw'
        
        try:
            result = await self._save_winner_selection(
                match_id=match_id,
                referee=self.user,
                winner=winner
            )
            
            # Broadcast winner update
            await self.channel_layer.group_send(
                self.field_group_name,
                {
                    'type': 'winner_update',
                    'match_id': match_id,
                    'winner': winner,
                    'referee_id': self.user.id,
                    'submitted_at': result['timestamp'],
                }
            )
            
            # Send confirmation
            await self.send(json.dumps({
                'type': 'winner_submitted',
                'match_id': match_id,
                'winner': winner,
                'status': 'saved',
                'timestamp': timezone.now().isoformat()
            }))
        
        except Exception as e:
            logger.error(f"Error saving winner selection: {e}")
            await self.send(json.dumps({
                'type': 'error',
                'message': f"Failed to save winner: {e}"
            }))
    
    async def handle_switch_display(self, data):
        """Handle admin switching which category/match displays on a field"""
        field_id = data.get('field_id')
        category_id = data.get('category_id')
        match_id = data.get('match_id')
        athlete_id = data.get('athlete_id')
        
        # Verify user is admin
        if not await self._is_admin(self.user):
            await self.send(json.dumps({
                'type': 'error',
                'message': 'Only admins can switch displays'
            }))
            return
        
        try:
            await self._update_monitor_session(
                field_id=field_id,
                category_id=category_id,
                match_id=match_id,
                athlete_id=athlete_id
            )
            
            # Broadcast display change to all monitors on this field
            await self.channel_layer.group_send(
                f"field_{field_id}",
                {
                    'type': 'display_changed',
                    'field_id': field_id,
                    'category_id': category_id,
                    'match_id': match_id,
                    'athlete_id': athlete_id,
                    'timestamp': timezone.now().isoformat()
                }
            )
            
            await self.send(json.dumps({
                'type': 'display_updated',
                'field_id': field_id,
                'status': 'success'
            }))
        
        except Exception as e:
            logger.error(f"Error switching display: {e}")
            await self.send(json.dumps({
                'type': 'error',
                'message': f"Failed to switch display: {e}"
            }))
    
    # Group receive handlers
    
    async def category_score_update(self, event):
        """Broadcast category score update to WebSocket"""
        await self.send(json.dumps({
            'type': 'category_score_update',
            'athlete_score_id': event['athlete_score_id'],
            'referee_id': event['referee_id'],
            'referee_name': event['referee_name'],
            'score': event['score'],
            'submitted_at': event['submitted_at']
        }))
    
    async def match_score_update(self, event):
        """Broadcast match score update to WebSocket"""
        await self.send(json.dumps({
            'type': 'match_score_update',
            'match_id': event['match_id'],
            'round_number': event['round_number'],
            'referee_id': event['referee_id'],
            'referee_name': event['referee_name'],
            'red_score': event['red_score'],
            'blue_score': event['blue_score'],
            'submitted_at': event['submitted_at']
        }))
    
    async def winner_update(self, event):
        """Broadcast winner update to WebSocket"""
        await self.send(json.dumps({
            'type': 'winner_update',
            'match_id': event['match_id'],
            'winner': event['winner'],
            'referee_id': event['referee_id'],
            'submitted_at': event['submitted_at']
        }))
    
    async def display_changed(self, event):
        """Notify monitors that display has changed"""
        await self.send(json.dumps({
            'type': 'display_changed',
            'field_id': event['field_id'],
            'category_id': event.get('category_id'),
            'match_id': event.get('match_id'),
            'athlete_id': event.get('athlete_id'),
            'timestamp': event['timestamp']
        }))
    
    # Database operations (async)
    
    @database_sync_to_async
    def _save_category_score(self, athlete_score_id, referee, deductions, notes):
        """Save a category score to database"""
        from .models import CategoryAthleteScore
        
        athlete_score = CategoryAthleteScore.objects.get(id=athlete_score_id)
        
        # Calculate score from deductions (100 - total_deductions)
        total_deductions = sum(deductions.values()) if deductions else 0
        score = 100 - total_deductions
        
        # Create or update referee score
        ref_score, _ = CategoryRefereeScore.objects.update_or_create(
            athlete_score=athlete_score,
            referee=referee,
            defaults={
                'deductions': deductions,
                'score': score,
                'submitted_date': timezone.now(),
                'notes': notes
            }
        )
        
        return {
            'id': ref_score.id,
            'score': ref_score.score,
            'submitted_date': ref_score.submitted_date.isoformat()
        }
    
    @database_sync_to_async
    def _save_match_score(self, match_id, referee, round_number, red_score, blue_score, notes):
        """Save a match score to database"""
        match = Match.objects.get(id=match_id)
        
        # Create or update referee score for this round
        ref_score, _ = MatchRefereeScore.objects.update_or_create(
            match=match,
            referee=referee,
            round_number=round_number,
            defaults={
                'red_score': red_score,
                'blue_score': blue_score,
                'submitted_date': timezone.now(),
                'notes': notes
            }
        )
        
        return {
            'id': ref_score.id,
            'submitted_date': ref_score.submitted_date.isoformat()
        }
    
    @database_sync_to_async
    def _save_winner_selection(self, match_id, referee, winner):
        """Save winner selection to database"""
        match = Match.objects.get(id=match_id)
        
        # Create or update winner selection
        ref_score, _ = MatchRefereeScore.objects.update_or_create(
            match=match,
            referee=referee,
            defaults={
                'winner': winner,
                'submitted_date': timezone.now()
            }
        )
        
        return {
            'id': ref_score.id,
            'timestamp': ref_score.submitted_date.isoformat()
        }
    
    @database_sync_to_async
    def _update_monitor_session(self, field_id, category_id, match_id, athlete_id):
        """Update what's displayed on a field's monitor"""
        session, _ = DisplayMonitorSession.objects.get_or_create(field_id=field_id)
        
        if category_id:
            session.current_category_id = category_id
        if match_id:
            session.current_match_id = match_id
        if athlete_id:
            session.current_athlete_id = athlete_id
        
        session.save()
        return session
    
    @database_sync_to_async
    def _is_admin(self, user):
        """Check if user is admin"""
        return user.is_staff or user.is_admin


# Optional: Create a consumer for admin dashboard to receive real-time updates
class AdminDashboardConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer for admin dashboard real-time updates"""
    
    async def connect(self):
        """Handle admin dashboard connection"""
        self.user = self.scope.get("user")
        
        # Verify user is admin
        if not await self._is_admin(self.user):
            await self.close()
            return
        
        self.event_id = self.scope['url_route']['kwargs'].get('event_id')
        self.admin_group_name = f"admin_event_{self.event_id}"
        
        # Join admin group
        await self.channel_layer.group_add(
            self.admin_group_name,
            self.channel_name
        )
        
        await self.accept()
        logger.info(f"Admin dashboard connected: user={self.user}, event={self.event_id}")
    
    async def disconnect(self, close_code):
        """Handle admin dashboard disconnection"""
        if hasattr(self, 'admin_group_name'):
            await self.channel_layer.group_discard(
                self.admin_group_name,
                self.channel_name
            )
    
    async def receive(self, text_data):
        """Handle admin messages"""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            if message_type == 'get_event_stats':
                await self.send_event_stats(data.get('event_id'))
            elif message_type == 'ping':
                await self.send(json.dumps({
                    "type": "pong",
                    "timestamp": timezone.now().isoformat()
                }))
        
        except Exception as e:
            logger.error(f"Admin error: {e}")
    
    async def send_event_stats(self, event_id):
        """Send real-time event statistics"""
        stats = await self._get_event_stats(event_id)
        await self.send(json.dumps({
            'type': 'event_stats',
            'stats': stats
        }))
    
    @database_sync_to_async
    def _get_event_stats(self, event_id):
        """Get real-time statistics for an event"""
        from .models import (
            CategoryAthleteScore, MatchRefereeScore,
            CategoryFieldAssignment
        )
        
        category_scores = CategoryAthleteScore.objects.filter(
            category__event_id=event_id
        ).count()
        
        match_scores = MatchRefereeScore.objects.filter(
            match__event_id=event_id
        ).count()
        
        assignments = CategoryFieldAssignment.objects.filter(
            field__event_id=event_id
        ).count()
        
        return {
            'total_scores': category_scores,
            'total_match_scores': match_scores,
            'field_assignments': assignments,
            'timestamp': timezone.now().isoformat()
        }
    
    @database_sync_to_async
    def _is_admin(self, user):
        """Check if user is admin"""
        return user.is_staff or user.is_admin
