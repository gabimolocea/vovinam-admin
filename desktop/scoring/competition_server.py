"""
Enhanced Competition Management Server with Web-Based Referee & Display Interfaces
Runs on desktop app, serves mobile referee scoring and display monitors via HTTP/WebSocket
"""
import asyncio
import websockets
import json
from datetime import datetime
from typing import Dict, List, Set
from dataclasses import asdict
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import threading
from models.lan_manager import LANManager

app = Flask(__name__)
CORS(app)

class CompetitionServer:
    """Manages entire competition: tatamis, sessions, referees, displays, scores"""
    
    def __init__(self, db_path: str = "athletes.db"):
        self.lan_manager = LANManager(db_path)
        self.db = self.lan_manager.db
        
        # WebSocket client tracking
        self.referees: Dict[str, websockets.WebSocketServerProtocol] = {}  # referee_id -> ws
        self.displays: Dict[str, Set[websockets.WebSocketServerProtocol]] = {}  # tatami_id -> {ws...}
        self.admin_clients: Set[websockets.WebSocketServerProtocol] = set()
        
        # Session tracking
        self.active_sessions: Dict[int, dict] = {}  # session_id -> session_data
        self.session_scores: Dict[int, Dict[str, float]] = {}  # session_id -> {referee_id -> score}
    
    # ============ REFEREE MOBILE INTERFACE ============
    
    @app.route('/api/referee/tatamis', methods=['GET'])
    def get_available_tatamis(self):
        """Get available tatamis for referee to choose from"""
        try:
            tatamis = self.lan_manager.get_all_tatamis()
            return jsonify([asdict(t) for t in tatamis])
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/referee/sessions/<int:tatami_id>', methods=['GET'])
    def get_sessions_for_tatami(self, tatami_id):
        """Get active sessions for a specific tatami"""
        try:
            sessions = self.lan_manager.get_active_sessions(tatami_id)
            return jsonify([
                {
                    'id': s.id,
                    'category_name': s.category_name,
                    'category_type': s.category_type,
                    'athlete1_name': s.athlete1_name,
                    'athlete2_name': s.athlete2_name,
                    'status': s.status,
                    'started_at': s.started_at,
                }
                for s in sessions
            ])
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/referee/submit-score', methods=['POST'])
    def submit_referee_score(self):
        """Referee submits score for an athlete/match"""
        try:
            data = request.json
            session_id = data.get('session_id')
            referee_id = data.get('referee_id')  # Device ID or name
            score_data = data.get('score_data')  # {technique: 8.5, power: 9.0, ...}
            
            # Store in database
            submission = {
                'session_id': session_id,
                'referee_id': referee_id,
                'score_data': json.dumps(score_data),
                'submitted_at': datetime.now().isoformat()
            }
            
            # Save to score_submissions table
            conn = self.db.connect()
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO score_submissions 
                (session_id, referee_id, score_data, submitted_at)
                VALUES (?, ?, ?, ?)
            ''', (
                session_id,
                referee_id,
                submission['score_data'],
                submission['submitted_at']
            ))
            conn.commit()
            submission_id = cursor.lastrowid
            
            # Broadcast to display monitors
            await self.broadcast_score_to_displays(
                session_id,
                referee_id,
                score_data
            )
            
            # Broadcast to admin
            await self.broadcast_to_admin({
                'type': 'score_submitted',
                'session_id': session_id,
                'referee_id': referee_id,
                'score_data': score_data,
                'timestamp': datetime.now().isoformat()
            })
            
            return jsonify({
                'success': True,
                'submission_id': submission_id,
                'message': 'Score submitted and displayed'
            }), 201
            
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    # ============ DISPLAY/MONITOR INTERFACE ============
    
    @app.route('/display/<tatami_id>')
    def display_monitor(self, tatami_id):
        """Serve monitor/display interface for a tatami"""
        try:
            tatami = self.lan_manager.get_tatami_by_id(int(tatami_id))
            if not tatami:
                return "Tatami not found", 404
            
            return render_template('display_monitor.html', 
                                 tatami_id=tatami_id,
                                 tatami_name=tatami.name)
        except Exception as e:
            return f"Error: {str(e)}", 500
    
    @app.route('/api/display/<tatami_id>/current-session', methods=['GET'])
    def get_current_session_for_display(self, tatami_id):
        """Get currently active session for display"""
        try:
            sessions = self.lan_manager.get_active_sessions(int(tatami_id))
            if sessions:
                current = sessions[0]  # Most recent
                submissions = self.lan_manager.get_session_submissions(current.id)
                
                return jsonify({
                    'session': {
                        'id': current.id,
                        'category_name': current.category_name,
                        'category_type': current.category_type,
                        'athlete1_name': current.athlete1_name,
                        'athlete2_name': current.athlete2_name,
                    },
                    'submissions': [
                        {
                            'referee_id': s['referee_id'],
                            'score_data': json.loads(s['score_data']),
                            'submitted_at': s['submitted_at']
                        }
                        for s in submissions
                    ],
                    'aggregated_score': self.calculate_aggregated_score(submissions)
                })
            else:
                return jsonify({'session': None})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/display/<tatami_id>/history', methods=['GET'])
    def get_session_history_for_display(self, tatami_id):
        """Get completed sessions for display (leaderboard/results)"""
        try:
            conn = self.db.connect()
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, category_name, athlete1_name, athlete2_name, 
                       score_data, status, completed_at
                FROM scoring_sessions
                WHERE tatami_id = ? AND status = 'completed'
                ORDER BY completed_at DESC
                LIMIT 20
            ''', (int(tatami_id),))
            
            results = []
            for row in cursor.fetchall():
                results.append({
                    'id': row[0],
                    'category': row[1],
                    'athlete1': row[2],
                    'athlete2': row[3],
                    'final_score': json.loads(row[4]),
                    'completed_at': row[6]
                })
            
            return jsonify(results)
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    # ============ ADMIN CONTROL PANEL ============
    
    @app.route('/admin')
    def admin_dashboard(self):
        """Serve admin control panel"""
        return render_template('admin_dashboard.html')
    
    @app.route('/api/admin/tatamis', methods=['GET', 'POST', 'PUT', 'DELETE'])
    def manage_tatamis(self):
        """CRUD for tatamis"""
        if request.method == 'GET':
            tatamis = self.lan_manager.get_all_tatamis()
            return jsonify([asdict(t) for t in tatamis])
        
        elif request.method == 'POST':
            data = request.json
            tatami_id = self.lan_manager.create_tatami(
                data['name'],
                data.get('station_number'),
                data['type']
            )
            return jsonify({'id': tatami_id}), 201
        
        elif request.method == 'PUT':
            tatami_id = request.json.get('id')
            data = request.json
            conn = self.db.connect()
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE tatamis SET name = ?, station_number = ?, type = ?
                WHERE id = ?
            ''', (data['name'], data.get('station_number'), data['type'], tatami_id))
            conn.commit()
            return jsonify({'success': True})
        
        elif request.method == 'DELETE':
            tatami_id = request.json.get('id')
            conn = self.db.connect()
            cursor = conn.cursor()
            cursor.execute('DELETE FROM tatamis WHERE id = ?', (tatami_id,))
            conn.commit()
            return jsonify({'success': True})
    
    @app.route('/api/admin/sessions', methods=['GET'])
    def get_all_sessions(self):
        """Get all sessions across all tatamis"""
        try:
            conn = self.db.connect()
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, tatami_id, category_name, category_type, 
                       athlete1_name, athlete2_name, status, started_at, completed_at
                FROM scoring_sessions
                ORDER BY started_at DESC
            ''')
            
            sessions = []
            for row in cursor.fetchall():
                sessions.append({
                    'id': row[0],
                    'tatami_id': row[1],
                    'category': row[2],
                    'type': row[3],
                    'athlete1': row[4],
                    'athlete2': row[5],
                    'status': row[6],
                    'started_at': row[7],
                    'completed_at': row[8]
                })
            
            return jsonify(sessions)
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/admin/session/<int:session_id>/scores', methods=['GET'])
    def get_session_scores_admin(self, session_id):
        """Get all referee scores for a session (admin view)"""
        try:
            submissions = self.lan_manager.get_session_submissions(session_id)
            aggregated = self.calculate_aggregated_score(submissions)
            
            return jsonify({
                'session_id': session_id,
                'referee_scores': [
                    {
                        'referee_id': s['referee_id'],
                        'score_data': json.loads(s['score_data']),
                        'submitted_at': s['submitted_at']
                    }
                    for s in submissions
                ],
                'aggregated_score': aggregated,
                'score_count': len(submissions)
            })
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/admin/session/<int:session_id>/approve', methods=['POST'])
    def approve_session_scores(self, session_id):
        """Admin approves final scores for a session"""
        try:
            data = request.json
            admin_id = data.get('admin_id')
            
            # Update session status
            conn = self.db.connect()
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE scoring_sessions
                SET status = 'approved', completed_at = ?
                WHERE id = ?
            ''', (datetime.now().isoformat(), session_id))
            conn.commit()
            
            # Broadcast approval to displays
            await self.broadcast_to_displays_for_session(session_id, {
                'type': 'scores_approved',
                'session_id': session_id,
                'message': 'Final scores approved'
            })
            
            # Broadcast to admin
            await self.broadcast_to_admin({
                'type': 'session_approved',
                'session_id': session_id,
                'approved_by': admin_id,
                'timestamp': datetime.now().isoformat()
            })
            
            return jsonify({'success': True})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    # ============ HELPER FUNCTIONS ============
    
    def calculate_aggregated_score(self, submissions: List[dict]) -> dict:
        """
        Aggregate scores from multiple referees
        For numeric scores: exclude high/low, average middle 3
        """
        if len(submissions) < 3:
            return {'status': 'pending', 'message': f'Waiting for scores ({len(submissions)}/5)'}
        
        try:
            # Collect all scores
            all_scores = []
            for submission in submissions:
                score_data = json.loads(submission['score_data'])
                # Assuming score_data has 'total' or numeric value
                score_value = score_data.get('total') or score_data.get('score')
                if score_value:
                    all_scores.append(float(score_value))
            
            if len(all_scores) < 3:
                return {'status': 'pending', 'message': f'Waiting for {5 - len(all_scores)} more scores'}
            
            # Sort and remove high/low
            all_scores.sort()
            middle_scores = all_scores[1:-1] if len(all_scores) >= 3 else all_scores
            
            # Calculate average
            average = sum(middle_scores) / len(middle_scores)
            
            return {
                'status': 'complete',
                'final_score': round(average, 2),
                'referee_count': len(submissions),
                'all_scores': all_scores,
                'aggregation_method': 'exclude_high_low_average_middle_3'
            }
        except Exception as e:
            return {'status': 'error', 'message': str(e)}
    
    async def broadcast_score_to_displays(self, session_id: int, referee_id: str, score_data: dict):
        """Broadcast score update to all display monitors for this tatami"""
        try:
            # Get tatami_id from session
            conn = self.db.connect()
            cursor = conn.cursor()
            cursor.execute('SELECT tatami_id FROM scoring_sessions WHERE id = ?', (session_id,))
            result = cursor.fetchone()
            
            if result:
                tatami_id = str(result[0])
                if tatami_id in self.displays:
                    message = json.dumps({
                        'type': 'score_updated',
                        'session_id': session_id,
                        'referee_id': referee_id,
                        'score_data': score_data,
                        'timestamp': datetime.now().isoformat()
                    })
                    
                    # Send to all display clients for this tatami
                    for display_ws in self.displays[tatami_id]:
                        await display_ws.send(message)
        except Exception as e:
            print(f"Error broadcasting to displays: {e}")
    
    async def broadcast_to_displays_for_session(self, session_id: int, data: dict):
        """Broadcast message to displays for session's tatami"""
        try:
            conn = self.db.connect()
            cursor = conn.cursor()
            cursor.execute('SELECT tatami_id FROM scoring_sessions WHERE id = ?', (session_id,))
            result = cursor.fetchone()
            
            if result and str(result[0]) in self.displays:
                message = json.dumps(data)
                for display_ws in self.displays[str(result[0])]:
                    await display_ws.send(message)
        except Exception as e:
            print(f"Error: {e}")
    
    async def broadcast_to_admin(self, data: dict):
        """Broadcast message to all admin clients"""
        try:
            message = json.dumps(data)
            for admin_ws in self.admin_clients:
                await admin_ws.send(message)
        except Exception as e:
            print(f"Error broadcasting to admin: {e}")
    
    # ============ WEBSOCKET HANDLERS ============
    
    async def websocket_handler(self, websocket, path):
        """Handle WebSocket connections from referees, displays, and admin"""
        try:
            # First message identifies the client
            message = await websocket.recv()
            data = json.loads(message)
            client_type = data.get('type')  # 'referee', 'display', 'admin'
            client_id = data.get('id')
            
            if client_type == 'referee':
                self.referees[client_id] = websocket
                print(f"Referee {client_id} connected")
                
                # Listen for score submissions
                async for msg in websocket:
                    score_msg = json.loads(msg)
                    await self.handle_referee_score(score_msg)
            
            elif client_type == 'display':
                tatami_id = data.get('tatami_id')
                if tatami_id not in self.displays:
                    self.displays[tatami_id] = set()
                self.displays[tatami_id].add(websocket)
                print(f"Display for tatami {tatami_id} connected")
                
                # Keep connection alive
                async for msg in websocket:
                    pass
            
            elif client_type == 'admin':
                self.admin_clients.add(websocket)
                print("Admin client connected")
                
                # Listen for admin commands
                async for msg in websocket:
                    admin_msg = json.loads(msg)
                    await self.handle_admin_command(admin_msg)
        
        except websockets.exceptions.ConnectionClosed:
            # Clean up on disconnect
            for client_dict in [self.referees]:
                for cid, ws in list(client_dict.items()):
                    if ws == websocket:
                        del client_dict[cid]
                        print(f"Client {cid} disconnected")
            
            if websocket in self.admin_clients:
                self.admin_clients.remove(websocket)
                print("Admin client disconnected")
            
            for tatami_displays in self.displays.values():
                if websocket in tatami_displays:
                    tatami_displays.remove(websocket)
                    print("Display client disconnected")
    
    async def handle_referee_score(self, score_msg: dict):
        """Process score submission from referee"""
        try:
            session_id = score_msg.get('session_id')
            referee_id = score_msg.get('referee_id')
            score_data = score_msg.get('score_data')
            
            # Store score
            submission = {
                'session_id': session_id,
                'referee_id': referee_id,
                'score_data': json.dumps(score_data),
                'submitted_at': datetime.now().isoformat()
            }
            
            conn = self.db.connect()
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO score_submissions 
                (session_id, referee_id, score_data, submitted_at)
                VALUES (?, ?, ?, ?)
            ''', tuple(submission.values()))
            conn.commit()
            
            # Broadcast to displays
            await self.broadcast_score_to_displays(session_id, referee_id, score_data)
            
            # Broadcast to admin
            await self.broadcast_to_admin({
                'type': 'score_submitted',
                'session_id': session_id,
                'referee_id': referee_id,
                'score_data': score_data
            })
        except Exception as e:
            print(f"Error handling referee score: {e}")
    
    async def handle_admin_command(self, command: dict):
        """Process admin commands (approve, reject, etc.)"""
        cmd_type = command.get('type')
        
        if cmd_type == 'approve_session':
            session_id = command.get('session_id')
            await self.approve_session_scores(session_id)
        
        elif cmd_type == 'end_session':
            session_id = command.get('session_id')
            # ... handle session ending


# ============ INITIALIZATION ============

def start_web_server(port: int = 5000):
    """Start Flask web server in a separate thread"""
    app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)


async def start_websocket_server(host: str = 'localhost', port: int = 8765):
    """Start WebSocket server for real-time communication"""
    competition = CompetitionServer()
    async with websockets.serve(competition.websocket_handler, host, port):
        print(f"WebSocket server running on ws://{host}:{port}")
        await asyncio.Future()  # Run forever


def run_servers():
    """Start both Flask and WebSocket servers"""
    import threading
    
    # Start Flask in thread
    flask_thread = threading.Thread(
        target=start_web_server,
        daemon=True
    )
    flask_thread.start()
    
    # Start WebSocket server (blocks)
    asyncio.run(start_websocket_server())


if __name__ == '__main__':
    run_servers()
