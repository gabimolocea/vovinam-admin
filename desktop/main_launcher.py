"""
Main launcher for FRVV Scoring System
Choose between different modes: Server, Referee, Scoreboard, or Admin
"""
import sys
import asyncio
from PyQt6.QtWidgets import (QApplication, QWidget, QVBoxLayout, QHBoxLayout,
                              QPushButton, QLabel, QFrame, QLineEdit, QSpinBox,
                              QMessageBox)
from PyQt6.QtCore import Qt, QThread, pyqtSignal
from PyQt6.QtGui import QFont, QIcon

from models.db import Database
from ui.main_window import MainWindow
from ui.referee_scoring import RefereeScoreWidget
from ui.scoreboard_display import ScoreboardDisplay
from ui.server_control import ServerControlPanel
from scoring.websocket_server import run_server


class ServerThread(QThread):
    """Thread to run WebSocket server"""
    status_update = pyqtSignal(str)
    error_occurred = pyqtSignal(str)
    
    def __init__(self, db, host='0.0.0.0', port=8765):
        super().__init__()
        self.db = db
        self.host = host
        self.port = port
    
    def run(self):
        """Run the server"""
        try:
            self.status_update.emit(f"Server starting on {self.host}:{self.port}...")
            asyncio.run(run_server(self.db, self.host, self.port))
        except OSError as e:
            if e.errno == 48:  # Address already in use
                self.error_occurred.emit(
                    f"Port {self.port} is already in use.\n\n"
                    "Please close any other instances of the server or choose a different port."
                )
            else:
                self.error_occurred.emit(f"Server error: {str(e)}")
        except Exception as e:
            self.error_occurred.emit(f"Unexpected error: {str(e)}")


class LauncherWindow(QWidget):
    """Main launcher window for selecting mode"""
    
    def __init__(self):
        super().__init__()
        self.db = Database()
        self.server_thread = None
        self.mode_window = None
        
        self.setWindowTitle("FRVV Vovinam Scoring System")
        self.resize(800, 600)
        self.init_ui()
    
    def init_ui(self):
        """Initialize the launcher UI"""
        layout = QVBoxLayout()
        layout.setSpacing(20)
        layout.setContentsMargins(40, 40, 40, 40)
        
        # Header
        header = QLabel("🥋 FRVV VOVINAM SCORING SYSTEM")
        header_font = QFont("Arial", 28, QFont.Weight.Bold)
        header.setFont(header_font)
        header.setAlignment(Qt.AlignmentFlag.AlignCenter)
        header.setStyleSheet("color: #2196F3; margin-bottom: 20px;")
        layout.addWidget(header)
        
        subtitle = QLabel("Select Mode")
        subtitle_font = QFont("Arial", 16)
        subtitle.setFont(subtitle_font)
        subtitle.setAlignment(Qt.AlignmentFlag.AlignCenter)
        subtitle.setStyleSheet("color: #666; margin-bottom: 30px;")
        layout.addWidget(subtitle)
        
        # Mode selection buttons
        
        # Server Mode
        server_btn = self.create_mode_button(
            "🖥️ SERVER MODE",
            "Run WebSocket server for LAN scoring\n" +
            "5 referees + 1 scoreboard display\n" +
            "Shows server IP for referee connections",
            "#4CAF50"
        )
        server_btn.clicked.connect(self.launch_server_mode)
        layout.addWidget(server_btn)
        
        # Referee Mode
        referee_frame = QFrame()
        referee_frame.setFrameStyle(QFrame.Shape.Box)
        referee_frame.setStyleSheet("border: 2px solid #FF9800; border-radius: 10px; padding: 15px;")
        referee_layout = QVBoxLayout()
        
        referee_btn = self.create_mode_button(
            "👨‍⚖️ REFEREE MODE",
            "Score matches as a referee\n" +
            "Connect to server IP and submit scores\n" +
            "For individual referee devices",
            "#FF9800",
            clickable=False
        )
        referee_layout.addWidget(referee_btn)
        
        # Referee configuration
        config_layout = QHBoxLayout()
        config_layout.addWidget(QLabel("Referee ID:"))
        
        self.referee_id_input = QSpinBox()
        self.referee_id_input.setMinimum(1)
        self.referee_id_input.setMaximum(5)
        self.referee_id_input.setValue(1)
        self.referee_id_input.setMinimumHeight(35)
        config_layout.addWidget(self.referee_id_input)
        
        config_layout.addWidget(QLabel("Referee Name:"))
        
        self.referee_name_input = QLineEdit()
        self.referee_name_input.setPlaceholderText("Enter referee name")
        self.referee_name_input.setText("Referee 1")
        self.referee_name_input.setMinimumHeight(35)
        config_layout.addWidget(self.referee_name_input)
        
        start_referee_btn = QPushButton("Launch Referee Panel")
        start_referee_btn.setMinimumHeight(40)
        start_referee_btn.setStyleSheet("""
            QPushButton {
                background-color: #FF9800;
                color: white;
                font-weight: bold;
                border-radius: 5px;
            }
            QPushButton:hover {
                background-color: #F57C00;
            }
        """)
        start_referee_btn.clicked.connect(self.launch_referee_mode)
        config_layout.addWidget(start_referee_btn)
        
        referee_layout.addLayout(config_layout)
        referee_frame.setLayout(referee_layout)
        layout.addWidget(referee_frame)
        
        # Scoreboard Display Mode
        scoreboard_frame = QFrame()
        scoreboard_frame.setFrameStyle(QFrame.Shape.Box)
        scoreboard_frame.setStyleSheet("border: 2px solid #9C27B0; border-radius: 10px; padding: 15px;")
        scoreboard_layout = QVBoxLayout()
        
        scoreboard_btn = self.create_mode_button(
            "📺 SCOREBOARD DISPLAY",
            "Full-screen scoreboard for external monitor\n" +
            "Shows live referee scores and totals\n" +
            "Connect to server IP",
            "#9C27B0",
            clickable=False
        )
        scoreboard_layout.addWidget(scoreboard_btn)
        
        # Scoreboard configuration
        scoreboard_config = QHBoxLayout()
        scoreboard_config.addWidget(QLabel("Server IP:"))
        
        self.scoreboard_ip_input = QLineEdit()
        self.scoreboard_ip_input.setPlaceholderText("192.168.1.100")
        self.scoreboard_ip_input.setText("192.168.1.100")
        self.scoreboard_ip_input.setMinimumHeight(35)
        scoreboard_config.addWidget(self.scoreboard_ip_input)
        
        scoreboard_config.addWidget(QLabel("Port:"))
        
        self.scoreboard_port_input = QSpinBox()
        self.scoreboard_port_input.setMinimum(1000)
        self.scoreboard_port_input.setMaximum(65535)
        self.scoreboard_port_input.setValue(8765)
        self.scoreboard_port_input.setMinimumHeight(35)
        scoreboard_config.addWidget(self.scoreboard_port_input)
        
        start_scoreboard_btn = QPushButton("Launch Scoreboard")
        start_scoreboard_btn.setMinimumHeight(40)
        start_scoreboard_btn.setStyleSheet("""
            QPushButton {
                background-color: #9C27B0;
                color: white;
                font-weight: bold;
                border-radius: 5px;
            }
            QPushButton:hover {
                background-color: #7B1FA2;
            }
        """)
        start_scoreboard_btn.clicked.connect(self.launch_scoreboard_mode)
        scoreboard_config.addWidget(start_scoreboard_btn)
        
        scoreboard_layout.addLayout(scoreboard_config)
        scoreboard_frame.setLayout(scoreboard_layout)
        layout.addWidget(scoreboard_frame)
        
        # Admin Mode
        admin_btn = self.create_mode_button(
            "⚙️ ADMIN MODE",
            "Full athlete management system\n" +
            "Import/export Excel, sync data\n" +
            "Manage competitions and matches",
            "#607D8B"
        )
        admin_btn.clicked.connect(self.launch_admin_mode)
        layout.addWidget(admin_btn)
        
        layout.addStretch()
        
        # Footer
        footer = QLabel("Romanian Vovinam Federation - Competition Scoring System")
        footer.setAlignment(Qt.AlignmentFlag.AlignCenter)
        footer.setStyleSheet("color: #999; font-size: 12px;")
        layout.addWidget(footer)
        
        self.setLayout(layout)
        self.setStyleSheet("background-color: #f5f5f5;")
    
    def create_mode_button(self, title: str, description: str, color: str, clickable: bool = True) -> QPushButton:
        """Create a mode selection button"""
        btn = QPushButton()
        btn.setMinimumHeight(120)
        
        # Create layout for button content
        content_layout = QVBoxLayout()
        
        title_label = QLabel(title)
        title_font = QFont("Arial", 16, QFont.Weight.Bold)
        title_label.setFont(title_font)
        title_label.setAlignment(Qt.AlignmentFlag.AlignLeft)
        content_layout.addWidget(title_label)
        
        desc_label = QLabel(description)
        desc_label.setAlignment(Qt.AlignmentFlag.AlignLeft)
        desc_label.setWordWrap(True)
        content_layout.addWidget(desc_label)
        
        btn.setLayout(content_layout)
        
        if clickable:
            btn.setStyleSheet(f"""
                QPushButton {{
                    background-color: white;
                    border: 3px solid {color};
                    border-radius: 10px;
                    padding: 20px;
                    text-align: left;
                }}
                QPushButton:hover {{
                    background-color: {color};
                    color: white;
                }}
            """)
        else:
            btn.setStyleSheet(f"""
                QPushButton {{
                    background-color: white;
                    border: 3px solid {color};
                    border-radius: 10px;
                    padding: 20px;
                    text-align: left;
                }}
            """)
            btn.setEnabled(False)
        
        return btn
    
    def launch_server_mode(self):
        """Launch server mode"""
        import socket
        
        # Get local IP
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
        except:
            local_ip = "127.0.0.1"
        
        # Start server
        self.server_thread = ServerThread(self.db, '0.0.0.0', 8765)
        self.server_thread.status_update.connect(self.show_server_status)
        self.server_thread.error_occurred.connect(self.show_server_error)
        self.server_thread.start()
        
        # Show server control panel
        self.mode_window = ServerControlPanel(self.db, local_ip, 8765)
        self.mode_window.show()
        self.hide()
    
    def show_server_error(self, error_msg: str):
        """Show server error"""
        QMessageBox.critical(self, "Server Error", error_msg)
        # Return to launcher
        if self.mode_window:
            self.mode_window.close()
        self.show()
    
    def show_server_status(self, status: str):
        """Show server status update"""
        print(status)
    
    def launch_referee_mode(self):
        """Launch referee mode"""
        referee_id = self.referee_id_input.value()
        referee_name = self.referee_name_input.text() or f"Referee {referee_id}"
        
        self.mode_window = RefereeScoreWidget(self.db, referee_id, referee_name)
        self.mode_window.show()
        self.hide()
    
    def launch_scoreboard_mode(self):
        """Launch scoreboard display mode"""
        server_ip = self.scoreboard_ip_input.text() or "192.168.1.100"
        port = self.scoreboard_port_input.value()
        
        self.mode_window = ScoreboardDisplay(server_ip, port)
        self.mode_window.show()
        self.hide()
    
    def launch_admin_mode(self):
        """Launch admin/management mode"""
        self.mode_window = MainWindow()
        self.mode_window.show()
        self.hide()
    
    def closeEvent(self, event):
        """Handle window close"""
        if self.server_thread and self.server_thread.isRunning():
            reply = QMessageBox.question(
                self,
                "Server Running",
                "The WebSocket server is still running. Are you sure you want to quit?",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
            )
            
            if reply == QMessageBox.StandardButton.Yes:
                self.server_thread.terminate()
                self.server_thread.wait()
                event.accept()
            else:
                event.ignore()
        else:
            event.accept()


def main():
    """Main entry point"""
    app = QApplication(sys.argv)
    app.setApplicationName("FRVV Vovinam Scoring System")
    
    window = LauncherWindow()
    window.show()
    
    sys.exit(app.exec())


if __name__ == '__main__':
    main()
