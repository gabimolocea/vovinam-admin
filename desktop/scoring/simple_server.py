"""
Competition Management Server - Flask Web Server for Referee Scoring & Display Monitors
Runs on port 5000, serves mobile referee interface and display monitors
"""
import json
import sys
import os
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.lan_manager import LANManager
from models.db import Database

app = Flask(__name__, template_folder='templates')
CORS(app)

# Initialize LANManager for database access
try:
    # Import Database class
    from models.db import Database
    
    # Try to find athletes.db in the desktop directory
    import os
    db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'athletes.db')
    if not os.path.exists(db_path):
        db_path = 'athletes.db'
    
    # Create Database instance and get connection
    db = Database(db_path)
    db_conn = db.connect()
    
    # Initialize LANManager with the connection
    lan_manager = LANManager(db_conn)
    print(f"Connected to database: {db_path}")
except Exception as e:
    print(f"Error initializing LANManager: {e}")
    import traceback
    traceback.print_exc()
    lan_manager = None

# ============ SERVE HTML INTERFACES ============

@app.route('/')
def index():
    """Home page - redirect to referee or display"""
    return '''
    <html>
    <head>
        <title>Vovinam Competition Management</title>
        <style>
            body { font-family: Arial; text-align: center; padding: 50px; background: #f0f0f0; }
            h1 { color: #667eea; }
            .links { margin-top: 30px; }
            a { display: inline-block; margin: 10px; padding: 15px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; }
            a:hover { background: #764ba2; }
        </style>
    </head>
    <body>
        <h1>🥋 Vovinam Competition Management</h1>
        <p>Select your role:</p>
        <div class="links">
            <a href="/referee">📱 Referee Scoring</a>
            <a href="/display?tatami_id=1">🖥️ Display Monitor</a>
            <a href="/admin">📊 Admin Dashboard</a>
        </div>
    </body>
    </html>
    '''

@app.route('/referee')
def referee_interface():
    """Serve referee scoring interface"""
    try:
        return render_template('referee_scoring.html')
    except Exception as e:
        return f"Error loading referee interface: {str(e)}", 500

@app.route('/display')
def display_interface():
    """Serve display monitor interface"""
    try:
        tatami_id = request.args.get('tatami_id', '1')
        return render_template('display_monitor.html', tatami_id=tatami_id)
    except Exception as e:
        return f"Error loading display interface: {str(e)}", 500

@app.route('/admin')
def admin_dashboard():
    """Serve admin dashboard"""
    return '''
    <html>
    <head>
        <title>Admin Dashboard</title>
        <style>
            body { font-family: Arial; padding: 20px; background: #f9f9f9; }
            h1 { color: #333; }
            .section { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        </style>
    </head>
    <body>
        <h1>📊 Competition Admin Dashboard</h1>
        <div class="section">
            <h2>Tatamis</h2>
            <div id="tatamis"></div>
        </div>
        <div class="section">
            <h2>Active Sessions</h2>
            <div id="sessions"></div>
        </div>
        <script>
            async function loadTatamis() {
                try {
                    const response = await fetch('/api/admin/tatamis');
                    const tatamis = await response.json();
                    const html = tatamis.map(t => `
                        <div>
                            <strong>${t.name}</strong> - ${t.type} (Station ${t.station_number})
                        </div>
                    `).join('');
                    document.getElementById('tatamis').innerHTML = html || 'No tatamis';
                } catch (e) {
                    console.error(e);
                }
            }
            
            async function loadSessions() {
                try {
                    const response = await fetch('/api/admin/sessions');
                    const sessions = await response.json();
                    const html = sessions.map(s => `
                        <div>
                            <strong>${s.category}</strong> (${s.status}) - ${s.athlete1}
                        </div>
                    `).join('');
                    document.getElementById('sessions').innerHTML = html || 'No sessions';
                } catch (e) {
                    console.error(e);
                }
            }
            
            loadTatamis();
            loadSessions();
            setInterval(() => {
                loadSessions();
            }, 2000);
        </script>
    </body>
    </html>
    '''

# ============ REFEREE API ============

@app.route('/api/referee/tatamis', methods=['GET'])
def get_available_tatamis():
    """Get available tatamis for referee to choose from"""
    try:
        if not lan_manager:
            return jsonify({'error': 'Database not initialized'}), 500
        
        tatamis = lan_manager.get_all_tatamis()
        return jsonify([
            {
                'id': t.id,
                'name': t.name,
                'station_number': t.station_number,
                'type': t.type
            }
            for t in tatamis
        ])
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/referee/sessions/<int:tatami_id>', methods=['GET'])
def get_sessions_for_tatami(tatami_id):
    """Get active sessions for a specific tatami"""
    try:
        if not lan_manager:
            return jsonify({'error': 'Database not initialized'}), 500
        
        sessions = lan_manager.get_active_sessions(tatami_id)
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
        print(f"Error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/referee/submit-score', methods=['POST'])
def submit_referee_score():
    """Referee submits score for an athlete/match"""
    try:
        if not lan_manager:
            return jsonify({'error': 'Database not initialized'}), 500
        
        data = request.json
        session_id = data.get('session_id')
        referee_id = data.get('referee_id')
        score_data = data.get('score_data')
        
        # Store in database
        conn = lan_manager.db.connect()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO score_submissions 
            (session_id, referee_id, score_data, submitted_at)
            VALUES (?, ?, ?, ?)
        ''', (
            session_id,
            referee_id,
            json.dumps(score_data),
            datetime.now().isoformat()
        ))
        conn.commit()
        submission_id = cursor.lastrowid
        
        return jsonify({
            'success': True,
            'submission_id': submission_id,
            'message': 'Score submitted successfully'
        }), 201
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'error': str(e)}), 500

# ============ DISPLAY API ============

@app.route('/api/display/<tatami_id>/current-session', methods=['GET'])
def get_current_session_for_display(tatami_id):
    """Get currently active session for display"""
    try:
        if not lan_manager:
            return jsonify({'error': 'Database not initialized'}), 500
        
        sessions = lan_manager.get_active_sessions(int(tatami_id))
        if sessions:
            current = sessions[0]
            submissions = lan_manager.get_session_submissions(current.id)
            
            # Calculate aggregated score
            aggregated = calculate_aggregated_score(submissions)
            
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
                        'score_data': json.loads(s['score_data']) if isinstance(s['score_data'], str) else s['score_data'],
                        'submitted_at': s['submitted_at']
                    }
                    for s in submissions
                ],
                'aggregated_score': aggregated
            })
        else:
            return jsonify({'session': None})
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/display/<tatami_id>/history', methods=['GET'])
def get_session_history_for_display(tatami_id):
    """Get completed sessions for display"""
    try:
        if not lan_manager:
            return jsonify({'error': 'Database not initialized'}), 500
        
        conn = lan_manager.db.connect()
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
            try:
                score_data = json.loads(row[4]) if row[4] else {}
            except:
                score_data = {}
            
            results.append({
                'id': row[0],
                'category': row[1],
                'athlete1': row[2],
                'athlete2': row[3],
                'final_score': score_data,
                'completed_at': row[6]
            })
        
        return jsonify(results)
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'error': str(e)}), 500

# ============ ADMIN API ============

@app.route('/api/admin/tatamis', methods=['GET', 'POST'])
def manage_tatamis():
    """Get tatamis or create new one"""
    try:
        if not lan_manager:
            return jsonify({'error': 'Database not initialized'}), 500
        
        if request.method == 'GET':
            tatamis = lan_manager.get_all_tatamis()
            return jsonify([
                {
                    'id': t.id,
                    'name': t.name,
                    'station_number': t.station_number,
                    'type': t.type
                }
                for t in tatamis
            ])
        
        elif request.method == 'POST':
            data = request.json
            tatami_id = lan_manager.create_tatami(
                data['name'],
                data.get('station_number'),
                data['type']
            )
            return jsonify({'id': tatami_id}), 201
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/sessions', methods=['GET'])
def get_all_sessions():
    """Get all sessions across all tatamis"""
    try:
        if not lan_manager:
            return jsonify({'error': 'Database not initialized'}), 500
        
        conn = lan_manager.db.connect()
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
        print(f"Error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/session/<int:session_id>/scores', methods=['GET'])
def get_session_scores_admin(session_id):
    """Get all referee scores for a session"""
    try:
        if not lan_manager:
            return jsonify({'error': 'Database not initialized'}), 500
        
        submissions = lan_manager.get_session_submissions(session_id)
        aggregated = calculate_aggregated_score(submissions)
        
        return jsonify({
            'session_id': session_id,
            'referee_scores': [
                {
                    'referee_id': s['referee_id'],
                    'score_data': json.loads(s['score_data']) if isinstance(s['score_data'], str) else s['score_data'],
                    'submitted_at': s['submitted_at']
                }
                for s in submissions
            ],
            'aggregated_score': aggregated,
            'score_count': len(submissions)
        })
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'error': str(e)}), 500

# ============ HELPER FUNCTIONS ============

def calculate_aggregated_score(submissions: list) -> dict:
    """Calculate aggregated score from referee submissions"""
    if len(submissions) < 3:
        return {
            'status': 'pending',
            'message': f'Waiting for scores ({len(submissions)}/5)'
        }
    
    try:
        all_scores = []
        for submission in submissions:
            score_data = json.loads(submission['score_data']) if isinstance(submission['score_data'], str) else submission['score_data']
            score_value = score_data.get('total') or score_data.get('score')
            if score_value:
                all_scores.append(float(score_value))
        
        if len(all_scores) < 3:
            return {
                'status': 'pending',
                'message': f'Waiting for {5 - len(all_scores)} more scores'
            }
        
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
        return {
            'status': 'error',
            'message': str(e)
        }

# ============ ERROR HANDLERS ============

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def server_error(error):
    return jsonify({'error': 'Internal server error'}), 500

# ============ INITIALIZATION ============

def run_server(host='0.0.0.0', port=8080, debug=False):
    """Start Flask server"""
    print(f"\n" + "="*60)
    print(f"✅ Flask server starting on http://0.0.0.0:{port}")
    print(f"📱 Access from mobile: http://Gabis-MacBook-Pro.local:{port}/referee")
    print(f"🖥️  Display Monitor: http://Gabis-MacBook-Pro.local:{port}/display?tatami_id=1")
    print(f"📊 Admin: http://Gabis-MacBook-Pro.local:{port}/admin")
    print("="*60 + "\n")
    app.run(host=host, port=port, debug=debug, use_reloader=False, threaded=True)

if __name__ == '__main__':
    run_server()
