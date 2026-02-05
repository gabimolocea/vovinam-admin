"""
WebSocket server for real-time LAN scoring communication
Handles connections from referee clients and scoreboard displays
"""
import asyncio
import json
import socket
from datetime import datetime
from typing import Dict, Set
import websockets
from websockets.server import WebSocketServerProtocol


class ScoringWebSocketServer:
    """WebSocket server for LAN-based referee scoring"""
    
    def __init__(self, db, host='0.0.0.0', port=8765):
        self.db = db
        self.host = host
        self.port = port
        self.clients: Set[WebSocketServerProtocol] = set()
        self.referee_clients: Dict[int, WebSocketServerProtocol] = {}
        self.display_clients: Set[WebSocketServerProtocol] = set()
        self.current_session = None
        
    def get_local_ip(self):
        """Get the local IP address for LAN connection"""
        try:
            # Create a socket to get local IP
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
            return local_ip
        except:
            return "127.0.0.1"
    
    async def register_client(self, websocket: WebSocketServerProtocol, client_type: str, referee_id: int = None):
        """Register a new client connection"""
        self.clients.add(websocket)
        
        if client_type == 'referee' and referee_id:
            self.referee_clients[referee_id] = websocket
            print(f"✅ Referee {referee_id} connected")
            
            # Send all available sessions to the referee
            await self.send_available_sessions(websocket)
            
        elif client_type == 'display':
            self.display_clients.add(websocket)
            print(f"✅ Display connected")
        
        # Send current session info
        if self.current_session:
            await websocket.send(json.dumps({
                'type': 'session_info',
                'session': self.current_session
            }))
    
    async def unregister_client(self, websocket: WebSocketServerProtocol):
        """Unregister a client connection"""
        self.clients.discard(websocket)
        self.display_clients.discard(websocket)
        
        # Remove from referee clients
        referee_id = None
        for rid, ws in list(self.referee_clients.items()):
            if ws == websocket:
                referee_id = rid
                del self.referee_clients[rid]
                break
        
        if referee_id:
            print(f"❌ Referee {referee_id} disconnected")
        else:
            print(f"❌ Client disconnected")
    
    async def send_available_sessions(self, websocket: WebSocketServerProtocol):
        """Send all available sessions to a referee"""
        try:
            conn = self.db.connect()
            cursor = conn.cursor()
            
            # Get active sessions
            cursor.execute('''
                SELECT session_id, category_name, category_type, athlete1_name, 
                       athlete2_name, status FROM live_scoring_sessions
                WHERE status = 'active'
                ORDER BY session_id DESC
            ''')
            
            sessions = cursor.fetchall()
            conn.close()
            
            if sessions:
                for session in sessions:
                    session_data = {
                        'session_id': session[0],
                        'category_name': session[1],
                        'category_type': session[2],
                        'athlete1_name': session[3],
                        'athlete2_name': session[4],
                        'status': session[5]
                    }
                    await websocket.send(json.dumps({
                        'type': 'session_available',
                        'session': session_data
                    }))
            else:
                # Send message if no sessions available
                await websocket.send(json.dumps({
                    'type': 'no_sessions',
                    'message': 'No active scoring sessions available'
                }))
        except Exception as e:
            print(f"Error sending available sessions: {e}")
    
    async def broadcast_to_displays(self, message: dict):
        """Broadcast message to all display clients"""
        if self.display_clients:
            message_str = json.dumps(message)
            await asyncio.gather(
                *[client.send(message_str) for client in self.display_clients],
                return_exceptions=True
            )
    
    async def broadcast_to_all(self, message: dict):
        """Broadcast message to all connected clients"""
        if self.clients:
            message_str = json.dumps(message)
            await asyncio.gather(
                *[client.send(message_str) for client in self.clients],
                return_exceptions=True
            )
    
    async def handle_client_message(self, websocket: WebSocketServerProtocol, message: dict):
        """Handle incoming message from client"""
        msg_type = message.get('type')
        
        if msg_type == 'register':
            client_type = message.get('client_type')
            referee_id = message.get('referee_id')
            await self.register_client(websocket, client_type, referee_id)
            
        elif msg_type == 'start_session':
            await self.start_scoring_session(message.get('data'))
            
        elif msg_type == 'submit_score':
            await self.handle_score_submission(message.get('data'))
            
        elif msg_type == 'finalize_score':
            await self.finalize_score(message.get('data'))
            
        elif msg_type == 'end_session':
            await self.end_scoring_session()
    
    async def start_scoring_session(self, data: dict):
        """Start a new scoring session"""
        conn = self.db.connect()
        cursor = conn.cursor()
        
        # Generate session ID
        session_id = f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        # Create session in database
        cursor.execute('''
            INSERT INTO live_scoring_sessions 
            (session_id, match_id, category_id, category_name, category_type,
             athlete1_id, athlete1_name, athlete2_id, athlete2_name, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        ''', (
            session_id,
            data.get('match_id'),
            data.get('category_id'),
            data.get('category_name'),
            data.get('category_type'),
            data.get('athlete1_id'),
            data.get('athlete1_name'),
            data.get('athlete2_id'),
            data.get('athlete2_name')
        ))
        conn.commit()
        
        self.current_session = {
            'session_id': session_id,
            'category_type': data.get('category_type'),
            'category_name': data.get('category_name'),
            'athlete1_name': data.get('athlete1_name'),
            'athlete2_name': data.get('athlete2_name'),
            'scores': {}
        }
        
        # Broadcast session start to all clients
        await self.broadcast_to_all({
            'type': 'session_started',
            'session': self.current_session
        })
        
        # Also send to all connected referees
        for referee_id, websocket in self.referee_clients.items():
            try:
                await websocket.send(json.dumps({
                    'type': 'session_available',
                    'session': self.current_session
                }))
            except Exception as e:
                print(f"Error sending session to referee {referee_id}: {e}")
        
        print(f"🎯 Session started: {session_id}")
    
    async def handle_score_submission(self, data: dict):
        """Handle score submission from referee"""
        if not self.current_session:
            return
        
        conn = self.db.connect()
        cursor = conn.cursor()
        
        session_id = self.current_session['session_id']
        referee_id = data.get('referee_id')
        referee_name = data.get('referee_name')
        
        # Update or insert score
        cursor.execute('''
            INSERT OR REPLACE INTO live_referee_scores
            (session_id, referee_id, referee_name, athlete1_score, athlete2_score,
             round_number, score_data, is_final)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        ''', (
            session_id,
            referee_id,
            referee_name,
            data.get('athlete1_score', 0),
            data.get('athlete2_score', 0),
            data.get('round_number', 1),
            json.dumps(data.get('score_data', {}))
        ))
        conn.commit()
        
        # Update session scores
        self.current_session['scores'][referee_id] = {
            'referee_name': referee_name,
            'athlete1_score': data.get('athlete1_score', 0),
            'athlete2_score': data.get('athlete2_score', 0)
        }
        
        # Calculate totals
        total_athlete1 = sum(s['athlete1_score'] for s in self.current_session['scores'].values())
        total_athlete2 = sum(s['athlete2_score'] for s in self.current_session['scores'].values())
        
        # Broadcast updated scores to displays
        await self.broadcast_to_displays({
            'type': 'score_update',
            'session_id': session_id,
            'referee_scores': self.current_session['scores'],
            'totals': {
                'athlete1_total': total_athlete1,
                'athlete2_total': total_athlete2
            }
        })
        
        print(f"📊 Score from Referee {referee_id}: {data.get('athlete1_score')} - {data.get('athlete2_score')}")
    
    async def finalize_score(self, data: dict):
        """Finalize scores for current session"""
        if not self.current_session:
            return
        
        conn = self.db.connect()
        cursor = conn.cursor()
        
        # Mark all scores as final
        cursor.execute('''
            UPDATE live_referee_scores
            SET is_final = 1
            WHERE session_id = ?
        ''', (self.current_session['session_id'],))
        conn.commit()
        
        # Broadcast finalization
        await self.broadcast_to_all({
            'type': 'scores_finalized',
            'session_id': self.current_session['session_id']
        })
        
        print(f"✅ Scores finalized for session {self.current_session['session_id']}")
    
    async def end_scoring_session(self):
        """End the current scoring session"""
        if not self.current_session:
            return
        
        conn = self.db.connect()
        cursor = conn.cursor()
        
        # Mark session as completed
        cursor.execute('''
            UPDATE live_scoring_sessions
            SET status = 'completed', completed_at = ?
            WHERE session_id = ?
        ''', (datetime.now().isoformat(), self.current_session['session_id']))
        conn.commit()
        
        session_id = self.current_session['session_id']
        self.current_session = None
        
        # Broadcast session end
        await self.broadcast_to_all({
            'type': 'session_ended',
            'session_id': session_id
        })
        
        print(f"🏁 Session ended: {session_id}")
    
    async def handler(self, websocket: WebSocketServerProtocol):
        """Handle WebSocket connection"""
        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    await self.handle_client_message(websocket, data)
                except json.JSONDecodeError:
                    await websocket.send(json.dumps({'error': 'Invalid JSON'}))
                except Exception as e:
                    print(f"Error handling message: {e}")
                    await websocket.send(json.dumps({'error': str(e)}))
        finally:
            await self.unregister_client(websocket)
    
    async def poll_new_sessions(self):
        """Poll database for new sessions and notify referees"""
        last_session_id = None
        
        while True:
            try:
                await asyncio.sleep(2)  # Check every 2 seconds
                
                conn = self.db.connect()
                cursor = conn.cursor()
                
                # Get the most recent active session
                cursor.execute('''
                    SELECT session_id, category_name, category_type, athlete1_name, 
                           athlete2_name, status FROM live_scoring_sessions
                    WHERE status = 'active'
                    ORDER BY session_id DESC
                    LIMIT 1
                ''')
                
                result = cursor.fetchone()
                conn.close()
                
                if result:
                    session_id = result[0]
                    # Only notify if this is a new session
                    if session_id != last_session_id:
                        last_session_id = session_id
                        session_data = {
                            'session_id': session_id,
                            'category_name': result[1],
                            'category_type': result[2],
                            'athlete1_name': result[3],
                            'athlete2_name': result[4],
                            'status': result[5]
                        }
                        
                        # Send to all connected referees
                        for referee_id, websocket in self.referee_clients.items():
                            try:
                                await websocket.send(json.dumps({
                                    'type': 'session_available',
                                    'session': session_data
                                }))
                            except Exception as e:
                                print(f"Error sending session to referee {referee_id}: {e}")
                        
                        print(f"📢 New session broadcast: {session_id}")
                else:
                    last_session_id = None
            except Exception as e:
                print(f"Error polling sessions: {e}")
    
    async def start(self):
        """Start the WebSocket server"""
        local_ip = self.get_local_ip()
        print(f"🚀 Starting WebSocket server on {local_ip}:{self.port}")
        
        async with websockets.serve(self.handler, self.host, self.port):
            print(f"✅ WebSocket server running")
            print(f"📱 Referees connect to: ws://{local_ip}:{self.port}")
            
            # Start polling for new sessions
            poll_task = asyncio.create_task(self.poll_new_sessions())
            
            try:
                await asyncio.Future()  # Run forever
            except:
                poll_task.cancel()


async def run_server(db, host='0.0.0.0', port=8765):
    """Run the WebSocket server"""
    server = ScoringWebSocketServer(db, host, port)
    await server.start()
