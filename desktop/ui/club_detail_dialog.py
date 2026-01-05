"""
Club detail dialog for viewing and editing
"""
from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QFormLayout, QLineEdit, QComboBox,
    QTextEdit, QPushButton, QMessageBox, QHBoxLayout
)
from models.db import Database

class ClubDetailDialog(QDialog):
    def __init__(self, db: Database, club_id: int = None, parent=None):
        super().__init__(parent)
        self.db = db
        self.club_id = club_id
        self.club_data = None
        
        if club_id:
            clubs = db.get_all_clubs()
            self.club_data = next((c for c in clubs if c['id'] == club_id), None)
            self.setWindowTitle(f"Edit Club - {self.club_data.get('name', '')}")
        else:
            self.setWindowTitle('New Club')
        
        self.init_ui()
        
        if self.club_data:
            self.load_data()
    
    def init_ui(self):
        """Initialize the dialog UI"""
        self.setMinimumWidth(500)
        
        layout = QVBoxLayout(self)
        form_layout = QFormLayout()
        
        self.name = QLineEdit()
        form_layout.addRow('Name:', self.name)
        
        self.city = QComboBox()
        self.load_cities()
        form_layout.addRow('City:', self.city)
        
        self.address = QTextEdit()
        self.address.setMaximumHeight(80)
        form_layout.addRow('Address:', self.address)
        
        self.mobile_number = QLineEdit()
        form_layout.addRow('Mobile Number:', self.mobile_number)
        
        self.website = QLineEdit()
        form_layout.addRow('Website:', self.website)
        
        layout.addLayout(form_layout)
        
        # Buttons
        button_layout = QHBoxLayout()
        
        btn_save = QPushButton('💾 Save')
        btn_save.clicked.connect(self.save)
        button_layout.addWidget(btn_save)
        
        btn_cancel = QPushButton('❌ Cancel')
        btn_cancel.clicked.connect(self.reject)
        button_layout.addWidget(btn_cancel)
        
        layout.addLayout(button_layout)
    
    def load_cities(self):
        """Load cities from database"""
        cities = self.db.get_all_cities()
        self.city.addItem('', None)
        for city in cities:
            city_id = city.get('server_id') or city['id']
            self.city.addItem(city['name'], city_id)
    
    def load_data(self):
        """Load club data into form"""
        if not self.club_data:
            return
        
        self.name.setText(self.club_data.get('name', ''))
        self.address.setPlainText(self.club_data.get('address', ''))
        self.mobile_number.setText(self.club_data.get('mobile_number', ''))
        self.website.setText(self.club_data.get('website', ''))
        
        city_id = self.club_data.get('city_id')
        if city_id:
            idx = self.city.findData(city_id)
            if idx >= 0:
                self.city.setCurrentIndex(idx)
    
    def save(self):
        """Save club data"""
        if not self.name.text().strip():
            QMessageBox.warning(self, 'Validation Error', 'Name is required')
            return
        
        data = {
            'name': self.name.text().strip(),
            'city_id': self.city.currentData(),
            'city_name': self.city.currentText() if self.city.currentData() else None,
            'address': self.address.toPlainText().strip(),
            'mobile_number': self.mobile_number.text().strip(),
            'website': self.website.text().strip()
        }
        
        try:
            if self.club_id:
                self.db.update_club(self.club_id, data)
                QMessageBox.information(self, 'Success', 'Club updated successfully')
            else:
                self.db.insert_club(data)
                QMessageBox.information(self, 'Success', 'Club created successfully')
            
            self.accept()
        except Exception as e:
            QMessageBox.critical(self, 'Error', f'Failed to save club: {str(e)}')
