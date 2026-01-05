"""
Competition detail dialog for viewing and editing
"""
from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QFormLayout, QLineEdit, QComboBox,
    QDateEdit, QTextEdit, QPushButton, QMessageBox, QCheckBox, QHBoxLayout
)
from PyQt6.QtCore import QDate
from models.db import Database

class CompetitionDetailDialog(QDialog):
    def __init__(self, db: Database, competition_id: int = None, parent=None):
        super().__init__(parent)
        self.db = db
        self.competition_id = competition_id
        self.competition_data = None
        
        if competition_id:
            competitions = db.get_all_competitions()
            self.competition_data = next((c for c in competitions if c['id'] == competition_id), None)
            self.setWindowTitle(f"Edit Competition - {self.competition_data.get('title', '')}")
        else:
            self.setWindowTitle('New Competition')
        
        self.init_ui()
        
        if self.competition_data:
            self.load_data()
    
    def init_ui(self):
        """Initialize the dialog UI"""
        self.setMinimumWidth(500)
        self.setMinimumHeight(500)
        
        layout = QVBoxLayout(self)
        form_layout = QFormLayout()
        
        self.title = QLineEdit()
        form_layout.addRow('Title:', self.title)
        
        self.description = QTextEdit()
        self.description.setMaximumHeight(100)
        form_layout.addRow('Description:', self.description)
        
        self.start_date = QDateEdit()
        self.start_date.setCalendarPopup(True)
        self.start_date.setDate(QDate.currentDate())
        form_layout.addRow('Start Date:', self.start_date)
        
        self.end_date = QDateEdit()
        self.end_date.setCalendarPopup(True)
        self.end_date.setDate(QDate.currentDate().addDays(1))
        form_layout.addRow('End Date:', self.end_date)
        
        self.address = QLineEdit()
        form_layout.addRow('Address:', self.address)
        
        self.city = QComboBox()
        self.load_cities()
        form_layout.addRow('City:', self.city)
        
        self.event_type = QComboBox()
        self.event_type.addItems(['competition', 'training', 'seminar', 'other'])
        form_layout.addRow('Event Type:', self.event_type)
        
        self.is_featured = QCheckBox('Featured Event')
        form_layout.addRow('', self.is_featured)
        
        layout.addLayout(form_layout)
        
        # Buttons
        button_layout = QHBoxLayout()
        
        # Delete button (only for existing competitions)
        if self.competition_id:
            btn_delete = QPushButton('🗑️ Delete')
            btn_delete.clicked.connect(self.delete_competition)
            button_layout.addWidget(btn_delete)
            button_layout.addStretch()
        
        btn_save = QPushButton('💾 Save')
        btn_save.clicked.connect(self.save)
        button_layout.addWidget(btn_save)
        
        btn_cancel = QPushButton('❌ Cancel')
        btn_cancel.clicked.connect(self.reject)
        button_layout.addWidget(btn_cancel)
        
        layout.addLayout(button_layout)
    
    def delete_competition(self):
        """Delete this competition"""
        reply = QMessageBox.question(
            self, 'Confirm Delete',
            f'Are you sure you want to delete "{self.competition_data.get("title", "this competition")}"?\n\nThis action cannot be undone.',
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            try:
                self.db.delete_competition(self.competition_id)
                QMessageBox.information(self, 'Success', 'Competition deleted successfully')
                self.accept()  # Close dialog after deletion
            except Exception as e:
                QMessageBox.critical(self, 'Error', f'Failed to delete competition: {str(e)}')
    
    def load_cities(self):
        """Load cities from database"""
        cities = self.db.get_all_cities()
        self.city.addItem('', None)
        for city in cities:
            self.city.addItem(city['name'], city['id'])
    
    def load_data(self):
        """Load competition data into form"""
        if not self.competition_data:
            return
        
        self.title.setText(self.competition_data.get('title', ''))
        self.description.setPlainText(self.competition_data.get('description', ''))
        
        start_date = self.competition_data.get('start_date')
        if start_date:
            self.start_date.setDate(QDate.fromString(start_date[:10], 'yyyy-MM-dd'))
        
        end_date = self.competition_data.get('end_date')
        if end_date:
            self.end_date.setDate(QDate.fromString(end_date[:10], 'yyyy-MM-dd'))
        
        self.address.setText(self.competition_data.get('address', ''))
        
        city_id = self.competition_data.get('city_id')
        if city_id:
            idx = self.city.findData(city_id)
            if idx >= 0:
                self.city.setCurrentIndex(idx)
        
        event_type_idx = self.event_type.findText(self.competition_data.get('event_type', 'competition'))
        if event_type_idx >= 0:
            self.event_type.setCurrentIndex(event_type_idx)
        
        self.is_featured.setChecked(bool(self.competition_data.get('is_featured')))
    
    def save(self):
        """Save competition data"""
        if not self.title.text().strip():
            QMessageBox.warning(self, 'Validation Error', 'Title is required')
            return
        
        data = {
            'title': self.title.text().strip(),
            'description': self.description.toPlainText().strip(),
            'start_date': self.start_date.date().toString('yyyy-MM-dd'),
            'end_date': self.end_date.date().toString('yyyy-MM-dd'),
            'address': self.address.text().strip(),
            'city_id': self.city.currentData(),
            'city_name': self.city.currentText() if self.city.currentData() else None,
            'event_type': self.event_type.currentText(),
            'is_featured': 1 if self.is_featured.isChecked() else 0
        }
        
        try:
            if self.competition_id:
                self.db.update_competition(self.competition_id, data)
                QMessageBox.information(self, 'Success', 'Competition updated successfully')
            else:
                self.db.insert_competition(data)
                QMessageBox.information(self, 'Success', 'Competition created successfully')
            
            self.accept()
        except Exception as e:
            QMessageBox.critical(self, 'Error', f'Failed to save competition: {str(e)}')
