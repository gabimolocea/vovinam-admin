"""
Categories tab widget
"""
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QTableWidget, QTableWidgetItem,
    QHeaderView, QAbstractItemView, QPushButton, QMessageBox
)
from PyQt6.QtCore import Qt
from models.db import Database

class CategoriesTab(QWidget):
    def __init__(self, db: Database):
        super().__init__()
        self.db = db
        self.init_ui()
    
    def init_ui(self):
        """Initialize the widget"""
        layout = QVBoxLayout(self)
        
        # Buttons
        button_layout = QHBoxLayout()
        
        btn_new = QPushButton('➕ New Category')
        btn_new.clicked.connect(self.create_category)
        button_layout.addWidget(btn_new)
        
        button_layout.addStretch()
        layout.addLayout(button_layout)
        
        # Create table
        self.table = QTableWidget()
        self.table.setColumnCount(8)
        self.table.setHorizontalHeaderLabels([
            'ID', 'Competition', 'Name', 'Gender', 'Age Range', 'Weight Range', 'Type', 'Team'
        ])
        
        # Table settings
        self.table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.table.setAlternatingRowColors(True)
        
        # Column widths
        header = self.table.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        
        # Double-click to open details
        self.table.doubleClicked.connect(self.edit_category)
        
        layout.addWidget(self.table)
    
    def load_categories(self):
        """Load categories from database"""
        categories = self.db.get_all_categories()
        
        self.table.setRowCount(len(categories))
        
        for row, cat in enumerate(categories):
            self.table.setItem(row, 0, QTableWidgetItem(str(cat.get('id', ''))))
            self.table.setItem(row, 1, QTableWidgetItem(cat.get('competition_title', '')))
            self.table.setItem(row, 2, QTableWidgetItem(cat.get('name', '')))
            self.table.setItem(row, 3, QTableWidgetItem(cat.get('gender', '')))
            
            # Age range
            min_age = cat.get('min_age', '')
            max_age = cat.get('max_age', '')
            age_range = f"{min_age}-{max_age}" if min_age and max_age else ''
            self.table.setItem(row, 4, QTableWidgetItem(age_range))
            
            # Weight range
            min_weight = cat.get('min_weight', '')
            max_weight = cat.get('max_weight', '')
            weight_range = f"{min_weight}-{max_weight}" if min_weight and max_weight else ''
            self.table.setItem(row, 5, QTableWidgetItem(weight_range))
            
            self.table.setItem(row, 6, QTableWidgetItem(cat.get('category_type', '')))
            
            team = '✓' if cat.get('is_team_category') else ''
            self.table.setItem(row, 7, QTableWidgetItem(team))
    
    def get_selected_category_id(self):
        """Get the ID of the currently selected category"""
        selected = self.table.selectedItems()
        if not selected:
            return None
        
        row = selected[0].row()
        id_item = self.table.item(row, 0)
        return int(id_item.text()) if id_item else None
    
    def create_category(self):
        """Open dialog to create new category"""
        from ui.category_detail_dialog import CategoryDetailDialog
        dialog = CategoryDetailDialog(self.db, parent=self)
        if dialog.exec():
            self.load_categories()
    
    def edit_category(self):
        """Open dialog to edit selected category"""
        cat_id = self.get_selected_category_id()
        if not cat_id:
            QMessageBox.warning(self, 'No Selection', 'Please select a category to edit')
            return
        
        from ui.category_detail_dialog import CategoryDetailDialog
        dialog = CategoryDetailDialog(self.db, cat_id, parent=self)
        if dialog.exec():
            self.load_categories()
    
    def delete_category(self):
        """Delete selected category"""
        cat_id = self.get_selected_category_id()
        if not cat_id:
            QMessageBox.warning(self, 'No Selection', 'Please select a category to delete')
            return
        
        categories = self.db.get_all_categories()
        cat = next((c for c in categories if c['id'] == cat_id), None)
        if not cat:
            return
        
        reply = QMessageBox.question(
            self, 'Confirm Delete',
            f'Are you sure you want to delete category "{cat.get("name")}"?',
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            try:
                self.db.delete_category(cat_id)
                QMessageBox.information(self, 'Success', 'Category deleted successfully')
                self.load_categories()
            except Exception as e:
                QMessageBox.critical(self, 'Error', f'Failed to delete category: {str(e)}')
