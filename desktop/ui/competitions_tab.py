"""
Competitions tab widget
"""
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QTableWidget, QTableWidgetItem,
    QHeaderView, QAbstractItemView, QPushButton, QMessageBox
)
from PyQt6.QtCore import Qt
from models.db import Database

class CompetitionsTab(QWidget):
    def __init__(self, db: Database, sync_manager):
        super().__init__()
        self.db = db
        self.sync_manager = sync_manager
        self.init_ui()
    
    def init_ui(self):
        """Initialize the widget"""
        layout = QVBoxLayout(self)
        
        # Buttons
        button_layout = QHBoxLayout()
        
        btn_new = QPushButton('➕ New Competition')
        btn_new.clicked.connect(self.create_competition)
        button_layout.addWidget(btn_new)
        
        btn_edit = QPushButton('✏️ Edit')
        btn_edit.clicked.connect(self.edit_competition)
        button_layout.addWidget(btn_edit)
        
        btn_delete = QPushButton('🗑️ Delete')
        btn_delete.clicked.connect(self.delete_competition)
        button_layout.addWidget(btn_delete)
        
        btn_refresh = QPushButton('🔄 Refresh')
        btn_refresh.clicked.connect(self.load_competitions)
        button_layout.addWidget(btn_refresh)
        
        button_layout.addStretch()
        layout.addLayout(button_layout)
        
        # Create table
        self.table = QTableWidget()
        self.table.setColumnCount(7)
        self.table.setHorizontalHeaderLabels([
            'ID', 'Title', 'Start Date', 'End Date', 'City', 'Featured', 'Synced'
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
        header.setSectionResizeMode(4, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(5, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(6, QHeaderView.ResizeMode.ResizeToContents)
        
        layout.addWidget(self.table)
    
    def load_competitions(self):
        """Load competitions from database"""
        competitions = self.db.get_all_competitions()
        
        self.table.setRowCount(len(competitions))
        
        for row, comp in enumerate(competitions):
            self.table.setItem(row, 0, QTableWidgetItem(str(comp.get('id', ''))))
            self.table.setItem(row, 1, QTableWidgetItem(comp.get('title', '')))
            self.table.setItem(row, 2, QTableWidgetItem(comp.get('start_date', '')[:10] if comp.get('start_date') else ''))
            self.table.setItem(row, 3, QTableWidgetItem(comp.get('end_date', '')[:10] if comp.get('end_date') else ''))
            self.table.setItem(row, 4, QTableWidgetItem(comp.get('city_name', '')))
            
            featured = '⭐' if comp.get('is_featured') else ''
            self.table.setItem(row, 5, QTableWidgetItem(featured))
            
            synced = '✓' if comp.get('last_synced_at') else '✗'
            self.table.setItem(row, 6, QTableWidgetItem(synced))
    
    def get_selected_competition_id(self):
        """Get the ID of the currently selected competition"""
        selected = self.table.selectedItems()
        if not selected:
            return None
        
        row = selected[0].row()
        id_item = self.table.item(row, 0)
        return int(id_item.text()) if id_item else None
    
    def create_competition(self):
        """Open dialog to create new competition"""
        from ui.competition_detail_dialog import CompetitionDetailDialog
        dialog = CompetitionDetailDialog(self.db, parent=self)
        if dialog.exec():
            self.load_competitions()
    
    def edit_competition(self):
        """Open dialog to edit selected competition"""
        comp_id = self.get_selected_competition_id()
        if not comp_id:
            QMessageBox.warning(self, 'No Selection', 'Please select a competition to edit')
            return
        
        from ui.competition_detail_dialog import CompetitionDetailDialog
        dialog = CompetitionDetailDialog(self.db, comp_id, parent=self)
        if dialog.exec():
            self.load_competitions()
    
    def delete_competition(self):
        """Delete selected competition"""
        comp_id = self.get_selected_competition_id()
        if not comp_id:
            QMessageBox.warning(self, 'No Selection', 'Please select a competition to delete')
            return
        
        competitions = self.db.get_all_competitions()
        comp = next((c for c in competitions if c['id'] == comp_id), None)
        if not comp:
            return
        
        reply = QMessageBox.question(
            self, 'Confirm Delete',
            f'Are you sure you want to delete "{comp.get("title")}"?',
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            try:
                self.db.delete_competition(comp_id)
                QMessageBox.information(self, 'Success', 'Competition deleted successfully')
                self.load_competitions()
            except Exception as e:
                QMessageBox.critical(self, 'Error', f'Failed to delete competition: {str(e)}')
