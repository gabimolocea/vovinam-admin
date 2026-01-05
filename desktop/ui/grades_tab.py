"""
Grades tab widget
"""
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QTableWidget, QTableWidgetItem,
    QHeaderView, QAbstractItemView, QPushButton, QMessageBox
)
from PyQt6.QtCore import Qt
from models.db import Database

class GradesTab(QWidget):
    def __init__(self, db: Database):
        super().__init__()
        self.db = db
        self.init_ui()
    
    def init_ui(self):
        """Initialize the widget"""
        layout = QVBoxLayout(self)
        
        # Buttons
        button_layout = QHBoxLayout()
        
        btn_new = QPushButton('➕ New Grade')
        btn_new.clicked.connect(self.create_grade)
        button_layout.addWidget(btn_new)
        
        button_layout.addStretch()
        layout.addLayout(button_layout)
        
        # Create table
        self.table = QTableWidget()
        self.table.setColumnCount(5)
        self.table.setHorizontalHeaderLabels([
            'ID', 'Name', 'Rank Order', 'Type', 'Synced'
        ])
        
        # Table settings
        self.table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.table.setAlternatingRowColors(True)
        
        # Column widths
        header = self.table.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(4, QHeaderView.ResizeMode.ResizeToContents)
        
        # Double-click to open details
        self.table.doubleClicked.connect(self.edit_grade)
        
        layout.addWidget(self.table)
    
    def load_grades(self):
        """Load grades from database"""
        grades = self.db.get_all_grades()
        
        self.table.setRowCount(len(grades))
        
        for row, grade in enumerate(grades):
            self.table.setItem(row, 0, QTableWidgetItem(str(grade.get('id', ''))))
            self.table.setItem(row, 1, QTableWidgetItem(grade.get('name', '')))
            self.table.setItem(row, 2, QTableWidgetItem(str(grade.get('rank_order', 0))))
            self.table.setItem(row, 3, QTableWidgetItem(grade.get('grade_type', 'inferior')))
            
            synced = '✓' if grade.get('last_synced_at') else '✗'
            self.table.setItem(row, 4, QTableWidgetItem(synced))
    
    def get_selected_grade_id(self):
        """Get the ID of the currently selected grade"""
        selected = self.table.selectedItems()
        if not selected:
            return None
        
        row = selected[0].row()
        id_item = self.table.item(row, 0)
        return int(id_item.text()) if id_item else None
    
    def create_grade(self):
        """Open dialog to create new grade"""
        from ui.grade_detail_dialog import GradeDetailDialog
        dialog = GradeDetailDialog(self.db, parent=self)
        if dialog.exec():
            self.load_grades()
    
    def edit_grade(self):
        """Open dialog to edit selected grade"""
        grade_id = self.get_selected_grade_id()
        if not grade_id:
            QMessageBox.warning(self, 'No Selection', 'Please select a grade to edit')
            return
        
        from ui.grade_detail_dialog import GradeDetailDialog
        dialog = GradeDetailDialog(self.db, grade_id, parent=self)
        if dialog.exec():
            self.load_grades()
    
    def delete_grade(self):
        """Delete selected grade"""
        grade_id = self.get_selected_grade_id()
        if not grade_id:
            QMessageBox.warning(self, 'No Selection', 'Please select a grade to delete')
            return
        
        grades = self.db.get_all_grades()
        grade = next((g for g in grades if g['id'] == grade_id), None)
        if not grade:
            return
        
        reply = QMessageBox.question(
            self, 'Confirm Delete',
            f'Are you sure you want to delete grade "{grade.get("name")}"?',
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            try:
                self.db.delete_grade(grade_id)
                QMessageBox.information(self, 'Success', 'Grade deleted successfully')
                self.load_grades()
            except Exception as e:
                QMessageBox.critical(self, 'Error', f'Failed to delete grade: {str(e)}')
