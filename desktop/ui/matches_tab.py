"""
Matches tab widget
"""
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QTableWidget, QTableWidgetItem,
    QHeaderView, QAbstractItemView, QPushButton
)
from PyQt6.QtCore import Qt
from models.db import Database

class MatchesTab(QWidget):
    def __init__(self, db: Database):
        super().__init__()
        self.db = db
        self.init_ui()
    
    def init_ui(self):
        """Initialize the widget"""
        layout = QVBoxLayout(self)
        
        # Buttons
        button_layout = QHBoxLayout()
        
        btn_refresh = QPushButton('🔄 Refresh')
        btn_refresh.clicked.connect(self.load_matches)
        button_layout.addWidget(btn_refresh)
        
        button_layout.addStretch()
        layout.addLayout(button_layout)
        
        # Create table
        self.table = QTableWidget()
        self.table.setColumnCount(8)
        self.table.setHorizontalHeaderLabels([
            'ID', 'Category', 'Match #', 'Round', 'Athlete 1', 'Athlete 2', 'Winner', 'Status'
        ])
        
        # Table settings
        self.table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.table.setAlternatingRowColors(True)
        
        # Column widths
        header = self.table.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(4, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(5, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(6, QHeaderView.ResizeMode.Stretch)
        
        layout.addWidget(self.table)
    
    def load_matches(self):
        """Load matches from database"""
        matches = self.db.get_all_matches()
        
        self.table.setRowCount(len(matches))
        
        for row, match in enumerate(matches):
            self.table.setItem(row, 0, QTableWidgetItem(str(match.get('id', ''))))
            self.table.setItem(row, 1, QTableWidgetItem(match.get('category_name', '')))
            self.table.setItem(row, 2, QTableWidgetItem(str(match.get('match_number', ''))))
            self.table.setItem(row, 3, QTableWidgetItem(match.get('round', '')))
            self.table.setItem(row, 4, QTableWidgetItem(match.get('athlete1_name', '')))
            self.table.setItem(row, 5, QTableWidgetItem(match.get('athlete2_name', '')))
            self.table.setItem(row, 6, QTableWidgetItem(match.get('winner_name', '')))
            self.table.setItem(row, 7, QTableWidgetItem(match.get('status', '')))
