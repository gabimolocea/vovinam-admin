"""
Scoreboard display for external monitor
Shows real-time scores from all referees
"""
import asyncio
import json
from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel, 
                              QFrame, QGridLayout, QTableWidget, QTableWidgetItem)
from PyQt6.QtCore import Qt, QThread, pyqtSignal, QTimer
from PyQt6.QtGui import QFont, QColor
import websockets


class ScoreboardWebSocketClient(QThread):
    """WebSocket client for scoreboard display"""
    message_received = pyqtSignal(dict)
    connection_status = pyqtSignal(bool, str)
    
    def __init__(self, server_url):
        super().__init__()
        self.server_url = server_url
        self.websocket = None
        self.running = True
    
    async def connect_and_run(self):
        """Connect to WebSocket server"""
        try:
            async with websockets.connect(self.server_url) as websocket:
                self.websocket = websocket
                self.connection_status.emit(True, "Connected")
                
                # Register as display client
                await websocket.send(json.dumps({
                    'type': 'register',
                    'client_type': 'display'
                }))
                
                # Receive messages
                async for message in websocket:
                    data = json.loads(message)
                    self.message_received.emit(data)
                    
        except Exception as e:
            self.connection_status.emit(False, f"Connection error: {str(e)}")
    
    def run(self):
        """Run the WebSocket client"""
        asyncio.run(self.connect_and_run())
    
    def stop(self):
        """Stop the WebSocket client"""
        self.running = False


class ScoreboardDisplay(QWidget):
    """Scoreboard display widget for external monitor"""
    
    def __init__(self, server_ip: str = "192.168.1.100", port: int = 8765):
        super().__init__()
        self.server_ip = server_ip
        self.port = port
        self.websocket_client = None
        self.current_session = None
        self.referee_scores = {}
        
        self.setWindowTitle("Vovinam Competition Scoreboard")
        self.showFullScreen()
        self.setStyleSheet("background-color: #1a1a1a;")
        
        self.init_ui()
        self.connect_to_server()
    
    def init_ui(self):
        """Initialize the scoreboard UI"""
        layout = QVBoxLayout()
        layout.setContentsMargins(40, 40, 40, 40)
        layout.setSpacing(30)
        
        # Header with logo and title
        header_layout = QHBoxLayout()
        
        title = QLabel("VOVINAM COMPETITION SCOREBOARD")
        title_font = QFont("Arial", 48, QFont.Weight.Bold)
        title.setFont(title_font)
        title.setStyleSheet("color: #FFD700; text-align: center;")
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        header_layout.addWidget(title)
        
        layout.addLayout(header_layout)
        
        # Session info frame
        self.session_frame = QFrame()
        self.session_frame.setStyleSheet("""
            QFrame {
                background-color: #2a2a2a;
                border: 3px solid #FFD700;
                border-radius: 15px;
                padding: 20px;
            }
        """)
        session_layout = QVBoxLayout()
        
        self.category_label = QLabel("Waiting for session...")
        category_font = QFont("Arial", 36, QFont.Weight.Bold)
        self.category_label.setFont(category_font)
        self.category_label.setStyleSheet("color: white;")
        self.category_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        session_layout.addWidget(self.category_label)
        
        self.session_frame.setLayout(session_layout)
        layout.addWidget(self.session_frame)
        
        # Athletes frame
        athletes_layout = QHBoxLayout()
        athletes_layout.setSpacing(50)
        
        # Red Corner (Athlete 1)
        self.athlete1_frame = self.create_athlete_frame("Red Corner", "Athlete 1", "#F44336")
        athletes_layout.addWidget(self.athlete1_frame)
        
        # VS Label
        vs_label = QLabel("VS")
        vs_font = QFont("Arial", 60, QFont.Weight.Bold)
        vs_label.setFont(vs_font)
        vs_label.setStyleSheet("color: #FFD700;")
        vs_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        vs_label.setMaximumWidth(150)
        athletes_layout.addWidget(vs_label)
        
        # Blue Corner (Athlete 2)
        self.athlete2_frame = self.create_athlete_frame("Blue Corner", "Athlete 2", "#2196F3")
        athletes_layout.addWidget(self.athlete2_frame)
        
        layout.addLayout(athletes_layout)
        
        # Referee scores table
        scores_label = QLabel("REFEREE SCORES")
        scores_font = QFont("Arial", 28, QFont.Weight.Bold)
        scores_label.setFont(scores_font)
        scores_label.setStyleSheet("color: white; margin-top: 20px;")
        scores_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(scores_label)
        
        self.scores_table = QTableWidget()
        self.scores_table.setColumnCount(3)
        self.scores_table.setHorizontalHeaderLabels(["Referee", "Red Corner", "Blue Corner"])
        self.scores_table.horizontalHeader().setStretchLastSection(True)
        self.scores_table.setStyleSheet("""
            QTableWidget {
                background-color: #2a2a2a;
                color: white;
                font-size: 24px;
                gridline-color: #444;
                border: 2px solid #FFD700;
                border-radius: 10px;
            }
            QHeaderView::section {
                background-color: #FFD700;
                color: black;
                font-size: 26px;
                font-weight: bold;
                padding: 10px;
                border: none;
            }
            QTableWidget::item {
                padding: 15px;
            }
        """)
        self.scores_table.setMinimumHeight(300)
        layout.addWidget(self.scores_table)
        
        # Totals frame
        totals_layout = QHBoxLayout()
        totals_layout.setSpacing(50)
        
        self.total1_frame = self.create_total_frame("RED TOTAL", "#F44336")
        totals_layout.addWidget(self.total1_frame)
        
        self.total2_frame = self.create_total_frame("BLUE TOTAL", "#2196F3")
        totals_layout.addWidget(self.total2_frame)
        
        layout.addLayout(totals_layout)
        
        # Connection status
        self.status_label = QLabel("⚫ Connecting to server...")
        self.status_label.setFont(QFont("Arial", 16))
        self.status_label.setStyleSheet("color: #999;")
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.status_label)
        
        self.setLayout(layout)
    
    def create_athlete_frame(self, corner: str, name: str, color: str) -> QFrame:
        """Create athlete info frame"""
        frame = QFrame()
        frame.setStyleSheet(f"""
            QFrame {{
                background-color: #2a2a2a;
                border: 4px solid {color};
                border-radius: 15px;
                padding: 20px;
            }}
        """)
        
        layout = QVBoxLayout()
        
        corner_label = QLabel(corner)
        corner_font = QFont("Arial", 28, QFont.Weight.Bold)
        corner_label.setFont(corner_font)
        corner_label.setStyleSheet(f"color: {color};")
        corner_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(corner_label)
        
        name_label = QLabel(name)
        name_font = QFont("Arial", 32, QFont.Weight.Bold)
        name_label.setFont(name_font)
        name_label.setStyleSheet("color: white;")
        name_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        name_label.setWordWrap(True)
        layout.addWidget(name_label)
        
        if corner == "Red Corner":
            self.athlete1_name_label = name_label
        else:
            self.athlete2_name_label = name_label
        
        frame.setLayout(layout)
        return frame
    
    def create_total_frame(self, title: str, color: str) -> QFrame:
        """Create total score frame"""
        frame = QFrame()
        frame.setStyleSheet(f"""
            QFrame {{
                background-color: #2a2a2a;
                border: 5px solid {color};
                border-radius: 15px;
                padding: 30px;
            }}
        """)
        
        layout = QVBoxLayout()
        
        title_label = QLabel(title)
        title_font = QFont("Arial", 32, QFont.Weight.Bold)
        title_label.setFont(title_font)
        title_label.setStyleSheet(f"color: {color};")
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(title_label)
        
        score_label = QLabel("0.0")
        score_font = QFont("Arial", 80, QFont.Weight.Bold)
        score_label.setFont(score_font)
        score_label.setStyleSheet("color: white;")
        score_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(score_label)
        
        if "RED" in title:
            self.total1_label = score_label
        else:
            self.total2_label = score_label
        
        frame.setLayout(layout)
        return frame
    
    def connect_to_server(self):
        """Connect to WebSocket server"""
        server_url = f"ws://{self.server_ip}:{self.port}"
        
        self.websocket_client = ScoreboardWebSocketClient(server_url)
        self.websocket_client.message_received.connect(self.handle_server_message)
        self.websocket_client.connection_status.connect(self.update_connection_status)
        self.websocket_client.start()
    
    def update_connection_status(self, connected: bool, message: str):
        """Update connection status display"""
        if connected:
            self.status_label.setText("🟢 Connected to Scoring System")
            self.status_label.setStyleSheet("color: #4CAF50;")
        else:
            self.status_label.setText(f"🔴 {message}")
            self.status_label.setStyleSheet("color: #F44336;")
            
            # Try to reconnect after 5 seconds
            QTimer.singleShot(5000, self.connect_to_server)
    
    def handle_server_message(self, message: dict):
        """Handle incoming message from server"""
        msg_type = message.get('type')
        
        if msg_type == 'session_started' or msg_type == 'session_info':
            session = message.get('session', {})
            self.current_session = session
            self.update_session_display()
        
        elif msg_type == 'score_update':
            self.referee_scores = message.get('referee_scores', {})
            totals = message.get('totals', {})
            self.update_scores_display(totals)
        
        elif msg_type == 'session_ended':
            self.current_session = None
            self.category_label.setText("Session Ended - Waiting for next session...")
            self.referee_scores = {}
            self.update_scores_display({'athlete1_total': 0, 'athlete2_total': 0})
        
        elif msg_type == 'scores_finalized':
            self.show_final_scores()
    
    def update_session_display(self):
        """Update session information display"""
        if not self.current_session:
            return
        
        category = self.current_session.get('category_name', 'Unknown Category')
        category_type = self.current_session.get('category_type', '')
        athlete1 = self.current_session.get('athlete1_name', 'Athlete 1')
        athlete2 = self.current_session.get('athlete2_name', 'Athlete 2')
        
        self.category_label.setText(f"{category} - {category_type.upper()}")
        self.athlete1_name_label.setText(athlete1)
        self.athlete2_name_label.setText(athlete2)
    
    def update_scores_display(self, totals: dict):
        """Update referee scores table and totals"""
        # Update table
        self.scores_table.setRowCount(len(self.referee_scores))
        
        row = 0
        for referee_id, score_data in self.referee_scores.items():
            # Referee name
            name_item = QTableWidgetItem(score_data['referee_name'])
            name_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            name_item.setFont(QFont("Arial", 24, QFont.Weight.Bold))
            self.scores_table.setItem(row, 0, name_item)
            
            # Red score
            red_item = QTableWidgetItem(f"{score_data['athlete1_score']:.1f}")
            red_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            red_item.setFont(QFont("Arial", 28, QFont.Weight.Bold))
            red_item.setForeground(QColor("#F44336"))
            self.scores_table.setItem(row, 1, red_item)
            
            # Blue score
            blue_item = QTableWidgetItem(f"{score_data['athlete2_score']:.1f}")
            blue_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            blue_item.setFont(QFont("Arial", 28, QFont.Weight.Bold))
            blue_item.setForeground(QColor("#2196F3"))
            self.scores_table.setItem(row, 2, blue_item)
            
            row += 1
        
        self.scores_table.resizeRowsToContents()
        
        # Update totals
        self.total1_label.setText(f"{totals.get('athlete1_total', 0):.1f}")
        self.total2_label.setText(f"{totals.get('athlete2_total', 0):.1f}")
        
        # Highlight winner
        total1 = totals.get('athlete1_total', 0)
        total2 = totals.get('athlete2_total', 0)
        
        if total1 > total2:
            self.total1_label.setStyleSheet("color: #FFD700;")  # Gold
            self.total2_label.setStyleSheet("color: white;")
        elif total2 > total1:
            self.total2_label.setStyleSheet("color: #FFD700;")  # Gold
            self.total1_label.setStyleSheet("color: white;")
        else:
            self.total1_label.setStyleSheet("color: white;")
            self.total2_label.setStyleSheet("color: white;")
    
    def show_final_scores(self):
        """Show final scores animation"""
        self.category_label.setText("🏆 FINAL SCORES 🏆")
        
    def closeEvent(self, event):
        """Handle window close"""
        if self.websocket_client:
            self.websocket_client.stop()
            self.websocket_client.wait()
        event.accept()
    
    def keyPressEvent(self, event):
        """Handle key press for exiting fullscreen"""
        if event.key() == Qt.Key.Key_Escape:
            self.showNormal()
        elif event.key() == Qt.Key.Key_F11:
            if self.isFullScreen():
                self.showNormal()
            else:
                self.showFullScreen()
