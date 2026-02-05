"""
Referee scoring interface for LAN scoring system
"""
import asyncio
import json
from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel, 
                              QPushButton, QDoubleSpinBox, QFrame,
                              QLineEdit, QComboBox, QMessageBox, QGridLayout)
from PyQt6.QtCore import Qt, QThread, pyqtSignal
from PyQt6.QtGui import QFont
import websockets


class WebSocketClientThread(QThread):
    """Thread for WebSocket client communication"""
    message_received = pyqtSignal(dict)
    connection_status = pyqtSignal(bool, str)
    
    def __init__(self, server_url, referee_id, referee_name):
        super().__init__()
        self.server_url = server_url
        self.referee_id = referee_id
        self.referee_name = referee_name
        self.websocket = None
        self.running = True
        self.message_queue = asyncio.Queue()
    
    async def connect_and_run(self):
        """Connect to WebSocket server and handle messages"""
        try:
            async with websockets.connect(self.server_url) as websocket:
                self.websocket = websocket
                self.connection_status.emit(True, "Connected")
                
                # Register as referee client
                await websocket.send(json.dumps({
                    'type': 'register',
                    'client_type': 'referee',
                    'referee_id': self.referee_id
                }))
                
                # Handle incoming messages
                async def receive_messages():
                    async for message in websocket:
                        data = json.loads(message)
                        self.message_received.emit(data)
                
                # Handle outgoing messages
                async def send_messages():
                    while self.running:
                        try:
                            message = await asyncio.wait_for(self.message_queue.get(), timeout=0.1)
                            await websocket.send(json.dumps(message))
                        except asyncio.TimeoutError:
                            continue
                
                await asyncio.gather(receive_messages(), send_messages())
                
        except Exception as e:
            self.connection_status.emit(False, f"Error: {str(e)}")
    
    def run(self):
        """Run the WebSocket client"""
        asyncio.run(self.connect_and_run())
    
    def send_message(self, message: dict):
        """Queue a message to send"""
        asyncio.run_coroutine_threadsafe(self.message_queue.put(message), asyncio.get_event_loop())
    
    def stop(self):
        """Stop the WebSocket client"""
        self.running = False


class RefereeScoreWidget(QWidget):
    """Widget for referee to input scores"""
    
    def __init__(self, db, referee_id: int = 1, referee_name: str = "Referee"):
        super().__init__()
        self.db = db
        self.referee_id = referee_id
        self.referee_name = referee_name
        self.websocket_client = None
        self.current_session = None
        
        self.setWindowTitle(f"Referee {referee_id} - Scoring Panel")
        self.resize(900, 700)
        self.init_ui()
    
    def init_ui(self):
        """Initialize the UI"""
        layout = QVBoxLayout()
        layout.setSpacing(20)
        
        # Header
        header = QLabel(f"Referee {self.referee_id} Scoring Panel")
        font = QFont()
        font.setPointSize(18)
        font.setBold(True)
        header.setFont(font)
        header.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(header)
        
        # Connection section
        conn_layout = QHBoxLayout()
        
        conn_label = QLabel("Server IP:")
        self.server_input = QLineEdit("127.0.0.1")
        self.server_input.setPlaceholderText("Enter server IP address (e.g., 192.168.1.100)")
        self.server_input.setMinimumHeight(35)
        
        self.port_input = QLineEdit("8765")
        self.port_input.setMaximumWidth(80)
        self.port_input.setMinimumHeight(35)
        
        self.connect_btn = QPushButton("Connect")
        self.connect_btn.setMinimumHeight(35)
        self.connect_btn.setStyleSheet("""
            QPushButton {
                background-color: #4CAF50;
                color: white;
                border-radius: 5px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #45a049;
            }
        """)
        self.connect_btn.clicked.connect(self.connect_to_server)
        
        self.disconnect_btn = QPushButton("Disconnect")
        self.disconnect_btn.setMinimumHeight(35)
        self.disconnect_btn.setStyleSheet("""
            QPushButton {
                background-color: #f44336;
                color: white;
                border-radius: 5px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #da190b;
            }
        """)
        self.disconnect_btn.clicked.connect(self.disconnect_from_server)
        self.disconnect_btn.setEnabled(False)
        
        self.status_label = QLabel("Not Connected")
        self.status_label.setStyleSheet("color: red; font-weight: bold;")
        
        conn_layout.addWidget(conn_label)
        conn_layout.addWidget(self.server_input)
        conn_layout.addWidget(QLabel("Port:"))
        conn_layout.addWidget(self.port_input)
        conn_layout.addWidget(self.connect_btn)
        conn_layout.addWidget(self.disconnect_btn)
        conn_layout.addWidget(self.status_label)
        conn_layout.addStretch()
        
        layout.addLayout(conn_layout)
        
        # Session selection frame (initially hidden)
        self.session_select_frame = QFrame()
        self.session_select_frame.setFrameStyle(QFrame.Shape.Box)
        self.session_select_frame.setStyleSheet("""
            QFrame {
                background-color: #fff3e0;
                border: 2px solid #FF9800;
                border-radius: 8px;
                padding: 15px;
            }
        """)
        session_select_layout = QVBoxLayout()
        
        select_label = QLabel("📊 Select Scoring Session:")
        select_font = QFont("Arial", 12, QFont.Weight.Bold)
        select_label.setFont(select_font)
        select_label.setStyleSheet("color: #FF9800;")
        session_select_layout.addWidget(select_label)
        
        sessions_layout = QHBoxLayout()
        
        self.session_combo = QComboBox()
        self.session_combo.setMinimumHeight(40)
        self.session_combo.setFont(QFont("Arial", 12))
        sessions_layout.addWidget(self.session_combo)
        
        join_btn = QPushButton("Join Session")
        join_btn.setMinimumHeight(40)
        join_btn.setFont(QFont("Arial", 12, QFont.Weight.Bold))
        join_btn.setStyleSheet("""
            QPushButton {
                background-color: #FF9800;
                color: white;
                border-radius: 5px;
            }
            QPushButton:hover {
                background-color: #F57C00;
            }
        """)
        join_btn.clicked.connect(self.join_session)
        sessions_layout.addWidget(join_btn)
        
        session_select_layout.addLayout(sessions_layout)
        self.session_select_frame.setLayout(session_select_layout)
        self.session_select_frame.setVisible(False)
        layout.addWidget(self.session_select_frame)
        
        # Session info
        self.session_frame = QFrame()
        self.session_frame.setFrameStyle(QFrame.Shape.Box)
        self.session_frame.setStyleSheet("""
            QFrame {
                background-color: #f0f0f0;
                border: 2px solid #2196F3;
                border-radius: 8px;
                padding: 15px;
            }
        """)
        session_layout = QVBoxLayout()
        
        self.session_label = QLabel("No active session")
        session_font = QFont()
        session_font.setPointSize(14)
        session_font.setBold(True)
        self.session_label.setFont(session_font)
        session_layout.addWidget(self.session_label)
        
        self.athletes_label = QLabel("")
        self.athletes_label.setFont(QFont("Arial", 12))
        session_layout.addWidget(self.athletes_label)
        
        self.session_frame.setLayout(session_layout)
        self.session_frame.setVisible(False)
        layout.addWidget(self.session_frame)
        
        # Scoring section
        scoring_frame = QFrame()
        scoring_frame.setFrameStyle(QFrame.Shape.Box)
        scoring_frame.setStyleSheet("""
            QFrame {
                background-color: white;
                border: 2px solid #4CAF50;
                border-radius: 8px;
                padding: 20px;
            }
        """)
        scoring_layout = QGridLayout()
        scoring_layout.setSpacing(15)
        
        # Athlete 1 (Red Corner) scoring
        red_label = QLabel("🔴 Red Corner")
        red_label.setFont(QFont("Arial", 14, QFont.Weight.Bold))
        red_label.setStyleSheet("color: #F44336;")
        scoring_layout.addWidget(red_label, 0, 0)
        
        self.athlete1_score = QDoubleSpinBox()
        self.athlete1_score.setDecimals(1)
        self.athlete1_score.setMinimum(0)
        self.athlete1_score.setMaximum(10)
        self.athlete1_score.setSingleStep(0.1)
        self.athlete1_score.setFont(QFont("Arial", 24, QFont.Weight.Bold))
        self.athlete1_score.setMinimumHeight(60)
        self.athlete1_score.setAlignment(Qt.AlignmentFlag.AlignCenter)
        scoring_layout.addWidget(self.athlete1_score, 1, 0)
        
        # Quick score buttons for Athlete 1
        quick_layout1 = QHBoxLayout()
        for score in [5.0, 6.0, 7.0, 8.0, 9.0, 10.0]:
            btn = QPushButton(str(score))
            btn.setMinimumHeight(40)
            btn.clicked.connect(lambda checked, s=score: self.athlete1_score.setValue(s))
            quick_layout1.addWidget(btn)
        scoring_layout.addLayout(quick_layout1, 2, 0)
        
        # VS Separator
        vs_label = QLabel("VS")
        vs_label.setFont(QFont("Arial", 20, QFont.Weight.Bold))
        vs_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        vs_label.setStyleSheet("color: #666;")
        scoring_layout.addWidget(vs_label, 1, 1)
        
        # Athlete 2 (Blue Corner) scoring
        blue_label = QLabel("🔵 Blue Corner")
        blue_label.setFont(QFont("Arial", 14, QFont.Weight.Bold))
        blue_label.setStyleSheet("color: #2196F3;")
        scoring_layout.addWidget(blue_label, 0, 2)
        
        self.athlete2_score = QDoubleSpinBox()
        self.athlete2_score.setDecimals(1)
        self.athlete2_score.setMinimum(0)
        self.athlete2_score.setMaximum(10)
        self.athlete2_score.setSingleStep(0.1)
        self.athlete2_score.setFont(QFont("Arial", 24, QFont.Weight.Bold))
        self.athlete2_score.setMinimumHeight(60)
        self.athlete2_score.setAlignment(Qt.AlignmentFlag.AlignCenter)
        scoring_layout.addWidget(self.athlete2_score, 1, 2)
        
        # Quick score buttons for Athlete 2
        quick_layout2 = QHBoxLayout()
        for score in [5.0, 6.0, 7.0, 8.0, 9.0, 10.0]:
            btn = QPushButton(str(score))
            btn.setMinimumHeight(40)
            btn.clicked.connect(lambda checked, s=score: self.athlete2_score.setValue(s))
            quick_layout2.addWidget(btn)
        scoring_layout.addLayout(quick_layout2, 2, 2)
        
        scoring_frame.setLayout(scoring_layout)
        scoring_frame.setVisible(False)
        self.scoring_frame = scoring_frame
        layout.addWidget(scoring_frame)
        
        # Action buttons
        button_layout = QHBoxLayout()
        button_layout.setSpacing(15)
        
        self.submit_btn = QPushButton("📤 Submit Score")
        self.submit_btn.setMinimumHeight(50)
        self.submit_btn.setFont(QFont("Arial", 14, QFont.Weight.Bold))
        self.submit_btn.setStyleSheet("""
            QPushButton {
                background-color: #4CAF50;
                color: white;
                border-radius: 8px;
            }
            QPushButton:hover {
                background-color: #45a049;
            }
            QPushButton:disabled {
                background-color: #ccc;
            }
        """)
        self.submit_btn.clicked.connect(self.submit_score)
        self.submit_btn.setEnabled(False)
        button_layout.addWidget(self.submit_btn)
        
        self.reset_btn = QPushButton("🔄 Reset")
        self.reset_btn.setMinimumHeight(50)
        self.reset_btn.setFont(QFont("Arial", 14))
        self.reset_btn.clicked.connect(self.reset_scores)
        self.reset_btn.setEnabled(False)
        button_layout.addWidget(self.reset_btn)
        
        layout.addLayout(button_layout)
        
        layout.addStretch()
        self.setLayout(layout)
    
    def connect_to_server(self):
        """Connect to WebSocket server"""
        server_ip = self.server_input.text()
        port = self.port_input.text()
        server_url = f"ws://{server_ip}:{port}"
        
        self.websocket_client = WebSocketClientThread(server_url, self.referee_id, self.referee_name)
        self.websocket_client.message_received.connect(self.handle_server_message)
        self.websocket_client.connection_status.connect(self.update_connection_status)
        self.websocket_client.start()
        
        self.connect_btn.setEnabled(False)
        self.server_input.setEnabled(False)
        self.port_input.setEnabled(False)
        self.status_label.setText("Connecting...")
        self.status_label.setStyleSheet("color: orange; font-weight: bold;")
    
    def disconnect_from_server(self):
        """Disconnect from WebSocket server"""
        if self.websocket_client:
            self.websocket_client.stop()
            self.websocket_client.wait()
            self.websocket_client = None
        
        self.connect_btn.setEnabled(True)
        self.disconnect_btn.setEnabled(False)
        self.server_input.setEnabled(True)
        self.port_input.setEnabled(True)
        self.status_label.setText("Disconnected")
        self.status_label.setStyleSheet("color: red; font-weight: bold;")
        
        self.session_select_frame.setVisible(False)
        self.session_frame.setVisible(False)
        self.scoring_frame.setVisible(False)
        self.current_session = None
        self.submit_btn.setEnabled(False)
        self.reset_btn.setEnabled(False)
    
    def update_connection_status(self, connected: bool, message: str):
        """Update connection status"""
        if connected:
            self.status_label.setText("✅ Connected")
            self.status_label.setStyleSheet("color: green; font-weight: bold;")
            self.connect_btn.setEnabled(False)
            self.disconnect_btn.setEnabled(True)
            self.server_input.setEnabled(False)
            self.port_input.setEnabled(False)
            self.show_session_selector()
        else:
            self.status_label.setText(f"❌ {message}")
            self.status_label.setStyleSheet("color: red; font-weight: bold;")
            self.connect_btn.setEnabled(True)
            self.disconnect_btn.setEnabled(False)
            self.submit_btn.setEnabled(False)
            self.session_select_frame.setVisible(False)
    
    def show_session_selector(self):
        """Show session selection interface"""
        self.session_select_frame.setVisible(True)
        self.session_combo.clear()
        self.session_combo.addItem("⏳ Waiting for sessions...")
        self.submit_btn.setEnabled(False)
    
    def join_session(self):
        """Join the selected session"""
        if self.session_combo.count() == 0 or self.session_combo.currentData() is None:
            QMessageBox.warning(self, "Error", "No session selected")
            return
        
        session_data = self.session_combo.currentData()
        if isinstance(session_data, dict):
            self.current_session = session_data
            self.session_select_frame.setVisible(False)
            self.session_frame.setVisible(True)
            self.scoring_frame.setVisible(True)
            self.update_session_display()
            self.submit_btn.setEnabled(True)
            self.reset_btn.setEnabled(True)
        else:
            QMessageBox.warning(self, "Error", "Invalid session data. Please select a valid session.")
    
    def handle_server_message(self, message: dict):
        """Handle incoming message from server"""
        msg_type = message.get('type')
        
        if msg_type in ['session_started', 'session_available', 'session_info']:
            session = message.get('session', {})
            
            # Add to session selector if not already there
            category = session.get('category_name', 'Unknown')
            athlete1 = session.get('athlete1_name', 'Athlete 1')
            athlete2 = session.get('athlete2_name', 'Athlete 2')
            
            display_text = f"📊 {category}"
            display_text += f" - 🔴 {athlete1}"
            if athlete2:
                display_text += f" 🔵 {athlete2}"
            
            # Check if session already exists in combo box
            for i in range(self.session_combo.count()):
                if self.session_combo.itemData(i) and self.session_combo.itemData(i).get('session_id') == session.get('session_id'):
                    return  # Already exists
            
            self.session_combo.addItem(display_text, session)
        
        elif msg_type == 'no_sessions':
            if self.session_combo.count() == 1 and self.session_combo.itemText(0) == "⏳ Waiting for sessions...":
                self.session_combo.setItemText(0, "❌ No sessions available")
        
        elif msg_type == 'session_ended':
            self.current_session = None
            self.session_label.setText("Session ended")
            self.athletes_label.setText("")
            self.submit_btn.setEnabled(False)
            self.reset_btn.setEnabled(False)
            self.session_frame.setVisible(False)
            self.scoring_frame.setVisible(False)
            self.session_select_frame.setVisible(True)
        
        elif msg_type == 'scores_finalized':
            QMessageBox.information(self, "Success", "Scores have been finalized!")
            self.reset_scores()
    
    def update_session_display(self):
        """Update session display"""
        if not self.current_session:
            return
        
        category = self.current_session.get('category_name', 'Unknown')
        athlete1 = self.current_session.get('athlete1_name', 'Athlete 1')
        athlete2 = self.current_session.get('athlete2_name', 'Athlete 2')
        
        self.session_label.setText(f"📊 Active Session: {category}")
        self.athletes_label.setText(f"🔴 {athlete1}  VS  🔵 {athlete2}")
    
    def submit_score(self):
        """Submit score to server"""
        if not self.websocket_client or not self.current_session:
            QMessageBox.warning(self, "Error", "Not connected to server or no active session")
            return
        
        score_data = {
            'type': 'submit_score',
            'data': {
                'session_id': self.current_session.get('session_id'),
                'referee_id': self.referee_id,
                'referee_name': self.referee_name,
                'athlete1_score': self.athlete1_score.value(),
                'athlete2_score': self.athlete2_score.value(),
                'round_number': 1
            }
        }
        
        self.websocket_client.send_message(score_data)
        QMessageBox.information(self, "Success", "Score submitted successfully!")
    
    def reset_scores(self):
        """Reset score inputs"""
        self.athlete1_score.setValue(0.0)
        self.athlete2_score.setValue(0.0)
    
    def closeEvent(self, event):
        """Handle window close"""
        if self.websocket_client:
            self.websocket_client.stop()
            self.websocket_client.wait()
        event.accept()
