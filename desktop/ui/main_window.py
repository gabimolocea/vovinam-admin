"""
Main application window
"""
from PyQt6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, 
    QPushButton, QLabel, QStatusBar, QMenuBar, QMenu,
    QMessageBox, QInputDialog, QFileDialog
)
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QAction
import config
from models.db import Database
from sync.sync_manager import SyncManager
from ui.athlete_list import AthleteListWidget
from ui.excel_import import ExcelImportDialog
from ui.login_dialog import LoginDialog
from ui.competitions_tab import CompetitionsTab
from ui.categories_tab import CategoriesTab
from ui.matches_tab import MatchesTab
from ui.clubs_tab import ClubsTab
from ui.grades_tab import GradesTab

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.db = Database()
        self.sync_manager = SyncManager()
        self.is_logged_in = False
        self.current_user = None
        self.init_ui()
        self.load_data()
        
        # Prompt for login on startup
        self.prompt_login()
    
    def init_ui(self):
        """Initialize the user interface"""
        self.setWindowTitle(config.WINDOW_TITLE)
        self.setGeometry(100, 100, config.WINDOW_WIDTH, config.WINDOW_HEIGHT)
        
        # Create menu bar
        self.create_menus()
        
        # Central widget
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        # Main layout
        layout = QVBoxLayout(central_widget)
        
        # Toolbar
        toolbar = self.create_toolbar()
        layout.addLayout(toolbar)
        
        # Tab widget for different sections
        from PyQt6.QtWidgets import QTabWidget
        self.tabs = QTabWidget()
        
        # Athletes tab
        self.athlete_list = AthleteListWidget(self.db)
        self.tabs.addTab(self.athlete_list, '👥 Athletes')
        
        # Competitions tab
        self.competitions_tab = CompetitionsTab(self.db, self.sync_manager)
        self.tabs.addTab(self.competitions_tab, '🏆 Competitions')
        
        # Categories tab
        self.categories_tab = CategoriesTab(self.db)
        self.tabs.addTab(self.categories_tab, '📋 Categories')
        
        # Matches tab
        self.matches_tab = MatchesTab(self.db)
        # Clubs tab
        self.clubs_tab = ClubsTab(self.db)
        self.tabs.addTab(self.clubs_tab, '🏢 Clubs')
        
        # Grades tab
        self.grades_tab = GradesTab(self.db)
        self.tabs.addTab(self.grades_tab, '🥋 Grades')
        
        self.tabs.addTab(self.matches_tab, '🥊 Matches')
        
        layout.addWidget(self.tabs)
        
        # Status bar
        self.statusBar = QStatusBar()
        self.setStatusBar(self.statusBar)
        self.update_status()
    
    def create_menus(self):
        """Create menu bar"""
        menubar = self.menuBar()
        
        # File menu
        file_menu = menubar.addMenu('&File')
        
        import_action = QAction('&Import Excel...', self)
        import_action.triggered.connect(self.import_excel)
        file_menu.addAction(import_action)
        
        export_action = QAction('&Export Excel...', self)
        export_action.triggered.connect(self.export_excel)
        file_menu.addAction(export_action)
        
        file_menu.addSeparator()
        
        exit_action = QAction('E&xit', self)
        exit_action.triggered.connect(self.close)
        file_menu.addAction(exit_action)
        
        # Sync menu
        sync_menu = menubar.addMenu('&Sync')
        
        login_action = QAction('&Login...', self)
        login_action.triggered.connect(self.prompt_login)
        sync_menu.addAction(login_action)
        
        logout_action = QAction('Log&out', self)
        logout_action.triggered.connect(self.logout)
        sync_menu.addAction(logout_action)
        
        sync_menu.addSeparator()
        
        test_conn_action = QAction('Test &Connection', self)
        test_conn_action.triggered.connect(self.test_connection)
        sync_menu.addAction(test_conn_action)
        
        pull_action = QAction('&Download from Server', self)
        pull_action.triggered.connect(self.pull_data)
        sync_menu.addAction(pull_action)
        
        push_action = QAction('&Upload to Server', self)
        push_action.triggered.connect(self.push_data)
        sync_menu.addAction(push_action)
        
        sync_all_action = QAction('&Full Sync (Both Ways)', self)
        sync_all_action.triggered.connect(self.full_sync)
        sync_menu.addAction(sync_all_action)
        
        # Help menu
        help_menu = menubar.addMenu('&Help')
        
        about_action = QAction('&About', self)
        about_action.triggered.connect(self.show_about)
        help_menu.addAction(about_action)
    
    def create_toolbar(self) -> QHBoxLayout:
        """Create toolbar with action buttons"""
        toolbar = QHBoxLayout()
        
        # Sync buttons
        btn_pull = QPushButton('⬇ Download')
        btn_pull.clicked.connect(self.pull_data)
        btn_pull.setToolTip('Download athletes from server')
        toolbar.addWidget(btn_pull)
        
        btn_push = QPushButton('⬆ Upload')
        btn_push.clicked.connect(self.push_data)
        btn_push.setToolTip('Upload local changes to server')
        toolbar.addWidget(btn_push)
        
        btn_sync = QPushButton('🔄 Full Sync')
        btn_sync.clicked.connect(self.full_sync)
        btn_sync.setToolTip('Sync both ways')
        toolbar.addWidget(btn_sync)
        
        toolbar.addStretch()
        
        # Excel buttons
        btn_import = QPushButton('📥 Import Excel')
        btn_import.clicked.connect(self.import_excel)
        toolbar.addWidget(btn_import)
        
        btn_export = QPushButton('📤 Export Excel')
        btn_export.clicked.connect(self.export_excel)
        toolbar.addWidget(btn_export)
        
        toolbar.addStretch()
        
        # Refresh button
        btn_refresh = QPushButton('🔄 Refresh')
        btn_refresh.clicked.connect(self.load_data)
        toolbar.addWidget(btn_refresh)
        
        return toolbar
    
    def load_data(self):
        """Load all data from database"""
        self.athlete_list.load_athletes()
        self.competitions_tab.load_competitions()
        self.categories_tab.load_categories()
        self.matches_tab.load_matches()
        self.clubs_tab.load_clubs()
        self.grades_tab.load_grades()
        self.update_status()
    
    def update_status(self):
        """Update status bar"""
        athletes = self.db.get_all_athletes()
        unsynced = self.db.get_unsynced_athletes()
        
        login_status = f"👤 {self.current_user.get('email', 'Not logged in')}" if self.is_logged_in else "🔒 Not logged in"
        status_text = f"{login_status} | Athletes: {len(athletes)} | Unsynced: {len(unsynced)}"
        self.statusBar.showMessage(status_text)
    
    def prompt_login(self):
        """Show login dialog"""
        dialog = LoginDialog(self)
        if dialog.exec():
            token = dialog.get_token()
            self.current_user = dialog.get_user_info()
            
            if token:
                self.sync_manager.set_auth_token(token)
                self.is_logged_in = True
                self.update_status()
                QMessageBox.information(
                    self, 'Login Success',
                    f"Logged in as {self.current_user.get('email', 'User')}"
                )
    
    def logout(self):
        """Logout from API"""
        self.sync_manager.set_auth_token(None)
        self.is_logged_in = False
        self.current_user = None
        self.update_status()
        QMessageBox.information(self, 'Logged Out', 'You have been logged out')
    
    def check_login(self) -> bool:
        """Check if user is logged in"""
        if not self.is_logged_in:
            reply = QMessageBox.question(
                self, 'Login Required',
                'You need to login to sync with the server.\n\nLogin now?',
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
            )
            
            if reply == QMessageBox.StandardButton.Yes:
                self.prompt_login()
                return self.is_logged_in
            return False
        return True
    
    def load_data(self):
        """Load all data from database"""
        self.athlete_list.load_athletes()
        self.competitions_tab.load_competitions()
        self.categories_tab.load_categories()
        self.matches_tab.load_matches()        self.clubs_tab.load_clubs()
        self.grades_tab.load_grades()        self.update_status()
    
    def update_status(self):
        """Update status bar"""
        athletes = self.db.get_all_athletes()
        unsynced = self.db.get_unsynced_athletes()
        
        status_text = f"Athletes: {len(athletes)} | Unsynced: {len(unsynced)}"
        self.statusBar.showMessage(status_text)
    
    def test_connection(self):
        """Test connection to API"""
        success, message = self.sync_manager.test_connection()
        
        if success:
            QMessageBox.information(self, 'Connection Test', f'✓ {message}')
        else:
            QMessageBox.warning(self, 'Connection Test', f'✗ {message}')
    
    def pull_data(self):
        """Download data from server"""
        if not self.check_login():
            return
        
        self.statusBar.showMessage('Downloading from server...')
        
        # First sync reference data
        success, msg = self.sync_manager.sync_reference_data()
        if not success:
            QMessageBox.warning(self, 'Sync Error', f'Failed to sync reference data: {msg}')
            return
        
        # Pull all data types
        total_count = 0
        messages = []
        
        # Athletes
        success, msg, count = self.sync_manager.pull_athletes()
        if success:
            total_count += count
            messages.append(f"Athletes: {count}")
        
        # Competitions
        success, msg, count = self.sync_manager.pull_competitions()
        if success:
            total_count += count
            messages.append(f"Competitions: {count}")
        
        # Categories
        success, msg, count = self.sync_manager.pull_categories()
        if success:
            total_count += count
            messages.append(f"Categories: {count}")
        
        # Matches
        success, msg, count = self.sync_manager.pull_matches()
        if success:
            total_count += count
            messages.append(f"Matches: {count}")
        
        # Clubs
        success, msg, count = self.sync_manager.pull_clubs()
        if success:
            total_count += count
            messages.append(f"Clubs: {count}")
        
        # Grades
        success, msg, count = self.sync_manager.pull_grades()
        if success:
            total_count += count
            messages.append(f"Grades: {count}")
        
        QMessageBox.information(
            self, 'Download Complete',
            f"Downloaded {total_count} records:\n" + "\n".join(messages)
        )
        self.load_data()
        
        self.statusBar.showMessage('Ready')
    
    def push_data(self):
        """Upload data to server"""
        if not self.check_login():
            return
        
        unsynced = self.db.get_unsynced_athletes()
        
        if not unsynced:
            QMessageBox.information(self, 'Upload', 'No changes to upload')
            return
        
        reply = QMessageBox.question(
            self, 'Confirm Upload',
            f'Upload {len(unsynced)} athlete(s) to server?',
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply != QMessageBox.StandardButton.Yes:
            return
        
        self.statusBar.showMessage('Uploading to server...')
        success, msg, count = self.sync_manager.push_athletes()
        
        if success:
            QMessageBox.information(self, 'Upload Complete', msg)
            self.load_data()
        else:
            QMessageBox.warning(self, 'Upload Failed', msg)
        
        self.statusBar.showMessage('Ready')
    
    def full_sync(self):
        """Perform full bidirectional sync"""
        if not self.check_login():
            return
        
        self.statusBar.showMessage('Syncing...')
        
        # Pull first, then push
        success, msg, count = self.sync_manager.pull_athletes()
        if success:
            success, msg, count = self.sync_manager.push_athletes()
        
        if success:
            QMessageBox.information(self, 'Sync Complete', 'Full sync completed successfully')
            self.load_data()
        else:
            QMessageBox.warning(self, 'Sync Failed', msg)
        
        self.statusBar.showMessage('Ready')
    
    def import_excel(self):
        """Import athletes from Excel"""
        dialog = ExcelImportDialog(self.db, self)
        if dialog.exec():
            self.load_data()
    
    def export_excel(self):
        """Export athletes to Excel"""
        from openpyxl import Workbook
        from datetime import datetime
        
        file_path, _ = QFileDialog.getSaveFileName(
            self, 'Export Athletes',
            str(config.EXCEL_DIR / f'athletes_export_{datetime.now():%Y%m%d_%H%M%S}.xlsx'),
            'Excel Files (*.xlsx)'
        )
        
        if not file_path:
            return
        
        try:
            athletes = self.db.get_all_athletes()
            
            wb = Workbook()
            ws = wb.active
            ws.title = 'Athletes'
            
            # Headers
            headers = ['First Name', 'Last Name', 'DOB', 'Mobile', 'Club', 'City', 'Status']
            ws.append(headers)
            
            # Data
            for athlete in athletes:
                ws.append([
                    athlete.get('first_name'),
                    athlete.get('last_name'),
                    athlete.get('date_of_birth'),
                    athlete.get('mobile_number'),
                    athlete.get('club_name'),
                    athlete.get('city_name'),
                    athlete.get('status')
                ])
            
            wb.save(file_path)
            QMessageBox.information(self, 'Export Complete', f'Exported {len(athletes)} athletes')
            
        except Exception as e:
            QMessageBox.critical(self, 'Export Failed', f'Error: {str(e)}')
    
    def show_about(self):
        """Show about dialog"""
        QMessageBox.about(
            self,
            'About',
            f'{config.APP_NAME}\n'
            f'Version {config.APP_VERSION}\n\n'
            f'Offline athlete management with sync to Django backend'
        )
