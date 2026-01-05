"""
Athlete detail dialog for viewing and editing
"""
from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QFormLayout, QLineEdit,
    QComboBox, QDateEdit, QTextEdit, QPushButton, QMessageBox, QTabWidget, QWidget,
    QTableWidget, QTableWidgetItem, QHeaderView, QLabel
)
from PyQt6.QtCore import QDate, Qt
from models.db import Database
from datetime import datetime

class AthleteDetailDialog(QDialog):
    def __init__(self, db: Database, athlete_id: int = None, parent=None):
        super().__init__(parent)
        self.db = db
        self.athlete_id = athlete_id
        self.athlete_data = None
        
        if athlete_id:
            # Load existing athlete
            athletes = db.get_all_athletes()
            self.athlete_data = next((a for a in athletes if a['id'] == athlete_id), None)
            self.setWindowTitle(f"Edit Athlete - {self.athlete_data.get('first_name', '')} {self.athlete_data.get('last_name', '')}")
        else:
            self.setWindowTitle('New Athlete')
        
        self.init_ui()
        
        if self.athlete_data:
            self.load_data()
            # Load athlete profile data (grade history, visas, results)
            if self.athlete_id:
                self.load_grade_history()
                self.load_visas()
                self.load_results()
    
    def init_ui(self):
        """Initialize the dialog UI"""
        self.setMinimumWidth(600)
        self.setMinimumHeight(700)
        
        layout = QVBoxLayout(self)
        
        # Tab widget for organization
        tabs = QTabWidget()
        
        # Basic Info Tab
        basic_tab = QWidget()
        basic_layout = QFormLayout(basic_tab)
        
        self.first_name = QLineEdit()
        basic_layout.addRow('First Name:', self.first_name)
        
        self.last_name = QLineEdit()
        basic_layout.addRow('Last Name:', self.last_name)
        
        self.mobile_number = QLineEdit()
        basic_layout.addRow('Mobile Number:', self.mobile_number)
        
        self.date_of_birth = QDateEdit()
        self.date_of_birth.setCalendarPopup(True)
        self.date_of_birth.setDate(QDate.currentDate().addYears(-18))
        basic_layout.addRow('Date of Birth:', self.date_of_birth)
        
        tabs.addTab(basic_tab, '👤 Basic Info')
        
        # Club Info Tab
        club_tab = QWidget()
        club_layout = QFormLayout(club_tab)
        
        self.club = QComboBox()
        self.load_clubs()
        club_layout.addRow('Club:', self.club)
        
        self.city = QComboBox()
        self.load_cities()
        club_layout.addRow('City:', self.city)
        
        self.current_grade = QComboBox()
        self.load_grades()
        club_layout.addRow('Current Grade:', self.current_grade)
        
        self.registered_date = QDateEdit()
        self.registered_date.setCalendarPopup(True)
        self.registered_date.setDate(QDate.currentDate())
        club_layout.addRow('Registered Date:', self.registered_date)
        
        self.expiration_date = QDateEdit()
        self.expiration_date.setCalendarPopup(True)
        self.expiration_date.setDate(QDate.currentDate().addYears(1))
        club_layout.addRow('Expiration Date:', self.expiration_date)
        
        self.status = QComboBox()
        self.status.addItems(['pending', 'approved', 'rejected', 'revision_required'])
        club_layout.addRow('Status:', self.status)
        
        tabs.addTab(club_tab, '🏢 Club Info')
        
        # Emergency Contact Tab
        emergency_tab = QWidget()
        emergency_layout = QFormLayout(emergency_tab)
        
        self.emergency_contact_name = QLineEdit()
        emergency_layout.addRow('Contact Name:', self.emergency_contact_name)
        
        self.emergency_contact_phone = QLineEdit()
        emergency_layout.addRow('Contact Phone:', self.emergency_contact_phone)
        
        self.address = QTextEdit()
        self.address.setMaximumHeight(100)
        emergency_layout.addRow('Address:', self.address)
        
        tabs.addTab(emergency_tab, '🚨 Emergency Contact')
        
        # Grade History Tab (read-only, only for existing athletes)
        if self.athlete_id:
            grade_history_tab = QWidget()
            grade_history_layout = QVBoxLayout(grade_history_tab)
            
            grade_history_label = QLabel('📜 Grade promotions and history')
            grade_history_layout.addWidget(grade_history_label)
            
            self.grade_history_table = QTableWidget()
            self.grade_history_table.setColumnCount(4)
            self.grade_history_table.setHorizontalHeaderLabels([
                'Grade', 'Date Earned', 'Event', 'Status'
            ])
            self.grade_history_table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
            self.grade_history_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
            self.grade_history_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
            grade_history_layout.addWidget(self.grade_history_table)
            
            tabs.addTab(grade_history_tab, '🥋 Grade History')
        
        # Visas Tab (read-only, only for existing athletes)
        if self.athlete_id:
            visas_tab = QWidget()
            visas_layout = QVBoxLayout(visas_tab)
            
            visas_label = QLabel('📋 Medical and annual visas')
            visas_layout.addWidget(visas_label)
            
            self.visas_table = QTableWidget()
            self.visas_table.setColumnCount(5)
            self.visas_table.setHorizontalHeaderLabels([
                'Type', 'Issued Date', 'Expiration', 'Status', 'Valid'
            ])
            self.visas_table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
            self.visas_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
            self.visas_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
            visas_layout.addWidget(self.visas_table)
            
            tabs.addTab(visas_tab, '📋 Visas')
        
        # Results Tab (read-only, only for existing athletes)
        if self.athlete_id:
            results_tab = QWidget()
            results_layout = QVBoxLayout(results_tab)
            
            # Filter bar for result types
            filter_layout = QHBoxLayout()
            filter_layout.addWidget(QLabel('Filter by type:'))
            
            self.result_type_filter = QComboBox()
            self.result_type_filter.addItems(['All', 'Solo', 'Fight', 'Teams'])
            self.result_type_filter.currentTextChanged.connect(self.filter_results)
            filter_layout.addWidget(self.result_type_filter)
            
            filter_layout.addStretch()
            
            # Stats labels
            self.solo_count_label = QLabel('Solo: 0')
            self.fight_count_label = QLabel('Fight: 0')
            self.teams_count_label = QLabel('Teams: 0')
            
            filter_layout.addWidget(self.solo_count_label)
            filter_layout.addWidget(QLabel('|'))
            filter_layout.addWidget(self.fight_count_label)
            filter_layout.addWidget(QLabel('|'))
            filter_layout.addWidget(self.teams_count_label)
            
            results_layout.addLayout(filter_layout)
            
            results_label = QLabel('🏆 Competition results and scores')
            results_layout.addWidget(results_label)
            
            self.results_table = QTableWidget()
            self.results_table.setColumnCount(5)
            self.results_table.setHorizontalHeaderLabels([
                'Event', 'Category', 'Type', 'Placement', 'Status'
            ])
            self.results_table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
            self.results_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
            self.results_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
            results_layout.addWidget(self.results_table)
            
            # Store all results for filtering
            self.all_results = []
            
            tabs.addTab(results_tab, '🏆 Results')
        
        layout.addWidget(tabs)
        
        # Buttons
        button_layout = QHBoxLayout()
        
        # Delete button (only for existing athletes)
        if self.athlete_id:
            btn_delete = QPushButton('🗑️ Delete')
            btn_delete.clicked.connect(self.delete_athlete)
            button_layout.addWidget(btn_delete)
            button_layout.addStretch()
        
        btn_save = QPushButton('💾 Save')
        btn_save.clicked.connect(self.save)
        button_layout.addWidget(btn_save)
        
        btn_cancel = QPushButton('❌ Cancel')
        btn_cancel.clicked.connect(self.reject)
        button_layout.addWidget(btn_cancel)
        
        layout.addLayout(button_layout)
    
    def load_clubs(self):
        """Load clubs from database"""
        clubs = self.db.get_all_clubs()
        self.club.addItem('', None)
        for club in clubs:
            # Use server_id if available, otherwise use local id
            club_id = club.get('server_id') or club['id']
            self.club.addItem(club['name'], club_id)
    
    def load_cities(self):
        """Load cities from database"""
        cities = self.db.get_all_cities()
        self.city.addItem('', None)
        for city in cities:
            # Use server_id if available, otherwise use local id
            city_id = city.get('server_id') or city['id']
            self.city.addItem(city['name'], city_id)
    
    def load_grades(self):
        """Load grades from database"""
        grades = self.db.get_all_grades()
        self.current_grade.addItem('', None)
        for grade in grades:
            # Use server_id if available, otherwise use local id
            grade_id = grade.get('server_id') or grade['id']
            self.current_grade.addItem(grade['name'], grade_id)
    
    def load_data(self):
        """Load athlete data into form"""
        if not self.athlete_data:
            return
        
        self.first_name.setText(self.athlete_data.get('first_name', ''))
        self.last_name.setText(self.athlete_data.get('last_name', ''))
        self.mobile_number.setText(self.athlete_data.get('mobile_number', ''))
        
        # Date of birth
        dob = self.athlete_data.get('date_of_birth')
        if dob:
            self.date_of_birth.setDate(QDate.fromString(dob, 'yyyy-MM-dd'))
        
        # Club - match by server_id
        club_id = self.athlete_data.get('club_id')
        if club_id:
            # Try to find by data (which is server_id)
            idx = self.club.findData(club_id)
            if idx >= 0:
                self.club.setCurrentIndex(idx)
            else:
                # If not found, try setting by name as fallback
                club_name = self.athlete_data.get('club_name')
                if club_name:
                    idx = self.club.findText(club_name)
                    if idx >= 0:
                        self.club.setCurrentIndex(idx)
        
        # City - match by server_id
        city_id = self.athlete_data.get('city_id')
        if city_id:
            idx = self.city.findData(city_id)
            if idx >= 0:
                self.city.setCurrentIndex(idx)
            else:
                city_name = self.athlete_data.get('city_name')
                if city_name:
                    idx = self.city.findText(city_name)
                    if idx >= 0:
                        self.city.setCurrentIndex(idx)
        
        # Grade - match by server_id
        grade_id = self.athlete_data.get('current_grade_id')
        if grade_id:
            idx = self.current_grade.findData(grade_id)
            if idx >= 0:
                self.current_grade.setCurrentIndex(idx)
            else:
                grade_name = self.athlete_data.get('current_grade_name')
                if grade_name:
                    idx = self.current_grade.findText(grade_name)
                    if idx >= 0:
                        self.current_grade.setCurrentIndex(idx)
        
        # Dates
        reg_date = self.athlete_data.get('registered_date')
        if reg_date:
            self.registered_date.setDate(QDate.fromString(reg_date[:10], 'yyyy-MM-dd'))
        
        exp_date = self.athlete_data.get('expiration_date')
        if exp_date:
            self.expiration_date.setDate(QDate.fromString(exp_date[:10], 'yyyy-MM-dd'))
        
        # Status
        status_idx = self.status.findText(self.athlete_data.get('status', 'pending'))
        if status_idx >= 0:
            self.status.setCurrentIndex(status_idx)
        
        # Emergency contact
        self.emergency_contact_name.setText(self.athlete_data.get('emergency_contact_name', ''))
        self.emergency_contact_phone.setText(self.athlete_data.get('emergency_contact_phone', ''))
        self.address.setPlainText(self.athlete_data.get('address', ''))
        
        # Load additional tabs data if this is an existing athlete
        if self.athlete_id:
            self.load_grade_history()
            self.load_visas()
            self.load_results()
    
    def load_grade_history(self):
        """Load grade history data for this athlete"""
        if not hasattr(self, 'grade_history_table'):
            return
        
        # Use server_id if available, otherwise local id
        athlete_id = self.athlete_data.get('server_id') or self.athlete_id
        
        grade_history = self.db.get_grade_history_for_athlete(self.athlete_id)
        
        self.grade_history_table.setRowCount(len(grade_history))
        
        for row, record in enumerate(grade_history):
            # Grade name
            self.grade_history_table.setItem(row, 0, QTableWidgetItem(record.get('grade_name', '')))
            
            # Date earned
            date_earned = record.get('date_earned', '')
            if date_earned:
                date_earned = date_earned[:10]  # Get just YYYY-MM-DD
            self.grade_history_table.setItem(row, 1, QTableWidgetItem(date_earned))
            
            # Event
            self.grade_history_table.setItem(row, 2, QTableWidgetItem(record.get('event_title', '')))
            
            # Status
            status = record.get('status', 'pending')
            status_item = QTableWidgetItem(status.capitalize())
            # Color code status
            if status == 'approved':
                status_item.setForeground(Qt.GlobalColor.darkGreen)
            elif status == 'rejected':
                status_item.setForeground(Qt.GlobalColor.red)
            self.grade_history_table.setItem(row, 3, status_item)
        
        if len(grade_history) == 0:
            self.grade_history_table.setRowCount(1)
            self.grade_history_table.setItem(0, 0, QTableWidgetItem('No grade history yet'))
            self.grade_history_table.setSpan(0, 0, 1, 4)
    
    def load_visas(self):
        """Load visas data for this athlete"""
        if not hasattr(self, 'visas_table'):
            return
        
        visas = self.db.get_visas_for_athlete(self.athlete_id)
        
        self.visas_table.setRowCount(len(visas))
        
        for row, record in enumerate(visas):
            # Type
            visa_type = record.get('visa_type', 'medical')
            self.visas_table.setItem(row, 0, QTableWidgetItem(visa_type.capitalize()))
            
            # Issued date
            issued_date = record.get('issued_date', '')
            if issued_date:
                issued_date = issued_date[:10]
            self.visas_table.setItem(row, 1, QTableWidgetItem(issued_date))
            
            # Expiration
            expiration = record.get('expiration_date', '')
            if expiration:
                expiration = expiration[:10]
            self.visas_table.setItem(row, 2, QTableWidgetItem(expiration))
            
            # Status
            status = record.get('status', 'pending')
            status_item = QTableWidgetItem(status.capitalize())
            if status == 'approved':
                status_item.setForeground(Qt.GlobalColor.darkGreen)
            elif status == 'rejected':
                status_item.setForeground(Qt.GlobalColor.red)
            self.visas_table.setItem(row, 3, status_item)
            
            # Valid
            is_valid = record.get('is_valid', 0)
            valid_text = '✓ Yes' if is_valid else '✗ No'
            valid_item = QTableWidgetItem(valid_text)
            if is_valid:
                valid_item.setForeground(Qt.GlobalColor.darkGreen)
            else:
                valid_item.setForeground(Qt.GlobalColor.red)
            self.visas_table.setItem(row, 4, valid_item)
        
        if len(visas) == 0:
            self.visas_table.setRowCount(1)
            self.visas_table.setItem(0, 0, QTableWidgetItem('No visas yet'))
            self.visas_table.setSpan(0, 0, 1, 5)
    
    def load_results(self):
        """Load competition results for this athlete"""
        if not hasattr(self, 'results_table'):
            return
        
        results = self.db.get_results_for_athlete(self.athlete_id)
        
        self.results_table.setRowCount(len(results))
        
        for row, record in enumerate(results):
            # Event
            self.results_table.setItem(row, 0, QTableWidgetItem(record.get('event_title', '')))
            
            # Category
            self.results_table.setItem(row, 1, QTableWidgetItem(record.get('category_name', '')))
            
            # Type
            result_type = record.get('result_type', 'individual')
            self.results_table.setItem(row, 2, QTableWidgetItem(result_type.capitalize()))
            
            # Score
            score = record.get('score', 0)
            self.results_table.setItem(row, 3, QTableWidgetItem(str(score)))
            
            # Rank
            rank = record.get('rank', '')
            if rank:
                rank_item = QTableWidgetItem(f"#{rank}")
                # Color code podium positions
                if rank == 1:
                    rank_item.setForeground(Qt.GlobalColor.darkYellow)  # Gold
                elif rank == 2:
                    rank_item.setForeground(Qt.GlobalColor.gray)  # Silver
                elif rank == 3:
                    rank_item.setForeground(Qt.GlobalColor.darkRed)  # Bronze
                self.results_table.setItem(row, 4, rank_item)
            else:
                self.results_table.setItem(row, 4, QTableWidgetItem('-'))
            
            # Status
            status = record.get('status', 'pending')
            status_item = QTableWidgetItem(status.capitalize())
            if status == 'approved':
                status_item.setForeground(Qt.GlobalColor.darkGreen)
            elif status == 'rejected':
                status_item.setForeground(Qt.GlobalColor.red)
            self.results_table.setItem(row, 5, status_item)
        
        if len(results) == 0:
            self.results_table.setRowCount(1)
            self.results_table.setItem(0, 0, QTableWidgetItem('No competition results yet'))
            self.results_table.setSpan(0, 0, 1, 6)
    
    def save(self):
        """Save athlete data"""
        # Validate
        if not self.first_name.text().strip() or not self.last_name.text().strip():
            QMessageBox.warning(self, 'Validation Error', 'First name and last name are required')
            return
        
        # Prepare data
        data = {
            'first_name': self.first_name.text().strip(),
            'last_name': self.last_name.text().strip(),
            'mobile_number': self.mobile_number.text().strip(),
            'date_of_birth': self.date_of_birth.date().toString('yyyy-MM-dd'),
            'club_id': self.club.currentData(),
            'club_name': self.club.currentText() if self.club.currentData() else None,
            'city_id': self.city.currentData(),
            'city_name': self.city.currentText() if self.city.currentData() else None,
            'current_grade_id': self.current_grade.currentData(),
            'current_grade_name': self.current_grade.currentText() if self.current_grade.currentData() else None,
            'registered_date': self.registered_date.date().toString('yyyy-MM-dd'),
            'expiration_date': self.expiration_date.date().toString('yyyy-MM-dd'),
            'status': self.status.currentText(),
            'emergency_contact_name': self.emergency_contact_name.text().strip(),
            'emergency_contact_phone': self.emergency_contact_phone.text().strip(),
            'address': self.address.toPlainText().strip(),
            'is_synced': 0,  # Mark as unsynced
            'created_offline': 1 if not self.athlete_id else 0
        }
        
        try:
            if self.athlete_id:
                # Update existing
                self.db.update_athlete(self.athlete_id, data)
                QMessageBox.information(self, 'Success', 'Athlete updated successfully')
            else:
                # Create new
                self.db.insert_athlete(data)
                QMessageBox.information(self, 'Success', 'Athlete created successfully')
            
            self.accept()
        except Exception as e:
            QMessageBox.critical(self, 'Error', f'Failed to save athlete: {str(e)}')
    
    def delete_athlete(self):
        """Delete this athlete"""
        if not self.athlete_id:
            return
        
        name = f"{self.athlete_data.get('first_name', '')} {self.athlete_data.get('last_name', '')}"
        
        reply = QMessageBox.question(
            self, 'Confirm Delete',
            f'Are you sure you want to delete {name}?\n\nThis action cannot be undone.',
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            try:
                self.db.delete_athlete(self.athlete_id)
                QMessageBox.information(self, 'Success', 'Athlete deleted successfully')
                self.accept()  # Close dialog and signal parent to reload
            except Exception as e:
                QMessageBox.critical(self, 'Error', f'Failed to delete athlete: {str(e)}')
    
    def load_grade_history(self):
        """Load grade history data into table"""
        if not self.athlete_id:
            return
        
        grade_history = self.db.get_grade_history_for_athlete(self.athlete_id)
        self.grade_history_table.setRowCount(len(grade_history))
        
        for row, record in enumerate(grade_history):
            # Grade
            self.grade_history_table.setItem(row, 0, QTableWidgetItem(record.get('grade_name', '')))
            
            # Date Earned
            obtained_date = record.get('obtained_date', '')
            if obtained_date:
                # Format date nicely
                from datetime import datetime
                try:
                    dt = datetime.fromisoformat(obtained_date.replace('Z', '+00:00'))
                    obtained_date = dt.strftime('%Y-%m-%d')
                except:
                    pass
            self.grade_history_table.setItem(row, 1, QTableWidgetItem(obtained_date))
            
            # Event
            event_name = record.get('event_name', '') or 'N/A'
            self.grade_history_table.setItem(row, 2, QTableWidgetItem(event_name))
            
            # Status
            status = record.get('status', 'approved')
            status_item = QTableWidgetItem(status.title())
            
            # Color code status
            if status == 'approved':
                status_item.setForeground(Qt.GlobalColor.darkGreen)
            elif status == 'rejected':
                status_item.setForeground(Qt.GlobalColor.red)
            elif status == 'pending':
                status_item.setForeground(Qt.GlobalColor.darkYellow)
            
            self.grade_history_table.setItem(row, 3, status_item)
    
    def load_visas(self):
        """Load visas data into table"""
        if not self.athlete_id:
            return
        
        visas = self.db.get_visas_for_athlete(self.athlete_id)
        self.visas_table.setRowCount(len(visas))
        
        for row, record in enumerate(visas):
            # Type
            visa_type = record.get('visa_type', '').title()
            self.visas_table.setItem(row, 0, QTableWidgetItem(visa_type))
            
            # Issued Date
            issued_date = record.get('issued_date', '')
            if issued_date:
                from datetime import datetime
                try:
                    dt = datetime.fromisoformat(issued_date.replace('Z', '+00:00'))
                    issued_date = dt.strftime('%Y-%m-%d')
                except:
                    pass
            self.visas_table.setItem(row, 1, QTableWidgetItem(issued_date))
            
            # Expiration (calculated based on visa type)
            if issued_date and record.get('issued_date'):
                from datetime import datetime, timedelta
                try:
                    dt = datetime.fromisoformat(record.get('issued_date').replace('Z', '+00:00'))
                    if record.get('visa_type') == 'medical':
                        expiration = dt + timedelta(days=180)
                    else:  # annual
                        expiration = dt + timedelta(days=365)
                    self.visas_table.setItem(row, 2, QTableWidgetItem(expiration.strftime('%Y-%m-%d')))
                except:
                    self.visas_table.setItem(row, 2, QTableWidgetItem('N/A'))
            else:
                self.visas_table.setItem(row, 2, QTableWidgetItem('N/A'))
            
            # Status
            status = record.get('status', 'approved')
            status_item = QTableWidgetItem(status.title())
            
            if status == 'approved':
                status_item.setForeground(Qt.GlobalColor.darkGreen)
            elif status == 'rejected':
                status_item.setForeground(Qt.GlobalColor.red)
            elif status == 'pending':
                status_item.setForeground(Qt.GlobalColor.darkYellow)
            
            self.visas_table.setItem(row, 3, status_item)
            
            # Valid
            is_valid = record.get('is_valid', 0)
            valid_item = QTableWidgetItem('✓ Yes' if is_valid else '✗ No')
            
            if is_valid:
                valid_item.setForeground(Qt.GlobalColor.darkGreen)
            else:
                valid_item.setForeground(Qt.GlobalColor.red)
            
            self.visas_table.setItem(row, 4, valid_item)
    
    def load_results(self):
        """Load competition results data into table"""
        if not self.athlete_id:
            return
        
        # Get all results
        self.all_results = self.db.get_results_for_athlete(self.athlete_id)
        
        # Update stats
        solo_count = sum(1 for r in self.all_results if r.get('result_type') == 'solo')
        fight_count = sum(1 for r in self.all_results if r.get('result_type') == 'fight')
        teams_count = sum(1 for r in self.all_results if r.get('result_type') == 'teams')
        
        self.solo_count_label.setText(f'🥋 Solo: {solo_count}')
        self.fight_count_label.setText(f'🥊 Fight: {fight_count}')
        self.teams_count_label.setText(f'👥 Teams: {teams_count}')
        
        # Apply current filter
        self.filter_results()
    
    def filter_results(self):
        """Filter results by selected type"""
        if not hasattr(self, 'all_results'):
            return
        
        filter_type = self.result_type_filter.currentText().lower()
        
        # Filter results
        if filter_type == 'all':
            filtered_results = self.all_results
        else:
            filtered_results = [r for r in self.all_results if r.get('result_type') == filter_type]
        
        # Display filtered results
        self.display_results(filtered_results)
    
    def display_results(self, results):
        """Display results in the table"""
        self.results_table.setRowCount(len(results))
        
        for row, record in enumerate(results):
            # Event
            event_title = record.get('event_title', '') or 'N/A'
            self.results_table.setItem(row, 0, QTableWidgetItem(event_title))
            
            # Category
            category_name = record.get('category_name', '') or 'N/A'
            self.results_table.setItem(row, 1, QTableWidgetItem(category_name))
            
            # Type with icon
            result_type = record.get('result_type', 'individual')
            type_icon = {
                'solo': '🥋',
                'fight': '🥊',
                'teams': '👥'
            }.get(result_type, '📋')
            
            type_text = f"{type_icon} {result_type.title()}"
            type_item = QTableWidgetItem(type_text)
            
            # Color code by type
            if result_type == 'solo':
                type_item.setForeground(Qt.GlobalColor.blue)
            elif result_type == 'fight':
                type_item.setForeground(Qt.GlobalColor.darkRed)
            elif result_type == 'teams':
                type_item.setForeground(Qt.GlobalColor.darkGreen)
            
            self.results_table.setItem(row, 2, type_item)
            
            # Placement (Rank)
            rank = record.get('rank')
            if rank:
                placement_text = {1: '🥇 1st Place', 2: '🥈 2nd Place', 3: '🥉 3rd Place'}.get(rank, f'#{rank}')
                placement_item = QTableWidgetItem(placement_text)
                
                # Color code podium positions
                if rank == 1:
                    placement_item.setForeground(Qt.GlobalColor.darkYellow)  # Gold
                    font = placement_item.font()
                    font.setBold(True)
                    placement_item.setFont(font)
                elif rank == 2:
                    placement_item.setForeground(Qt.GlobalColor.darkGray)  # Silver
                elif rank == 3:
                    placement_item.setForeground(Qt.GlobalColor.darkRed)  # Bronze
                
                self.results_table.setItem(row, 3, placement_item)
            else:
                self.results_table.setItem(row, 3, QTableWidgetItem('-'))
            
            # Status
            status = record.get('status', 'pending')
            status_item = QTableWidgetItem(status.title())
            
            if status == 'approved':
                status_item.setForeground(Qt.GlobalColor.darkGreen)
            elif status == 'rejected':
                status_item.setForeground(Qt.GlobalColor.red)
            elif status == 'pending':
                status_item.setForeground(Qt.GlobalColor.darkYellow)
            
            self.results_table.setItem(row, 4, status_item)
        
        if len(results) == 0:
            self.results_table.setRowCount(1)
            no_data_text = 'No results for this filter' if self.result_type_filter.currentText() != 'All' else 'No competition results yet'
            self.results_table.setItem(0, 0, QTableWidgetItem(no_data_text))
            self.results_table.setSpan(0, 0, 1, 5)

