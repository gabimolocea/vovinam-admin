"""
Server control panel for managing scoring sessions
"""
import asyncio
import json
from datetime import datetime
from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel, 
                              QPushButton, QLineEdit, QComboBox, QFrame,
                              QTextEdit, QGroupBox, QMessageBox)
from PyQt6.QtCore import Qt, QThread, pyqtSignal
from PyQt6.QtGui import QFont


class ServerControlPanel(QWidget):
    """Control panel for WebSocket server"""
    
    def __init__(self, db, server_ip: str, port: int):
        super().__init__()
        self.db = db
        self.server_ip = server_ip
        self.port = port
        self.current_session = None
        
        self.setWindowTitle("Server Control Panel")
        self.resize(900, 700)
        self.init_ui()
    
    def init_ui(self):
        """Initialize the UI"""
        layout = QVBoxLayout()
        layout.setSpacing(20)
        
        # Header
        header = QLabel("🖥️ Scoring Server Control Panel")
        header_font = QFont("Arial", 20, QFont.Weight.Bold)
        header.setFont(header_font)
        header.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(header)
        
        # Server info
        info_frame = QFrame()
        info_frame.setFrameStyle(QFrame.Shape.Box)
        info_frame.setStyleSheet("""
            QFrame {
                background-color: #e8f5e9;
                border: 2px solid #4CAF50;
                border-radius: 8px;
                padding: 15px;
            }
        """)
        info_layout = QVBoxLayout()
        
        status_label = QLabel("✅ Server Running")
        status_label.setFont(QFont("Arial", 16, QFont.Weight.Bold))
        status_label.setStyleSheet("color: #4CAF50;")
        info_layout.addWidget(status_label)
        
        ip_label = QLabel(f"📱 Referees & Scoreboard connect to: ws://{self.server_ip}:{self.port}")
        ip_label.setFont(QFont("Arial", 14))
        ip_label.setStyleSheet("color: #333;")
        info_layout.addWidget(ip_label)
        
        info_frame.setLayout(info_layout)
        layout.addWidget(info_frame)
        
        # Start Session Group
        session_group = QGroupBox("Start New Scoring Session")
        session_group.setFont(QFont("Arial", 12, QFont.Weight.Bold))
        session_layout = QVBoxLayout()
        
        # Category type
        type_layout = QHBoxLayout()
        type_layout.addWidget(QLabel("Category Type:"))
        self.category_type = QComboBox()
        self.category_type.addItems(["match", "solo", "team"])
        self.category_type.setMinimumHeight(35)
        type_layout.addWidget(self.category_type)
        session_layout.addLayout(type_layout)
        
        # Category name
        name_layout = QHBoxLayout()
        name_layout.addWidget(QLabel("Category Name:"))
        self.category_name = QLineEdit()
        self.category_name.setPlaceholderText("E.g., Men's Individual Combat, Women's Song Luyện...")
        self.category_name.setMinimumHeight(35)
        name_layout.addWidget(self.category_name)
        session_layout.addLayout(name_layout)
        
        # Athlete 1 (Red Corner)
        athlete1_layout = QHBoxLayout()
        athlete1_layout.addWidget(QLabel("🔴 Red Corner:"))
        self.athlete1_name = QLineEdit()
        self.athlete1_name.setPlaceholderText("Athlete 1 name")
        self.athlete1_name.setMinimumHeight(35)
        athlete1_layout.addWidget(self.athlete1_name)
        session_layout.addLayout(athlete1_layout)
        
        # Athlete 2 (Blue Corner)
        athlete2_layout = QHBoxLayout()
        athlete2_layout.addWidget(QLabel("🔵 Blue Corner:"))
        self.athlete2_name = QLineEdit()
        self.athlete2_name.setPlaceholderText("Athlete 2 name (leave empty for solo)")
        self.athlete2_name.setMinimumHeight(35)
        athlete2_layout.addWidget(self.athlete2_name)
        session_layout.addLayout(athlete2_layout)
        
        # Start button
        start_btn = QPushButton("🎯 START SESSION")
        start_btn.setMinimumHeight(50)
        start_btn.setFont(QFont("Arial", 14, QFont.Weight.Bold))
        start_btn.setStyleSheet("""
            QPushButton {
                background-color: #4CAF50;
                color: white;
                border-radius: 8px;
            }
            QPushButton:hover {
                background-color: #45a049;
            }
        """)
        start_btn.clicked.connect(self.start_session)
        session_layout.addWidget(start_btn)
        
        session_group.setLayout(session_layout)
        layout.addWidget(session_group)
        
        # Current Session Info
        current_group = QGroupBox("Current Session")
        current_group.setFont(QFont("Arial", 12, QFont.Weight.Bold))
        current_layout = QVBoxLayout()
        
        self.current_session_label = QLabel("No active session")
        self.current_session_label.setFont(QFont("Arial", 14))
        self.current_session_label.setStyleSheet("color: #999;")
        self.current_session_label.setWordWrap(True)
        current_layout.addWidget(self.current_session_label)
        
        # End session button
        end_btn = QPushButton("🏁 END CURRENT SESSION")
        end_btn.setMinimumHeight(45)
        end_btn.setFont(QFont("Arial", 12, QFont.Weight.Bold))
        end_btn.setStyleSheet("""
            QPushButton {
                background-color: #F44336;
                color: white;
                border-radius: 8px;
            }
            QPushButton:hover {
                background-color: #da190b;
            }
        """)
        end_btn.clicked.connect(self.end_session)
        self.end_btn = end_btn
        self.end_btn.setEnabled(False)
        current_layout.addWidget(end_btn)
        
        current_group.setLayout(current_layout)
        layout.addWidget(current_group)
        
        # Log
        log_group = QGroupBox("Server Log")
        log_group.setFont(QFont("Arial", 12, QFont.Weight.Bold))
        log_layout = QVBoxLayout()
        
        self.log_text = QTextEdit()
        self.log_text.setReadOnly(True)
        self.log_text.setMaximumHeight(150)
        self.log_text.setStyleSheet("""
            QTextEdit {
                background-color: #1a1a1a;
                color: #00ff00;
                font-family: 'Courier New', monospace;
                font-size: 12px;
            }
        """)
        log_layout.addWidget(self.log_text)
        
        log_group.setLayout(log_layout)
        layout.addWidget(log_group)
        
        self.setLayout(layout)
        self.log("Server started successfully")
    
    def start_session(self):
        """Start a new scoring session"""
        category_type = self.category_type.currentText()
        category_name = self.category_name.text().strip()
        athlete1 = self.athlete1_name.text().strip()
        athlete2 = self.athlete2_name.text().strip()
        
        if not category_name or not athlete1:
            QMessageBox.warning(self, "Input Error", "Please enter category name and at least one athlete name")
            return
        
        # Generate session ID
        session_id = f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        # Create session in database
        session_data = {
            'session_id': session_id,
            'match_id': None,
            'category_id': None,
            'category_name': category_name,
            'category_type': category_type,
            'athlete1_id': None,
            'athlete1_name': athlete1,
            'athlete2_id': None,
            'athlete2_name': athlete2 if athlete2 else None
        }
        
        self.db.create_scoring_session(session_data)
        self.current_session = session_data
        
        # Update UI
        session_info = f"📊 {category_name} ({category_type})\n"
        session_info += f"🔴 {athlete1}"
        if athlete2:
            session_info += f" VS 🔵 {athlete2}"
        session_info += f"\n\nSession ID: {session_id}"
        
        self.current_session_label.setText(session_info)
        self.current_session_label.setStyleSheet("color: #4CAF50; font-weight: bold;")
        self.end_btn.setEnabled(True)
        
        self.log(f"✅ Session started: {session_id}")
        self.log(f"   Category: {category_name}")
        self.log(f"   Athletes: {athlete1} vs {athlete2 if athlete2 else 'N/A'}")
        
        # Note: In a real implementation, you would broadcast this via WebSocket
        # For now, the session is in the database and referees can start scoring
        
        QMessageBox.information(
            self,
            "Session Started",
            f"Scoring session started!\n\n{session_info}\n\nReferees can now submit scores."
        )
    
    def end_session(self):
        """End the current session"""
        if not self.current_session:
            return
        
        reply = QMessageBox.question(
            self,
            "End Session",
            "Are you sure you want to end this scoring session?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            # Update session in database
            conn = self.db.connect()
            cursor = conn.cursor()
            cursor.execute(
                """UPDATE live_scoring_sessions 
                   SET status = 'completed', completed_at = ?
                   WHERE session_id = ?""",
                (datetime.now().isoformat(), self.current_session['session_id'])
            )
            conn.commit()
            
            self.log(f"🏁 Session ended: {self.current_session['session_id']}")
            
            self.current_session = None
            self.current_session_label.setText("No active session")
            self.current_session_label.setStyleSheet("color: #999;")
            self.end_btn.setEnabled(False)
            
            # Clear inputs
            self.category_name.clear()
            self.athlete1_name.clear()
            self.athlete2_name.clear()
    
    def log(self, message: str):
        """Add message to log"""
        timestamp = datetime.now().strftime('%H:%M:%S')
        self.log_text.append(f"[{timestamp}] {message}")
