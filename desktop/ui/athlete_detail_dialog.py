"""
Athlete detail dialog for viewing and editing
"""
from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QFormLayout, QLineEdit,
    QComboBox, QDateEdit, QTextEdit, QPushButton, QMessageBox, QTabWidget, QWidget
)
from PyQt6.QtCore import QDate
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
        
        layout.addWidget(tabs)
        
        # Buttons
        button_layout = QHBoxLayout()
        
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
