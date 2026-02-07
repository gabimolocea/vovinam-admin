"""
Enhanced WebSocket Server for Tatami Scoring
Integrates with LANManager for tatami-based scoring
"""
import asyncio
import json
import socket
from datetime import datetime
from typing import Dict, Set, Optional
import websockets
from websockets.server import WebSocketServerProtocol
from models.lan_manager import LANManager


class TatamiScoringServer:
    """Enhanced WebSocket server with tatami support"""
    
    def __init__(self, db, host='0.0.0.0', port=8765):
        self.db = db
        self.lan_manager = LANManager(db.connection)
        self.host = host
        self.port = port
        
        # Client tracking
        self.clients: Dict[str, WebSocketServerProtocol] = {}  # client_id -> websocket
        self.referee_sessions: Dict[int, Set[int]] = {}  # tatami_id -> set of referee_ids
        self.display_clients: Set[WebSocketServerProtocol] = set()
        
        # Active sessions
        self.active_sessions: Dict[int, dict] = {}  # session_id -> session_data
    
    def get_local_ip(self) -> str:
        """Get local IP for connection info"""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
            return local_ip
        except:
            return "127.0.0.1"
    
    async def handle_client_connection(self, websocket: WebSocketServerProtocol, path: str):
        """Handle new client connection"""
        client_id = None
        tatami_id = None
        
        try:
            async for message in websocket:
                data = json.loads(message)
                await self.handle_message(websocket, data, client_id, tatami_id)
                
        except websockets.exceptions.ConnectionClosed:
            if client_id and tatami_id:
                await self.unregister_referee(tatami_id, client_id)
    
    async def handle_message(self, websocket: WebSocketServerProtocol, 
                            message: dict, client_id: str, tatami_id: Optional[int]):
        """Handle incoming message from client"""
        msg_type = message.get('type')
        
        if msg_type == 'register_referee':
            # Referee registers for a tatami
            referee_id = message.get('referee_id')
            tatami_id = message.get('tatami_id')
            client_id = f"referee_{referee_id}_{tatami_id}"
            
            self.clients[client_id] = websocket
            if tatami_id not in self.referee_sessions:
                self.referee_sessions[tatami_id] = set()
            self.referee_sessions[tatami_id].add(referee_id)
            
            # Send active sessions for this tatami
            await self.send_tatami_sessions(websocket, tatami_id)
            
            print(f"✅ Referee {referee_id} registered for Tatami {tatami_id}")
        
        elif msg_type == 'register_display':
            # Display client registers (for live score display)
            self.display_clients.add(websocket)
            print(f"✅ Display client connected")
        
        elif msg_type == 'start_session':
            # Start a scoring session on a tatami
            await self.start_scoring_session(message.get('data'))
        
        elif msg_type == 'submit_score':
            # Referee submits their score
            await self.handle_score_submission(message.get('data'), client_id)
        
        elif msg_type == 'get_sessions':
            # Request active sessions for tatami
            if tatami_id:
                await self.send_tatami_sessions(websocket, tatami_id)
        
        elif msg_type == 'end_session':
            # End a scoring session
            session_id = message.get('session_id')
            await self.end_scoring_session(session_id)
    
    async def send_tatami_sessions(self, websocket: WebSocketServerProtocol, tatami_id: int):
        """Send all active sessions for a tatami to a client"""
        sessions = self.lan_manager.get_active_sessions(tatami_id)
        
        for session in sessions:
            session_data = {
                'id': session.id,
                'tatami_id': session.tatami_id,
                'category_name': session.category_name,
                'category_type': session.category_type,
                'athlete1_name': session.athlete1_name,
                'athlete2_name': session.athlete2_name,
                'status': session.status,
                'started_at': session.started_at
            }
            
            await websocket.send(json.dumps({
                'type': 'session_available',
                'session': session_data
            }))
    
    async def start_scoring_session(self, data: dict):
        """Start a new scoring session"""
        try:
            session_id = self.lan_manager.create_session(
                data['tatami_id'],
                data['category_id'],
                data['category_name'],
                data['category_type'],
                data.get('athlete1_id', 1),
                data['athlete1_name'],
                data.get('athlete2_id'),
                data.get('athlete2_name'),
                data.get('match_id')
            )
            
            self.active_sessions[session_id] = {
                'id': session_id,
                'tatami_id': data['tatami_id'],
                'category_name': data['category_name'],
                'athletes': [data['athlete1_name'], data.get('athlete2_name', '')],
                'submissions': {}  # referee_id -> score_data
            }
            
            # Broadcast to all connected clients
            await self.broadcast_all({
                'type': 'session_started',
                'session': {
                    'id': session_id,
                    'tatami_id': data['tatami_id'],
                    'category_name': data['category_name'],
                    'category_type': data['category_type']
                }
            })
            
            print(f"✅ Session {session_id} started on Tatami {data['tatami_id']}")
        except Exception as e:
            print(f"Error starting session: {e}")
    
    async def handle_score_submission(self, data: dict, client_id: str):
        """Handle referee score submission"""
        try:
            session_id = data['session_id']
            referee_id = data['referee_id']
            referee_name = data['referee_name']
            score_data = json.dumps(data.get('score_data', {}))
            
            # Save submission to database
            self.lan_manager.submit_referee_score(
                session_id,
                referee_id,
                referee_name,
                score_data
            )
            
            # Track submission
            if session_id in self.active_sessions:
                self.active_sessions[session_id]['submissions'][referee_id] = data['score_data']
            
            # Broadcast to displays
            await self.broadcast_displays({
                'type': 'score_submitted',
                'session_id': session_id,
                'referee_id': referee_id,
                'referee_name': referee_name,
                'submission_count': len(self.active_sessions.get(session_id, {}).get('submissions', {}))
            })
            
            print(f"✅ Score from Referee {referee_id} received for Session {session_id}")
        except Exception as e:
            print(f"Error submitting score: {e}")
    
    async def end_scoring_session(self, session_id: int):
        """End a scoring session"""
        try:
            self.lan_manager.end_session(session_id)
            
            # Get final submissions
            submissions = self.lan_manager.get_session_submissions(session_id)
            
            # Calculate aggregate score if multiple referees
            if len(submissions) > 1:
                aggregate = self.calculate_aggregate_score(submissions)
            else:
                aggregate = json.loads(submissions[0]['score_data']) if submissions else {}
            
            # Broadcast session completion
            await self.broadcast_all({
                'type': 'session_completed',
                'session_id': session_id,
                'submissions_count': len(submissions),
                'aggregate_score': aggregate
            })
            
            if session_id in self.active_sessions:
                del self.active_sessions[session_id]
            
            print(f"✅ Session {session_id} ended with {len(submissions)} submissions")
        except Exception as e:
            print(f"Error ending session: {e}")
    
    def calculate_aggregate_score(self, submissions: list) -> dict:
        """Calculate aggregate score from multiple referee submissions"""
        if not submissions:
            return {}
        
        # Parse all scores
        scores = []
        for sub in submissions:
            try:
                score_data = json.loads(sub['score_data'])
                scores.append(score_data)
            except:
                pass
        
        if not scores:
            return {}
        
        # Calculate average (simplified - extend based on scoring rules)
        aggregate = {}
        for key in scores[0].keys():
            values = [s.get(key, 0) for s in scores if isinstance(s.get(key, 0), (int, float))]
            if values:
                aggregate[key] = sum(values) / len(values)
        
        return aggregate
    
    async def unregister_referee(self, tatami_id: int, referee_id: int):
        """Unregister referee from tatami"""
        if tatami_id in self.referee_sessions:
            self.referee_sessions[tatami_id].discard(referee_id)
        print(f"❌ Referee {referee_id} disconnected from Tatami {tatami_id}")
    
    async def broadcast_all(self, message: dict):
        """Broadcast to all connected clients"""
        message_str = json.dumps(message)
        all_clients = list(self.clients.values()) + list(self.display_clients)
        
        if all_clients:
            await asyncio.gather(
                *[client.send(message_str) for client in all_clients],
                return_exceptions=True
            )
    
    async def broadcast_displays(self, message: dict):
        """Broadcast only to display clients"""
        message_str = json.dumps(message)
        if self.display_clients:
            await asyncio.gather(
                *[client.send(message_str) for client in self.display_clients],
                return_exceptions=True
            )
    
    async def broadcast_tatami(self, tatami_id: int, message: dict):
        """Broadcast to all clients of a specific tatami"""
        message_str = json.dumps(message)
        clients = [
            ws for cid, ws in self.clients.items()
            if cid.startswith(f"referee_") and str(tatami_id) in cid
        ]
        
        if clients:
            await asyncio.gather(
                *[client.send(message_str) for client in clients],
                return_exceptions=True
            )
    
    async def start_server(self):
        """Start the WebSocket server"""
        print(f"🌐 Starting Tatami Scoring Server on {self.get_local_ip()}:{self.port}")
        
        async with websockets.serve(self.handle_client_connection, self.host, self.port):
            print(f"✅ Server running on ws://{self.get_local_ip()}:{self.port}")
            await asyncio.Future()  # Run forever
    
    def run(self):
        """Run the server (blocking)"""
        asyncio.run(self.start_server())
