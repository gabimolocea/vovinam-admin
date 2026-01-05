"""
Matches tab widget
"""
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QTableWidget, QTableWidgetItem,
    QHeaderView, QAbstractItemView, QPushButton, QLabel, QComboBox, QMessageBox
)
from PyQt6.QtCore import Qt
from models.db import Database

class MatchesTab(QWidget):
    def __init__(self, db: Database):
        super().__init__()
        self.db = db
        self.all_matches = []
        self.init_ui()
    
    def init_ui(self):
        """Initialize the widget"""
        layout = QVBoxLayout(self)
        
        # Filters
        filter_layout = QHBoxLayout()
        
        filter_layout.addWidget(QLabel('Competition:'))
        self.competition_filter = QComboBox()
        self.competition_filter.addItem('All Competitions', None)
        self.competition_filter.currentIndexChanged.connect(self.apply_filters)
        filter_layout.addWidget(self.competition_filter)
        
        filter_layout.addWidget(QLabel('Category:'))
        self.category_filter = QComboBox()
        self.category_filter.addItem('All Categories', None)
        self.category_filter.currentIndexChanged.connect(self.apply_filters)
        filter_layout.addWidget(self.category_filter)
        
        btn_clear = QPushButton('Clear Filters')
        btn_clear.clicked.connect(self.clear_filters)
        filter_layout.addWidget(btn_clear)
        
        filter_layout.addStretch()
        layout.addLayout(filter_layout)
        
        # Buttons
        button_layout = QHBoxLayout()
        
        btn_view = QPushButton('👁 View Details')
        btn_view.clicked.connect(self.view_match)
        button_layout.addWidget(btn_view)
        

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
        
        # Enable double-click
        self.table.doubleClicked.connect(self.view_match)
        
        layout.addWidget(self.table)
    
    def load_matches(self):
        """Load matches from database"""
        self.all_matches = self.db.get_all_matches()
        
        # Populate filter dropdowns
        self.populate_filters()
        
        # Apply current filters
        self.apply_filters()
    
    def populate_filters(self):
        """Populate competition and category filter dropdowns"""
        # Get unique competitions (from categories)
        categories = self.db.get_all_categories()
        competitions = {}
        
        for cat in categories:
            # Try both field names (event_id/competition_id and event_name/competition_title)
            comp_id = cat.get('event_id') or cat.get('competition_id')
            comp_name = cat.get('event_name') or cat.get('competition_title')
            if comp_name and comp_id:
                competitions[comp_id] = comp_name
        
        # Populate competition filter
        current_comp = self.competition_filter.currentData()
        self.competition_filter.clear()
        self.competition_filter.addItem('All Competitions', None)
        for comp_id, comp_name in sorted(competitions.items(), key=lambda x: x[1]):
            self.competition_filter.addItem(comp_name, comp_id)
        
        # Restore selection
        if current_comp:
            idx = self.competition_filter.findData(current_comp)
            if idx >= 0:
                self.competition_filter.setCurrentIndex(idx)
        
        # Get unique categories from matches
        category_names = set()
        for match in self.all_matches:
            cat_name = match.get('category_name')
            if cat_name:
                category_names.add(cat_name)
        
        # Populate category filter
        current_cat = self.category_filter.currentText()
        self.category_filter.clear()
        self.category_filter.addItem('All Categories', None)
        for cat_name in sorted(category_names):
            self.category_filter.addItem(cat_name, cat_name)
        
        # Restore selection
        if current_cat and current_cat != 'All Categories':
            idx = self.category_filter.findText(current_cat)
            if idx >= 0:
                self.category_filter.setCurrentIndex(idx)
    
    def apply_filters(self):
        """Apply selected filters to matches"""
        filtered_matches = self.all_matches
        
        # Filter by competition (via category)
        selected_competition = self.competition_filter.currentData()
        if selected_competition:
            categories = self.db.get_all_categories()
            comp_categories = {cat['id'] for cat in categories 
                             if (cat.get('event_id') or cat.get('competition_id')) == selected_competition}
            filtered_matches = [m for m in filtered_matches if m.get('category_id') in comp_categories]
        
        # Filter by category
        selected_category = self.category_filter.currentData()
        if selected_category:
            filtered_matches = [m for m in filtered_matches if m.get('category_name') == selected_category]
        
        # Display filtered matches
        self.display_matches(filtered_matches)
    
    def display_matches(self, matches):
        """Display matches in table"""
        self.table.setRowCount(len(matches))
    def display_matches(self, matches):
        """Display matches in table"""
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
    
    def clear_filters(self):
        """Clear all filters"""
        self.competition_filter.setCurrentIndex(0)
        self.category_filter.setCurrentIndex(0)
    
    def get_selected_match_id(self):
        """Get the ID of the currently selected match"""
        selected = self.table.selectedItems()
        if not selected:
            return None
        
        row = selected[0].row()
        id_item = self.table.item(row, 0)
        return int(id_item.text()) if id_item else None
    
    def view_match(self):
        """Open dialog to view selected match details"""
        match_id = self.get_selected_match_id()
        if not match_id:
            QMessageBox.warning(self, 'No Selection', 'Please select a match to view')
            return
        
        from ui.match_detail_dialog import MatchDetailDialog
        dialog = MatchDetailDialog(self.db, match_id, parent=self)
        dialog.exec()

