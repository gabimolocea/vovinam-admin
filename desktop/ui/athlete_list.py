"""
Athlete list table widget
"""
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QTableWidget, QTableWidgetItem,
    QHeaderView, QAbstractItemView, QPushButton, QMessageBox, 
    QLineEdit, QComboBox, QLabel
)
from PyQt6.QtCore import Qt
from models.db import Database

class AthleteListWidget(QWidget):
    def __init__(self, db: Database):
        super().__init__()
        self.db = db
        self.current_filters = {
            'search': '',
            'club': '',
            'city': '',
            'grade': ''
        }
        self.init_ui()
    
    def init_ui(self):
        """Initialize the widget"""
        layout = QVBoxLayout(self)
        
        # Buttons
        button_layout = QHBoxLayout()
        
        btn_new = QPushButton('➕ New Athlete')
        btn_new.clicked.connect(self.create_athlete)
        button_layout.addWidget(btn_new)
        
        button_layout.addStretch()
        layout.addLayout(button_layout)
        
        # Search and filters
        filter_layout = QHBoxLayout()
        
        # Search box
        filter_layout.addWidget(QLabel('🔍 Search:'))
        self.search_box = QLineEdit()
        self.search_box.setPlaceholderText('Search by name...')
        self.search_box.textChanged.connect(self.apply_filters)
        self.search_box.setMinimumWidth(200)
        filter_layout.addWidget(self.search_box)
        
        filter_layout.addSpacing(20)
        
        # Club filter
        filter_layout.addWidget(QLabel('Club:'))
        self.club_filter = QComboBox()
        self.club_filter.currentTextChanged.connect(self.apply_filters)
        self.club_filter.setMinimumWidth(150)
        filter_layout.addWidget(self.club_filter)
        
        # City filter
        filter_layout.addWidget(QLabel('City:'))
        self.city_filter = QComboBox()
        self.city_filter.currentTextChanged.connect(self.apply_filters)
        self.city_filter.setMinimumWidth(120)
        filter_layout.addWidget(self.city_filter)
        
        # Grade filter
        filter_layout.addWidget(QLabel('Grade:'))
        self.grade_filter = QComboBox()
        self.grade_filter.currentTextChanged.connect(self.apply_filters)
        self.grade_filter.setMinimumWidth(120)
        filter_layout.addWidget(self.grade_filter)
        
        # Clear filters button
        btn_clear = QPushButton('✖ Clear Filters')
        btn_clear.clicked.connect(self.clear_filters)
        filter_layout.addWidget(btn_clear)
        
        filter_layout.addStretch()
        layout.addLayout(filter_layout)
        
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
        
        # Enable double-click to open details
        self.table.doubleClicked.connect(self.view_athlete)
        
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
    
    def load_filter_options(self):
        """Load filter dropdown options"""
        conn = self.db.connect()
        cursor = conn.cursor()
        
        # Load clubs
        cursor.execute("SELECT DISTINCT club_name FROM athletes WHERE club_name IS NOT NULL AND club_name != '' ORDER BY club_name")
        clubs = ['All'] + [row[0] for row in cursor.fetchall()]
        self.club_filter.clear()
        self.club_filter.addItems(clubs)
        
        # Load cities
        cursor.execute("SELECT DISTINCT team_place FROM athletes WHERE team_place IS NOT NULL AND team_place != '' ORDER BY team_place")
        cities = ['All'] + [row[0] for row in cursor.fetchall()]
        self.city_filter.clear()
        self.city_filter.addItems(cities)
        
        # Load grades
        cursor.execute("SELECT DISTINCT current_grade_name FROM athletes WHERE current_grade_name IS NOT NULL AND current_grade_name != '' ORDER BY current_grade_name")
        grades = ['All'] + [row[0] for row in cursor.fetchall()]
        self.grade_filter.clear()
        self.grade_filter.addItems(grades)
    
    def apply_filters(self):
        """Apply search and filters to athlete list"""
        self.current_filters['search'] = self.search_box.text().strip().lower()
        self.current_filters['club'] = self.club_filter.currentText() if self.club_filter.currentText() != 'All' else ''
        self.current_filters['city'] = self.city_filter.currentText() if self.city_filter.currentText() != 'All' else ''
        self.current_filters['grade'] = self.grade_filter.currentText() if self.grade_filter.currentText() != 'All' else ''
        
        self.load_athletes()
    
    def clear_filters(self):
        """Clear all filters"""
        self.search_box.clear()
        self.club_filter.setCurrentIndex(0)
        self.city_filter.setCurrentIndex(0)
        self.grade_filter.setCurrentIndex(0)
    
    def load_athletes(self):
        """Load athletes from database with filters"""
        # Load filter options first time
        if self.club_filter.count() == 0:
            self.load_filter_options()
        
        # Build query with filters
        query = "SELECT * FROM athletes WHERE 1=1"
        params = []
        
        # Search filter (name)
        if self.current_filters['search']:
            query += " AND (LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ?)"
            search_term = f"%{self.current_filters['search']}%"
            params.extend([search_term, search_term])
        
        # Club filter
        if self.current_filters['club']:
            query += " AND club_name = ?"
            params.append(self.current_filters['club'])
        
        # City filter
        if self.current_filters['city']:
            query += " AND team_place = ?"
            params.append(self.current_filters['city'])
        
        # Grade filter
        if self.current_filters['grade']:
            query += " AND current_grade_name = ?"
            params.append(self.current_filters['grade'])
        
        query += " ORDER BY last_name, first_name"
        
        conn = self.db.connect()
        cursor = conn.cursor()
        cursor.execute(query, params)
        athletes = [dict(row) for row in cursor.fetchall()]
        
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
    
    def view_athlete(self):
        """Open dialog to view/edit selected athlete"""
        athlete_id = self.get_selected_athlete_id()
        if not athlete_id:
            return
        
        from ui.athlete_detail_dialog import AthleteDetailDialog
        dialog = AthleteDetailDialog(self.db, athlete_id, parent=self)
        if dialog.exec():
            self.load_athletes()
