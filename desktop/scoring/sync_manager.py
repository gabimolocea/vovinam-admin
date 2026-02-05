"""
Sync utility for pushing live scoring data to Django backend
"""
import requests
import json
from typing import Dict, List
from models.db import Database


class ScoringSyncManager:
    """Manager for syncing live scoring data to Django backend"""
    
    def __init__(self, db: Database, api_base_url: str = "http://127.0.0.1:8000/api"):
        self.db = db
        self.api_base_url = api_base_url
        self.session = requests.Session()
    
    def set_auth_token(self, token: str):
        """Set authentication token for API requests"""
        self.session.headers.update({
            'Authorization': f'Bearer {token}'
        })
    
    def sync_scoring_sessions(self) -> Dict[str, any]:
        """Sync all unsynced scoring sessions to Django backend"""
        result = {
            'success': [],
            'failed': [],
            'total': 0
        }
        
        # Get unsynced sessions
        unsynced_sessions = self.db.get_unsynced_scoring_sessions()
        result['total'] = len(unsynced_sessions)
        
        for session in unsynced_sessions:
            try:
                # Get all referee scores for this session
                session_scores = self.db.get_session_scores(session['session_id'])
                
                # Calculate totals and winner
                total_athlete1 = sum(score['athlete1_score'] for score in session_scores)
                total_athlete2 = sum(score['athlete2_score'] for score in session_scores)
                
                winner_id = None
                if total_athlete1 > total_athlete2:
                    winner_id = session['athlete1_id']
                elif total_athlete2 > total_athlete1:
                    winner_id = session['athlete2_id']
                
                # Prepare data for Django
                match_data = {
                    'category_id': session['category_id'],
                    'athlete1_id': session['athlete1_id'],
                    'athlete2_id': session['athlete2_id'],
                    'winner_id': winner_id,
                    'status': 'completed',
                    'match_number': 1,  # You may want to track this differently
                    'round': 'Final'
                }
                
                # Create or update match in Django
                if session['match_id']:
                    # Update existing match
                    response = self.session.patch(
                        f"{self.api_base_url}/matches/{session['match_id']}/",
                        json=match_data
                    )
                else:
                    # Create new match
                    response = self.session.post(
                        f"{self.api_base_url}/matches/",
                        json=match_data
                    )
                
                response.raise_for_status()
                match_result = response.json()
                match_id = match_result['id']
                
                # Sync referee scores
                for score in session_scores:
                    score_data = {
                        'match_id': match_id,
                        'referee_id': score['referee_id'],
                        'referee_name': score['referee_name'],
                        'red_corner_score': score['athlete1_score'],
                        'blue_corner_score': score['athlete2_score'],
                        'rounds': score['score_data']
                    }
                    
                    # Post referee score
                    score_response = self.session.post(
                        f"{self.api_base_url}/referee-scores/",
                        json=score_data
                    )
                    score_response.raise_for_status()
                
                # Mark session as synced
                self.db.mark_session_synced(session['session_id'])
                
                result['success'].append({
                    'session_id': session['session_id'],
                    'match_id': match_id,
                    'category': session['category_name']
                })
                
            except Exception as e:
                result['failed'].append({
                    'session_id': session['session_id'],
                    'error': str(e)
                })
        
        return result
    
    def sync_single_session(self, session_id: str) -> Dict[str, any]:
        """Sync a specific scoring session to Django backend"""
        try:
            conn = self.db.connect()
            cursor = conn.cursor()
            
            # Get session
            cursor.execute(
                "SELECT * FROM live_scoring_sessions WHERE session_id = ?",
                (session_id,)
            )
            session = dict(cursor.fetchone())
            
            # Get scores
            session_scores = self.db.get_session_scores(session_id)
            
            # Calculate totals
            total_athlete1 = sum(score['athlete1_score'] for score in session_scores)
            total_athlete2 = sum(score['athlete2_score'] for score in session_scores)
            
            winner_id = None
            if total_athlete1 > total_athlete2:
                winner_id = session['athlete1_id']
            elif total_athlete2 > total_athlete1:
                winner_id = session['athlete2_id']
            
            # Prepare match data
            match_data = {
                'category_id': session['category_id'],
                'athlete1_id': session['athlete1_id'],
                'athlete2_id': session['athlete2_id'],
                'winner_id': winner_id,
                'status': 'completed'
            }
            
            # Create/update match
            if session['match_id']:
                response = self.session.patch(
                    f"{self.api_base_url}/matches/{session['match_id']}/",
                    json=match_data
                )
            else:
                response = self.session.post(
                    f"{self.api_base_url}/matches/",
                    json=match_data
                )
            
            response.raise_for_status()
            match_result = response.json()
            match_id = match_result['id']
            
            # Sync referee scores
            for score in session_scores:
                score_data = {
                    'match_id': match_id,
                    'referee_id': score['referee_id'],
                    'referee_name': score['referee_name'],
                    'red_corner_score': score['athlete1_score'],
                    'blue_corner_score': score['athlete2_score']
                }
                
                score_response = self.session.post(
                    f"{self.api_base_url}/referee-scores/",
                    json=score_data
                )
                score_response.raise_for_status()
            
            # Mark as synced
            self.db.mark_session_synced(session_id)
            
            return {
                'success': True,
                'session_id': session_id,
                'match_id': match_id
            }
            
        except Exception as e:
            return {
                'success': False,
                'session_id': session_id,
                'error': str(e)
            }
    
    def get_sync_status(self) -> Dict[str, int]:
        """Get sync status summary"""
        conn = self.db.connect()
        cursor = conn.cursor()
        
        # Count unsynced sessions
        cursor.execute(
            "SELECT COUNT(*) FROM live_scoring_sessions WHERE is_synced = 0 AND status = 'completed'"
        )
        unsynced_count = cursor.fetchone()[0]
        
        # Count synced sessions
        cursor.execute(
            "SELECT COUNT(*) FROM live_scoring_sessions WHERE is_synced = 1"
        )
        synced_count = cursor.fetchone()[0]
        
        # Count active sessions
        cursor.execute(
            "SELECT COUNT(*) FROM live_scoring_sessions WHERE status = 'active'"
        )
        active_count = cursor.fetchone()[0]
        
        return {
            'unsynced': unsynced_count,
            'synced': synced_count,
            'active': active_count,
            'total': unsynced_count + synced_count + active_count
        }
