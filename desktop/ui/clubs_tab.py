"""
Clubs tab widget
"""
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QTableWidget, QTableWidgetItem,
    QHeaderView, QAbstractItemView, QPushButton, QMessageBox
)
from PyQt6.QtCore import Qt
from models.db import Database

class ClubsTab(QWidget):
    def __init__(self, db: Database):
        super().__init__()
        self.db = db
        self.init_ui()
    
    def init_ui(self):
        """Initialize the widget"""
        layout = QVBoxLayout(self)
        
        # Buttons
        button_layout = QHBoxLayout()
        
        btn_new = QPushButton('➕ New Club')
        btn_new.clicked.connect(self.create_club)
        button_layout.addWidget(btn_new)
        
        btn_edit = QPushButton('✏️ Edit')
        btn_edit.clicked.connect(self.edit_club)
        button_layout.addWidget(btn_edit)
        
        btn_delete = QPushButton('🗑️ Delete')
        btn_delete.clicked.connect(self.delete_club)
        button_layout.addWidget(btn_delete)
        
        btn_refresh = QPushButton('🔄 Refresh')
        btn_refresh.clicked.connect(self.load_clubs)
        button_layout.addWidget(btn_refresh)
        
        button_layout.addStretch()
        layout.addLayout(button_layout)
        
        # Create table
        self.table = QTableWidget()
        self.table.setColumnCount(6)
        self.table.setHorizontalHeaderLabels([
            'ID', 'Name', 'City', 'Mobile', 'Website', 'Synced'
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
        header.setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(4, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(5, QHeaderView.ResizeMode.ResizeToContents)
        
        layout.addWidget(self.table)
    
    def load_clubs(self):
        """Load clubs from database"""
        clubs = self.db.get_all_clubs()
        
        self.table.setRowCount(len(clubs))
        
        for row, club in enumerate(clubs):
            self.table.setItem(row, 0, QTableWidgetItem(str(club.get('id', ''))))
            self.table.setItem(row, 1, QTableWidgetItem(club.get('name', '')))
            self.table.setItem(row, 2, QTableWidgetItem(club.get('city_name', '')))
            self.table.setItem(row, 3, QTableWidgetItem(club.get('mobile_number', '')))
            self.table.setItem(row, 4, QTableWidgetItem(club.get('website', '')))
            
            synced = '✓' if club.get('last_synced_at') else '✗'
            self.table.setItem(row, 5, QTableWidgetItem(synced))
    
    def get_selected_club_id(self):
        """Get the ID of the currently selected club"""
        selected = self.table.selectedItems()
        if not selected:
            return None
        
        row = selected[0].row()
        id_item = self.table.item(row, 0)
        return int(id_item.text()) if id_item else None
    
    def create_club(self):
        """Open dialog to create new club"""
        from ui.club_detail_dialog import ClubDetailDialog
        dialog = ClubDetailDialog(self.db, parent=self)
        if dialog.exec():
            self.load_clubs()
    
    def edit_club(self):
        """Open dialog to edit selected club"""
        club_id = self.get_selected_club_id()
        if not club_id:
            QMessageBox.warning(self, 'No Selection', 'Please select a club to edit')
            return
        
        from ui.club_detail_dialog import ClubDetailDialog
        dialog = ClubDetailDialog(self.db, club_id, parent=self)
        if dialog.exec():
            self.load_clubs()
    
    def delete_club(self):
        """Delete selected club"""
        club_id = self.get_selected_club_id()
        if not club_id:
            QMessageBox.warning(self, 'No Selection', 'Please select a club to delete')
            return
        
        clubs = self.db.get_all_clubs()
        club = next((c for c in clubs if c['id'] == club_id), None)
        if not club:
            return
        
        reply = QMessageBox.question(
            self, 'Confirm Delete',
            f'Are you sure you want to delete club "{club.get("name")}"?',
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            try:
                self.db.delete_club(club_id)
                QMessageBox.information(self, 'Success', 'Club deleted successfully')
                self.load_clubs()
            except Exception as e:
                QMessageBox.critical(self, 'Error', f'Failed to delete club: {str(e)}')
