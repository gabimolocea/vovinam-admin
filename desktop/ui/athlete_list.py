"""
Athlete list table widget
"""
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QTableWidget, QTableWidgetItem,
    QHeaderView, QAbstractItemView, QPushButton, QHBoxLayout, QMessageBox
)
from PyQt6.QtCore import Qt
from models.db import Database

class AthleteListWidget(QWidget):
    def __init__(self, db: Database):
        super().__init__()
        self.db = db
        self.init_ui()
    
    def init_ui(self):
        """Initialize the widget"""
        layout = QVBoxLayout(self)
        
        # Buttons
        button_layout = QHBoxLayout()
        
        btn_new = QPushButton('➕ New Athlete')
        btn_new.clicked.connect(self.create_athlete)
        button_layout.addWidget(btn_new)
        
        btn_edit = QPushButton('✏️ Edit')
        btn_edit.clicked.connect(self.edit_athlete)
        button_layout.addWidget(btn_edit)
        
        btn_delete = QPushButton('🗑️ Delete')
        btn_delete.clicked.connect(self.delete_athlete)
        button_layout.addWidget(btn_delete)
        
        btn_view = QPushButton('👁️ View Details')
        btn_view.clicked.connect(self.view_athlete)
        button_layout.addWidget(btn_view)
        
        button_layout.addStretch()
        layout.addLayout(button_layout)
        
        # Create table
        self.table = QTableWidget()
        self.table.setColumnCount(8)
        self.table.setHorizontalHeaderLabels([
            'ID', 'First Name', 'Last Name', 'Club', 'City', 
            'Status', 'Synced', 'Updated'
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
        header.setSectionResizeMode(3, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(4, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(5, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(6, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(7, QHeaderView.ResizeMode.ResizeToContents)
        
        layout.addWidget(self.table)
    
    def load_athletes(self):
        """Load athletes from database"""
        athletes = self.db.get_all_athletes()
        
        self.table.setRowCount(len(athletes))
        
        for row, athlete in enumerate(athletes):
            self.table.setItem(row, 0, QTableWidgetItem(str(athlete.get('id', ''))))
            self.table.setItem(row, 1, QTableWidgetItem(athlete.get('first_name', '')))
            self.table.setItem(row, 2, QTableWidgetItem(athlete.get('last_name', '')))
            self.table.setItem(row, 3, QTableWidgetItem(athlete.get('club_name', '')))
            self.table.setItem(row, 4, QTableWidgetItem(athlete.get('city_name', '')))
            self.table.setItem(row, 5, QTableWidgetItem(athlete.get('status', '')))
            
            synced_text = '✓' if athlete.get('is_synced') else '✗'
            self.table.setItem(row, 6, QTableWidgetItem(synced_text))
            
            updated = athlete.get('updated_at', '')[:10] if athlete.get('updated_at') else ''
            self.table.setItem(row, 7, QTableWidgetItem(updated))
    
    def get_selected_athlete_id(self):
        """Get the ID of the currently selected athlete"""
        selected = self.table.selectedItems()
        if not selected:
            return None
        
        row = selected[0].row()
        id_item = self.table.item(row, 0)
        return int(id_item.text()) if id_item else None
    
    def create_athlete(self):
        """Open dialog to create new athlete"""
        from ui.athlete_detail_dialog import AthleteDetailDialog
        dialog = AthleteDetailDialog(self.db, parent=self)
        if dialog.exec():
            self.load_athletes()
    
    def edit_athlete(self):
        """Open dialog to edit selected athlete"""
        athlete_id = self.get_selected_athlete_id()
        if not athlete_id:
            QMessageBox.warning(self, 'No Selection', 'Please select an athlete to edit')
            return
        
        from ui.athlete_detail_dialog import AthleteDetailDialog
        dialog = AthleteDetailDialog(self.db, athlete_id, parent=self)
        if dialog.exec():
            self.load_athletes()
    
    def view_athlete(self):
        """View athlete details (same as edit for now)"""
        self.edit_athlete()
    
    def delete_athlete(self):
        """Delete selected athlete"""
        athlete_id = self.get_selected_athlete_id()
        if not athlete_id:
            QMessageBox.warning(self, 'No Selection', 'Please select an athlete to delete')
            return
        
        # Get athlete name for confirmation
        athletes = self.db.get_all_athletes()
        athlete = next((a for a in athletes if a['id'] == athlete_id), None)
        if not athlete:
            return
        
        name = f"{athlete.get('first_name', '')} {athlete.get('last_name', '')}"
        
        reply = QMessageBox.question(
            self, 'Confirm Delete',
            f'Are you sure you want to delete {name}?',
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            try:
                self.db.delete_athlete(athlete_id)
                QMessageBox.information(self, 'Success', 'Athlete deleted successfully')
                self.load_athletes()
            except Exception as e:
                QMessageBox.critical(self, 'Error', f'Failed to delete athlete: {str(e)}')
