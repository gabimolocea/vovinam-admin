"""
Category detail dialog for viewing and editing
"""
from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QFormLayout, QLineEdit, QComboBox,
    QSpinBox, QDoubleSpinBox, QPushButton, QMessageBox, QCheckBox, QHBoxLayout
)
from models.db import Database

class CategoryDetailDialog(QDialog):
    def __init__(self, db: Database, category_id: int = None, parent=None):
        super().__init__(parent)
        self.db = db
        self.category_id = category_id
        self.category_data = None
        
        if category_id:
            categories = db.get_all_categories()
            self.category_data = next((c for c in categories if c['id'] == category_id), None)
            self.setWindowTitle(f"Edit Category - {self.category_data.get('name', '')}")
        else:
            self.setWindowTitle('New Category')
        
        self.init_ui()
        
        if self.category_data:
            self.load_data()
    
    def init_ui(self):
        """Initialize the dialog UI"""
        self.setMinimumWidth(500)
        
        layout = QVBoxLayout(self)
        form_layout = QFormLayout()
        
        self.competition = QComboBox()
        self.load_competitions()
        form_layout.addRow('Competition:', self.competition)
        
        self.name = QLineEdit()
        form_layout.addRow('Name:', self.name)
        
        self.gender = QComboBox()
        self.gender.addItems(['', 'male', 'female', 'mixt'])
        form_layout.addRow('Gender:', self.gender)
        
        self.min_age = QSpinBox()
        self.min_age.setRange(0, 100)
        self.min_age.setSpecialValueText('No minimum')
        form_layout.addRow('Min Age:', self.min_age)
        
        self.max_age = QSpinBox()
        self.max_age.setRange(0, 100)
        self.max_age.setSpecialValueText('No maximum')
        form_layout.addRow('Max Age:', self.max_age)
        
        self.min_weight = QDoubleSpinBox()
        self.min_weight.setRange(0, 200)
        self.min_weight.setSuffix(' kg')
        self.min_weight.setSpecialValueText('No minimum')
        form_layout.addRow('Min Weight:', self.min_weight)
        
        self.max_weight = QDoubleSpinBox()
        self.max_weight.setRange(0, 200)
        self.max_weight.setSuffix(' kg')
        self.max_weight.setSpecialValueText('No maximum')
        form_layout.addRow('Max Weight:', self.max_weight)
        
        self.category_type = QComboBox()
        self.category_type.addItems(['', 'solo', 'teams', 'fight'])
        form_layout.addRow('Category Type:', self.category_type)
        
        self.is_team_category = QCheckBox('Team Category')
        form_layout.addRow('', self.is_team_category)
        
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
    
    def load_competitions(self):
        """Load competitions from database"""
        competitions = self.db.get_all_competitions()
        self.competition.addItem('', None)
        for comp in competitions:
            self.competition.addItem(comp['title'], comp.get('server_id') or comp['id'])
    
    def load_data(self):
        """Load category data into form"""
        if not self.category_data:
            return
        
        comp_id = self.category_data.get('competition_id')
        if comp_id:
            idx = self.competition.findData(comp_id)
            if idx >= 0:
                self.competition.setCurrentIndex(idx)
        
        self.name.setText(self.category_data.get('name', ''))
        
        gender_idx = self.gender.findText(self.category_data.get('gender', ''))
        if gender_idx >= 0:
            self.gender.setCurrentIndex(gender_idx)
        
        self.min_age.setValue(self.category_data.get('min_age') or 0)
        self.max_age.setValue(self.category_data.get('max_age') or 0)
        self.min_weight.setValue(self.category_data.get('min_weight') or 0)
        self.max_weight.setValue(self.category_data.get('max_weight') or 0)
        
        cat_type_idx = self.category_type.findText(self.category_data.get('category_type', ''))
        if cat_type_idx >= 0:
            self.category_type.setCurrentIndex(cat_type_idx)
        
        self.is_team_category.setChecked(bool(self.category_data.get('is_team_category')))
    
    def save(self):
        """Save category data"""
        if not self.name.text().strip():
            QMessageBox.warning(self, 'Validation Error', 'Name is required')
            return
        
        if not self.competition.currentData():
            QMessageBox.warning(self, 'Validation Error', 'Competition is required')
            return
        
        data = {
            'competition_id': self.competition.currentData(),
            'competition_title': self.competition.currentText(),
            'name': self.name.text().strip(),
            'gender': self.gender.currentText(),
            'min_age': self.min_age.value() if self.min_age.value() > 0 else None,
            'max_age': self.max_age.value() if self.max_age.value() > 0 else None,
            'min_weight': self.min_weight.value() if self.min_weight.value() > 0 else None,
            'max_weight': self.max_weight.value() if self.max_weight.value() > 0 else None,
            'category_type': self.category_type.currentText(),
            'is_team_category': 1 if self.is_team_category.isChecked() else 0
        }
        
        try:
            if self.category_id:
                self.db.update_category(self.category_id, data)
                QMessageBox.information(self, 'Success', 'Category updated successfully')
            else:
                self.db.insert_category(data)
                QMessageBox.information(self, 'Success', 'Category created successfully')
            
            self.accept()
        except Exception as e:
            QMessageBox.critical(self, 'Error', f'Failed to save category: {str(e)}')
