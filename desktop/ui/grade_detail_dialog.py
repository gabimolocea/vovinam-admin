"""
Grade detail dialog for viewing and editing
"""
from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QFormLayout, QLineEdit, QComboBox,
    QSpinBox, QPushButton, QMessageBox, QHBoxLayout
)
from models.db import Database

class GradeDetailDialog(QDialog):
    def __init__(self, db: Database, grade_id: int = None, parent=None):
        super().__init__(parent)
        self.db = db
        self.grade_id = grade_id
        self.grade_data = None
        
        if grade_id:
            grades = db.get_all_grades()
            self.grade_data = next((g for g in grades if g['id'] == grade_id), None)
            self.setWindowTitle(f"Edit Grade - {self.grade_data.get('name', '')}")
        else:
            self.setWindowTitle('New Grade')
        
        self.init_ui()
        
        if self.grade_data:
            self.load_data()
    
    def init_ui(self):
        """Initialize the dialog UI"""
        self.setMinimumWidth(500)
        
        layout = QVBoxLayout(self)
        form_layout = QFormLayout()
        
        self.name = QLineEdit()
        form_layout.addRow('Name:', self.name)
        
        self.rank_order = QSpinBox()
        self.rank_order.setRange(0, 100)
        form_layout.addRow('Rank Order:', self.rank_order)
        
        self.grade_type = QComboBox()
        self.grade_type.addItems(['inferior', 'superior'])
        form_layout.addRow('Grade Type:', self.grade_type)
        
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
    
    def load_data(self):
        """Load grade data into form"""
        if not self.grade_data:
            return
        
        self.name.setText(self.grade_data.get('name', ''))
        self.rank_order.setValue(self.grade_data.get('rank_order', 0))
        
        grade_type_idx = self.grade_type.findText(self.grade_data.get('grade_type', 'inferior'))
        if grade_type_idx >= 0:
            self.grade_type.setCurrentIndex(grade_type_idx)
    
    def save(self):
        """Save grade data"""
        if not self.name.text().strip():
            QMessageBox.warning(self, 'Validation Error', 'Name is required')
            return
        
        data = {
            'name': self.name.text().strip(),
            'rank_order': self.rank_order.value(),
            'grade_type': self.grade_type.currentText()
        }
        
        try:
            if self.grade_id:
                self.db.update_grade(self.grade_id, data)
                QMessageBox.information(self, 'Success', 'Grade updated successfully')
            else:
                self.db.insert_grade(data)
                QMessageBox.information(self, 'Success', 'Grade created successfully')
            
            self.accept()
        except Exception as e:
            QMessageBox.critical(self, 'Error', f'Failed to save grade: {str(e)}')
