"""
Scoring Session Management for Tatami
Manages solo categories, team categories, and fights with referee scoring
"""
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel, QComboBox,
    QTableWidget, QTableWidgetItem, QDialog, QMessageBox, QFormLayout,
    QSpinBox, QDoubleSpinBox, QLineEdit, QDialogButtonBox
)
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QFont, QColor
from models.lan_manager import LANManager
import json


class StartSessionDialog(QDialog):
    """Dialog to start a scoring session"""
    
    def __init__(self, parent=None, tatami_id=None, db=None):
        super().__init__(parent)
        self.tatami_id = tatami_id
        self.db = db
        self.categories = {}
        self.setWindowTitle("Start Scoring Session")
        self.setGeometry(200, 200, 500, 400)
        self.init_ui()
        self.load_categories()
    
    def showEvent(self, event):
        """Refresh categories when dialog is shown"""
        super().showEvent(event)
        # Reload categories in case they were synced
        current_text = self.category_combo.currentText()
        self.category_combo.clear()
        self.load_categories()
        # Try to restore selection if it still exists
        index = self.category_combo.findText(current_text)
        if index >= 0:
            self.category_combo.setCurrentIndex(index)
    
    def init_ui(self):
        """Initialize dialog UI"""
        layout = QFormLayout()
        
        # Category selection
        self.category_combo = QComboBox()
        layout.addRow("Category:", self.category_combo)
        
        # Athlete 1
        self.athlete1_input = QLineEdit()
        self.athlete1_input.setPlaceholderText("Athlete name or search")
        layout.addRow("Athlete 1:", self.athlete1_input)
        
        # Athlete 2 (optional)
        self.athlete2_input = QLineEdit()
        self.athlete2_input.setPlaceholderText("(Optional for team/fight)")
        layout.addRow("Athlete 2:", self.athlete2_input)
        
        # Buttons
        button_box = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok |
            QDialogButtonBox.StandardButton.Cancel
        )
        button_box.accepted.connect(self.accept)
        button_box.rejected.connect(self.reject)
        layout.addRow(button_box)
        
        self.setLayout(layout)
    
    def load_categories(self):
        """Load categories from database"""
        if not self.db:
            self.category_combo.addItem("No database", None)
            return
        
        try:
            conn = self.db.connect()
            cursor = conn.cursor()
            
            # Check if categories exist
            cursor.execute('SELECT COUNT(*) FROM categories')
            result = cursor.fetchone()
            count = result[0] if result else 0
            
            if count == 0:
                self.category_combo.addItem("No categories - Sync first", None)
                print("Warning: No categories found in database. Please sync first.")
                return
            
            cursor.execute('''
                SELECT id, name, category_type FROM categories
                WHERE id IS NOT NULL
                ORDER BY name
            ''')
            
            self.categories = {}
            rows = cursor.fetchall()
            for row in rows:
                cat_id, name, cat_type = row
                display_name = f"{name} ({cat_type})" if cat_type else name
                self.category_combo.addItem(display_name, cat_id)
                self.categories[cat_id] = {'name': name, 'type': cat_type}
            
            print(f"Loaded {len(rows)} categories")
        except Exception as e:
            print(f"Error loading categories: {e}")
            import traceback
            traceback.print_exc()
            self.category_combo.addItem(f"Error: {str(e)}", None)
    
    def get_data(self):
        """Get dialog data"""
        return {
            'category_id': self.category_combo.currentData(),
            'category_name': self.category_combo.currentText(),
            'athlete1_name': self.athlete1_input.text(),
            'athlete2_name': self.athlete2_input.text()
        }


class ScoringSessionWidget(QWidget):
    """Widget for managing scoring sessions on a tatami"""
    
    session_started = pyqtSignal(int)  # Emits session_id
    
    def __init__(self, db, tatami_id=None):
        super().__init__()
        self.db = db
        self.tatami_id = tatami_id
        self.lan_manager = LANManager(db.connection)
        self.current_session = None
        self.init_ui()
    
    def init_ui(self):
        """Initialize UI"""
        layout = QVBoxLayout()
        
        # Header
        header = QLabel("📊 Scoring Sessions")
        font = QFont()
        font.setPointSize(14)
        font.setBold(True)
        header.setFont(font)
        layout.addWidget(header)
        
        # Control buttons
        control_layout = QHBoxLayout()
        
        self.start_btn = QPushButton("▶️ Start New Session")
        self.start_btn.clicked.connect(self.start_session)
        control_layout.addWidget(self.start_btn)
        
        self.pause_btn = QPushButton("⏸️ Pause Session")
        self.pause_btn.clicked.connect(self.pause_session)
        self.pause_btn.setEnabled(False)
        control_layout.addWidget(self.pause_btn)
        
        self.end_btn = QPushButton("⏹️ End Session")
        self.end_btn.clicked.connect(self.end_session)
        self.end_btn.setEnabled(False)
        control_layout.addWidget(self.end_btn)
        
        control_layout.addStretch()
        layout.addLayout(control_layout)
        
        # Current session info
        self.info_label = QLabel("No active session")
        self.info_label.setStyleSheet("padding: 10px; background-color: #f0f0f0; border-radius: 5px;")
        layout.addWidget(self.info_label)
        
        # Sessions table
        self.table = QTableWidget()
        self.table.setColumnCount(7)
        self.table.setHorizontalHeaderLabels([
            "Category", "Type", "Athlete 1", "Athlete 2", "Status", "Started", "Score"
        ])
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.itemSelectionChanged.connect(self.on_session_selected)
        layout.addWidget(self.table)
        
        # Score input (for current session)
        score_layout = QHBoxLayout()
        score_layout.addWidget(QLabel("Enter Score:"))
        
        self.score_input = QDoubleSpinBox()
        self.score_input.setMinimum(0)
        self.score_input.setMaximum(1000)
        score_layout.addWidget(self.score_input)
        
        submit_score_btn = QPushButton("📝 Submit Score")
        submit_score_btn.clicked.connect(self.submit_score)
        score_layout.addWidget(submit_score_btn)
        
        score_layout.addStretch()
        layout.addLayout(score_layout)
        
        self.setLayout(layout)
        
        if self.tatami_id:
            self.load_sessions()
    
    def load_sessions(self):
        """Load sessions for the tatami"""
        self.table.setRowCount(0)
        
        if not self.tatami_id:
            return
        
        sessions = self.lan_manager.get_active_sessions(self.tatami_id)
        
        for session in sessions:
            row = self.table.rowCount()
            self.table.insertRow(row)
            
            # Category
            item = QTableWidgetItem(session.category_name or "Unknown")
            self.table.setItem(row, 0, item)
            
            # Type
            item = QTableWidgetItem(session.category_type or "")
            self.table.setItem(row, 1, item)
            
            # Athlete 1
            item = QTableWidgetItem(session.athlete1_name or "")
            self.table.setItem(row, 2, item)
            
            # Athlete 2
            item = QTableWidgetItem(session.athlete2_name or "")
            self.table.setItem(row, 3, item)
            
            # Status
            item = QTableWidgetItem(session.status)
            if session.status == 'active':
                item.setBackground(QColor(144, 238, 144))  # Light green
            self.table.setItem(row, 4, item)
            
            # Started
            item = QTableWidgetItem(session.started_at[:10])
            self.table.setItem(row, 5, item)
            
            # Score data
            try:
                score_data = json.loads(session.score_data) if isinstance(session.score_data, str) else session.score_data
                score_text = str(score_data.get('total', '—'))
            except:
                score_text = "—"
            item = QTableWidgetItem(score_text)
            self.table.setItem(row, 6, item)
            
            # Store session ID
            item.session_id = session.id
        
        self.table.resizeColumnsToContents()
    
    def set_tatami(self, tatami_id):
        """Set active tatami"""
        self.tatami_id = tatami_id
        self.load_sessions()
    
    def start_session(self):
        """Start a new scoring session"""
        if not self.tatami_id:
            QMessageBox.warning(self, "Error", "Please select a tatami first")
            return
        
        dialog = StartSessionDialog(self, self.tatami_id, self.db)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            data = dialog.get_data()
            
            try:
                session_id = self.lan_manager.create_session(
                    self.tatami_id,
                    data.get('category_id'),
                    data.get('category_name'),
                    "solo",  # Will be refined based on category type
                    1,  # athlete1_id (placeholder)
                    data.get('athlete1_name'),
                    2 if data.get('athlete2_name') else None,  # athlete2_id (placeholder)
                    data.get('athlete2_name')
                )
                
                self.current_session = session_id
                self.load_sessions()
                self.session_started.emit(session_id)
                self.update_info_label()
                self.start_btn.setEnabled(False)
                self.pause_btn.setEnabled(True)
                self.end_btn.setEnabled(True)
                
                QMessageBox.information(self, "Success", "Scoring session started")
            except Exception as e:
                QMessageBox.critical(self, "Error", f"Failed to start session: {str(e)}")
    
    def pause_session(self):
        """Pause current session"""
        if self.current_session:
            try:
                self.lan_manager.update_session_status(self.current_session, 'paused')
                self.load_sessions()
                self.update_info_label()
            except Exception as e:
                QMessageBox.critical(self, "Error", f"Failed to pause: {str(e)}")
    
    def end_session(self):
        """End current session"""
        if self.current_session:
            reply = QMessageBox.question(self, "Confirm", 
                                        "End this scoring session?",
                                        QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
            if reply == QMessageBox.StandardButton.Yes:
                try:
                    self.lan_manager.end_session(self.current_session)
                    self.current_session = None
                    self.load_sessions()
                    self.update_info_label()
                    self.start_btn.setEnabled(True)
                    self.pause_btn.setEnabled(False)
                    self.end_btn.setEnabled(False)
                except Exception as e:
                    QMessageBox.critical(self, "Error", f"Failed to end: {str(e)}")
    
    def submit_score(self):
        """Submit score for current session"""
        if not self.current_session:
            QMessageBox.warning(self, "Error", "No active session")
            return
        
        try:
            score_data = json.dumps({'total': self.score_input.value()})
            self.lan_manager.update_session_scores(self.current_session, score_data)
            self.load_sessions()
            QMessageBox.information(self, "Success", "Score submitted")
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to submit: {str(e)}")
    
    def on_session_selected(self):
        """Handle session selection"""
        selected = self.table.selectedIndexes()
        if selected:
            row = selected[0].row()
            if hasattr(self.table.item(row, 0), 'session_id'):
                self.current_session = self.table.item(row, 0).session_id
    
    def refresh_categories(self):
        """Refresh categories from database (call after sync)"""
        self.category_combo.clear()
        self.load_categories()
    
    def update_info_label(self):
        """Update current session info label"""
        if self.current_session:
            session = self.lan_manager.get_session(self.current_session)
            if session:
                info = f"Active: {session.category_name} - {session.athlete1_name}"
                if session.athlete2_name:
                    info += f" vs {session.athlete2_name}"
                self.info_label.setText(info)
                self.info_label.setStyleSheet("padding: 10px; background-color: #90EE90; border-radius: 5px;")
        else:
            self.info_label.setText("No active session")
            self.info_label.setStyleSheet("padding: 10px; background-color: #f0f0f0; border-radius: 5px;")
