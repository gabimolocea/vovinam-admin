"""
Brackets tab for tournament bracket management
"""
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QTableWidget, QTableWidgetItem,
    QHeaderView, QAbstractItemView, QPushButton, QMessageBox, QComboBox,
    QLabel, QDialog, QLineEdit, QSpinBox, QListWidget, QListWidgetItem,
    QCheckBox, QDoubleSpinBox, QTabWidget, QFormLayout, QFrame, QScrollArea
)
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QColor, QFont
from models.db import Database
from ui.bracket_visualizer import AdvancedBracketCanvas


class BracketsTab(QWidget):
    def __init__(self, db: Database):
        super().__init__()
        self.db = db
        self.selected_bracket = None
        self.selected_bracket_id = None  # Initialize this
        self.init_ui()
    
    def init_ui(self):
        """Initialize the widget"""
        layout = QVBoxLayout(self)
        
        # Top controls
        control_layout = QHBoxLayout()
        
        # Refresh button
        btn_refresh = QPushButton('🔄 Refresh')
        btn_refresh.clicked.connect(self.load_categories)
        control_layout.addWidget(btn_refresh)
        
        # Category selector
        control_layout.addWidget(QLabel("Category:"))
        self.category_combo = QComboBox()
        self.category_combo.currentIndexChanged.connect(self.on_category_changed)
        control_layout.addWidget(self.category_combo)
        
        control_layout.addStretch()
        
        # Buttons
        btn_new = QPushButton('➕ New Bracket')
        btn_new.clicked.connect(self.create_bracket)
        control_layout.addWidget(btn_new)
        
        btn_delete = QPushButton('🗑️ Delete')
        btn_delete.clicked.connect(self.delete_bracket)
        control_layout.addWidget(btn_delete)
        
        layout.addLayout(control_layout)
        
        # Brackets table
        self.table = QTableWidget()
        self.table.setColumnCount(6)
        self.table.setHorizontalHeaderLabels([
            'ID', 'Name', 'Type', 'Participants', 'Status', 'Created'
        ])
        
        self.table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.table.setAlternatingRowColors(True)
        self.table.itemSelectionChanged.connect(self.on_bracket_selected)
        
        header = self.table.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(4, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(5, QHeaderView.ResizeMode.ResizeToContents)
        
        layout.addWidget(self.table)
        
        # Bracket preview section
        preview_label = QLabel("Bracket Structure:")
        layout.addWidget(preview_label)
        
        self.preview_table = QTableWidget()
        self.preview_table.setColumnCount(5)
        self.preview_table.setHorizontalHeaderLabels([
            'Position', 'Round', 'Athlete 1', 'Athlete 2', 'Status'
        ])
        self.preview_table.setMaximumHeight(250)
        
        preview_header = self.preview_table.horizontalHeader()
        preview_header.setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        preview_header.setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        preview_header.setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        preview_header.setSectionResizeMode(3, QHeaderView.ResizeMode.Stretch)
        preview_header.setSectionResizeMode(4, QHeaderView.ResizeMode.ResizeToContents)
        
        layout.addWidget(self.preview_table)
        
        # Create tab widget for matches and standings
        self.tabs = QTabWidget()
        
        # Bracket Visualization tab
        bracket_layout = QVBoxLayout()
        bracket_btn_layout = QHBoxLayout()
        
        btn_edit_match = QPushButton("✏️ Edit Match")
        btn_edit_match.clicked.connect(self.edit_match)
        bracket_btn_layout.addWidget(btn_edit_match)
        
        btn_set_winner = QPushButton("👑 Set Winner")
        btn_set_winner.clicked.connect(self.set_match_winner)
        bracket_btn_layout.addWidget(btn_set_winner)
        
        btn_refresh_bracket = QPushButton("🔄 Refresh")
        btn_refresh_bracket.clicked.connect(self.load_bracket_visualization)
        bracket_btn_layout.addWidget(btn_refresh_bracket)
        
        bracket_btn_layout.addStretch()
        bracket_layout.addLayout(bracket_btn_layout)
        
        # Create bracket visualizer
        self.bracket_canvas = AdvancedBracketCanvas(self.db)
        bracket_layout.addWidget(self.bracket_canvas)
        
        bracket_widget = QWidget()
        bracket_widget.setLayout(bracket_layout)
        self.tabs.addTab(bracket_widget, '🥊 Bracket Visualization')
        
        # Matches details tab (for detailed editing)
        matches_layout = QVBoxLayout()
        matches_btn_layout = QHBoxLayout()
        
        btn_view_match = QPushButton("👀 View Selected")
        btn_view_match.clicked.connect(self.edit_match)
        matches_btn_layout.addWidget(btn_view_match)
        
        matches_btn_layout.addStretch()
        matches_layout.addLayout(matches_btn_layout)
        
        self.matches_table = QTableWidget()
        self.matches_table.setColumnCount(7)
        self.matches_table.setHorizontalHeaderLabels([
            'Position', 'Round', 'Athlete 1', 'Athlete 2', 'Winner', 'Status', 'Match ID'
        ])
        
        header = self.matches_table.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(3, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(4, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(5, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(6, QHeaderView.ResizeMode.ResizeToContents)
        
        matches_layout.addWidget(self.matches_table)
        matches_widget = QWidget()
        matches_widget.setLayout(matches_layout)
        self.tabs.addTab(matches_widget, '📋 Matches Details')
        
        # Standings tab
        standings_layout = QVBoxLayout()
        standings_btn_layout = QHBoxLayout()
        
        btn_refresh_standings = QPushButton("🔄 Refresh Standings")
        btn_refresh_standings.clicked.connect(self.load_standings)
        standings_btn_layout.addWidget(btn_refresh_standings)
        
        standings_btn_layout.addStretch()
        standings_layout.addLayout(standings_btn_layout)
        
        self.standings_table = QTableWidget()
        self.standings_table.setColumnCount(4)
        self.standings_table.setHorizontalHeaderLabels([
            'Place', 'Athlete', 'Wins', 'Status'
        ])
        
        header = self.standings_table.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        
        standings_layout.addWidget(self.standings_table)
        standings_widget = QWidget()
        standings_widget.setLayout(standings_layout)
        self.tabs.addTab(standings_widget, '🏆 Standings')
        
        layout.addWidget(self.tabs)
        
        self.load_categories()
    
    def showEvent(self, event):
        """Refresh data when tab becomes visible"""
        super().showEvent(event)
        self.load_categories()
    
    def load_categories(self):
        """Load categories from database"""
        categories = self.db.get_all_categories()
        self.category_combo.blockSignals(True)
        self.category_combo.clear()
        
        if not categories:
            self.category_combo.addItem("⚠️ No categories available - Create one in Categories tab", None)
            self.category_combo.setEnabled(False)
            self.table.setRowCount(0)
            self.preview_table.setRowCount(0)
        else:
            for cat in categories:
                cat_name = cat.get('name', '')
                cat_type = cat.get('category_type', 'unknown')
                cat_id = cat.get('id')
                
                self.category_combo.addItem(
                    f"{cat_name} ({cat_type})",
                    cat_id
                )
            self.category_combo.setEnabled(True)
            if self.category_combo.count() > 0:
                self.load_brackets()
        
        self.category_combo.blockSignals(False)
    
    def on_category_changed(self):
        """Handle category selection change"""
        category_id = self.category_combo.currentData()
        if category_id:
            self.load_brackets()
    
    def load_brackets(self):
        """Load brackets for selected category"""
        category_id = self.category_combo.currentData()
        if not category_id:
            self.table.setRowCount(0)
            self.preview_table.setRowCount(0)
            return
        
        brackets = self.db.get_brackets_for_category(category_id)
        self.table.setRowCount(len(brackets))
        
        for row, bracket in enumerate(brackets):
            self.table.setItem(row, 0, QTableWidgetItem(str(bracket.get('id', ''))))
            self.table.setItem(row, 1, QTableWidgetItem(bracket.get('bracket_name', '')))
            self.table.setItem(row, 2, QTableWidgetItem(bracket.get('bracket_type', '')))
            self.table.setItem(row, 3, QTableWidgetItem(str(bracket.get('total_participants', ''))))
            self.table.setItem(row, 4, QTableWidgetItem(bracket.get('status', '')))
            created = bracket.get('created_at', '')[:10] if bracket.get('created_at') else ''
            self.table.setItem(row, 5, QTableWidgetItem(created))
        
        self.preview_table.setRowCount(0)
    
    def on_bracket_selected(self):
        """Handle bracket selection"""
        selected = self.table.selectedItems()
        if not selected:
            self.preview_table.setRowCount(0)
            self.matches_table.setRowCount(0)
            self.standings_table.setRowCount(0)
            self.bracket_canvas.setFixedSize(0, 0)
            return
        
        row = selected[0].row()
        bracket_id = int(self.table.item(row, 0).text())
        self.selected_bracket_id = bracket_id
        
        # Load bracket positions
        positions = self.db.get_bracket_positions(bracket_id)
        self.preview_table.setRowCount(len(positions))
        
        for row, pos in enumerate(positions):
            self.preview_table.setItem(row, 0, QTableWidgetItem(str(pos.get('position_number', ''))))
            self.preview_table.setItem(row, 1, QTableWidgetItem(str(pos.get('round', ''))))
            self.preview_table.setItem(row, 2, QTableWidgetItem(pos.get('athlete1_name', '')))
            self.preview_table.setItem(row, 3, QTableWidgetItem(pos.get('athlete2_name', '')))
            self.preview_table.setItem(row, 4, QTableWidgetItem(pos.get('status', '')))
        
        # Load matches table
        self.load_matches(bracket_id)
        
        # Load visualization
        self.load_bracket_visualization(bracket_id)
        
        # Load standings
        self.load_standings()
    
    def load_bracket_visualization(self, bracket_id: int):
        """Load and display bracket visualization"""
        self.bracket_canvas.load_bracket(bracket_id)
    
    def load_matches(self, bracket_id: int):
        """Load matches for selected bracket"""
        positions = self.db.get_bracket_positions(bracket_id)
        self.matches_table.setRowCount(len(positions))
        
        for row, pos in enumerate(positions):
            self.matches_table.setItem(row, 0, QTableWidgetItem(str(pos.get('position_number', ''))))
            self.matches_table.setItem(row, 1, QTableWidgetItem(str(pos.get('round', ''))))
            self.matches_table.setItem(row, 2, QTableWidgetItem(pos.get('athlete1_name', '')))
            self.matches_table.setItem(row, 3, QTableWidgetItem(pos.get('athlete2_name', '')))
            
            winner_item = QTableWidgetItem(pos.get('winner_name', '') or '-')
            if pos.get('winner_name'):
                winner_item.setBackground(QColor(255, 215, 0))  # Gold
                winner_item.setFont(self._bold_font())
            self.matches_table.setItem(row, 4, winner_item)
            
            status = pos.get('status', '')
            status_item = QTableWidgetItem(status)
            if status == 'completed':
                status_item.setBackground(QColor(144, 238, 144))  # Light green
            elif status == 'in_progress':
                status_item.setBackground(QColor(255, 255, 153))  # Light yellow
            self.matches_table.setItem(row, 5, status_item)
            
            self.matches_table.setItem(row, 6, QTableWidgetItem(str(pos.get('id', ''))))
    
    def load_standings(self):
        """Load tournament standings"""
        if not hasattr(self, 'selected_bracket_id') or not self.selected_bracket_id:
            self.standings_table.setRowCount(0)
            return
        
        # Get bracket info
        brackets = self.db.get_brackets_for_category(self.category_combo.currentData())
        bracket = next((b for b in brackets if b.get('id') == self.selected_bracket_id), None)
        
        if not bracket:
            return
        
        # Get all positions
        positions = self.db.get_bracket_positions(self.selected_bracket_id)
        
        # Calculate standings based on bracket type
        standings = self._calculate_standings(bracket.get('bracket_type'), positions)
        
        self.standings_table.setRowCount(len(standings))
        
        place_colors = {
            1: QColor(255, 215, 0),      # Gold
            2: QColor(192, 192, 192),    # Silver
            3: QColor(205, 127, 50)      # Bronze
        }
        
        for row, (place, athlete_name, wins) in enumerate(standings):
            # Place
            place_item = QTableWidgetItem(f"{place}{'st' if place == 1 else 'nd' if place == 2 else 'rd' if place == 3 else 'th'}")
            place_item.setFont(self._bold_font())
            if place in place_colors:
                place_item.setBackground(place_colors[place])
                place_item.setForeground(Qt.GlobalColor.white)
            self.standings_table.setItem(row, 0, place_item)
            
            # Athlete name
            athlete_item = QTableWidgetItem(athlete_name)
            if place in place_colors:
                athlete_item.setBackground(place_colors[place])
                athlete_item.setFont(self._bold_font())
            self.standings_table.setItem(row, 1, athlete_item)
            
            # Wins
            wins_item = QTableWidgetItem(str(wins))
            if place in place_colors:
                wins_item.setBackground(place_colors[place])
            self.standings_table.setItem(row, 2, wins_item)
            
            # Status
            status_item = QTableWidgetItem('✓' if place <= 3 else '')
            self.standings_table.setItem(row, 3, status_item)
    
    def _calculate_standings(self, bracket_type: str, positions: list) -> list:
        """Calculate standings from bracket positions"""
        # Create athlete tracking dictionary
        athletes = {}
        
        for pos in positions:
            if pos.get('athlete1_name') and pos.get('athlete1_name') not in athletes:
                athletes[pos.get('athlete1_name')] = {'wins': 0, 'losses': 0, 'position': pos.get('position_number')}
            if pos.get('athlete2_name') and pos.get('athlete2_name') not in athletes:
                athletes[pos.get('athlete2_name')] = {'wins': 0, 'losses': 0, 'position': pos.get('position_number')}
            
            # Track wins for winners
            if pos.get('winner_name'):
                if pos.get('winner_name') in athletes:
                    athletes[pos.get('winner_name')]['wins'] += 1
            
            # Track losses for losers in single elimination
            if bracket_type == 'single_elimination' and pos.get('status') == 'completed':
                if pos.get('winner_name') == pos.get('athlete1_name') and pos.get('athlete2_name'):
                    if pos.get('athlete2_name') in athletes:
                        athletes[pos.get('athlete2_name')]['losses'] += 1
                elif pos.get('winner_name') == pos.get('athlete2_name') and pos.get('athlete1_name'):
                    if pos.get('athlete1_name') in athletes:
                        athletes[pos.get('athlete1_name')]['losses'] += 1
        
        # Sort by wins (descending)
        sorted_athletes = sorted(
            athletes.items(),
            key=lambda x: (-x[1]['wins'], x[1]['position'])
        )
        
        # Create standings list with place
        standings = []
        for place, (name, data) in enumerate(sorted_athletes, 1):
            standings.append((place, name, data['wins']))
        
        return standings
    
    def _bold_font(self) -> QFont:
        """Get a bold font"""
        font = QFont()
        font.setBold(True)
        return font
    
    def edit_match(self):
        """Edit selected match"""
        selected = self.matches_table.selectedItems()
        if not selected:
            QMessageBox.warning(self, 'No Selection', 'Please select a match to edit')
            return
        
        row = selected[0].row()
        position_id = int(self.matches_table.item(row, 6).text())
        
        # Get position data
        positions = self.db.get_bracket_positions(self.selected_bracket_id)
        position = next((p for p in positions if p.get('id') == position_id), None)
        
        if not position:
            QMessageBox.warning(self, 'Error', 'Could not load match data')
            return
        
        dialog = MatchScoringDialog(self.db, position, parent=self)
        if dialog.exec():
            # Refresh display
            self.load_matches(self.selected_bracket_id)
            self.load_standings()
    
    def set_match_winner(self):
        """Set the winner of a match"""
        selected = self.matches_table.selectedItems()
        if not selected:
            QMessageBox.warning(self, 'No Selection', 'Please select a match')
            return
        
        row = selected[0].row()
        athlete1 = self.matches_table.item(row, 2).text()
        athlete2 = self.matches_table.item(row, 3).text()
        position_id = int(self.matches_table.item(row, 6).text())
        
        # Create winner selection dialog
        dialog = QDialog(self)
        dialog.setWindowTitle("Select Winner")
        dialog.resize(300, 150)
        
        layout = QVBoxLayout(dialog)
        layout.addWidget(QLabel("Select the winner:"))
        
        btn_layout = QHBoxLayout()
        
        def set_winner_1():
            self._record_winner(position_id, athlete1)
            dialog.accept()
        
        def set_winner_2():
            self._record_winner(position_id, athlete2)
            dialog.accept()
        
        btn1 = QPushButton(f"🥊 {athlete1}")
        btn1.clicked.connect(set_winner_1)
        btn_layout.addWidget(btn1)
        
        btn2 = QPushButton(f"🥊 {athlete2}")
        btn2.clicked.connect(set_winner_2)
        btn_layout.addWidget(btn2)
        
        layout.addLayout(btn_layout)
        
        btn_cancel = QPushButton("Cancel")
        btn_cancel.clicked.connect(dialog.reject)
        layout.addWidget(btn_cancel)
        
        dialog.exec()
    
    def _record_winner(self, position_id: int, winner_name: str):
        """Record winner for a position"""
        try:
            conn = self.db.connect()
            cursor = conn.cursor()
            cursor.execute(
                """UPDATE bracket_positions
                   SET winner_id = 
                       (SELECT id FROM athletes WHERE first_name || ' ' || last_name = ?),
                   winner_name = ?,
                   status = 'completed'
                   WHERE id = ?""",
                (winner_name, winner_name, position_id)
            )
            conn.commit()
            
            QMessageBox.information(self, 'Success', f'{winner_name} set as winner!')
            
            # Refresh
            if hasattr(self, 'selected_bracket_id'):
                self.load_matches(self.selected_bracket_id)
                self.load_standings()
        except Exception as e:
            QMessageBox.critical(self, 'Error', f'Failed to record winner: {str(e)}')
    
    def create_bracket(self):
        """Open dialog to create new bracket"""
        category_id = self.category_combo.currentData()
        if not category_id:
            QMessageBox.warning(self, 'No Category', 'Please select a category first')
            return
        
        dialog = BracketCreationDialog(self.db, category_id, parent=self)
        if dialog.exec():
            self.load_brackets()
    
    def delete_bracket(self):
        """Delete selected bracket"""
        selected = self.table.selectedItems()
        if not selected:
            QMessageBox.warning(self, 'No Selection', 'Please select a bracket to delete')
            return
        
        reply = QMessageBox.question(
            self, 'Confirm Delete',
            'Are you sure you want to delete this bracket?',
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            row = selected[0].row()
            bracket_id = int(self.table.item(row, 0).text())
            
            conn = self.db.connect()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM brackets WHERE id = ?", (bracket_id,))
            conn.commit()
            
            self.load_brackets()
            QMessageBox.information(self, 'Success', 'Bracket deleted successfully')


class BracketCreationDialog(QDialog):
    """Dialog for creating a new bracket"""
    
    def __init__(self, db: Database, category_id: int, parent=None):
        super().__init__(parent)
        self.db = db
        self.category_id = category_id
        self.selected_athletes = []
        
        # Get category info
        try:
            conn = db.connect()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM categories WHERE id = ?", (category_id,))
            row = cursor.fetchone()
            self.category = dict(row) if row else {'name': 'Unknown', 'category_type': 'match'}
        except Exception as e:
            print(f"Error loading category: {e}")
            self.category = {'name': 'Unknown', 'category_type': 'match'}
        
        self.setWindowTitle("Create Bracket")
        self.resize(600, 700)
        self.init_ui()
    
    def init_ui(self):
        """Initialize the dialog UI"""
        layout = QVBoxLayout(self)
        
        # Bracket info
        info_layout = QHBoxLayout()
        info_layout.addWidget(QLabel("Bracket Name:"))
        self.name_input = QLineEdit()
        self.name_input.setPlaceholderText(f"{self.category.get('name', '')} Bracket")
        info_layout.addWidget(self.name_input)
        layout.addLayout(info_layout)
        
        # Bracket type
        type_layout = QHBoxLayout()
        type_layout.addWidget(QLabel("Bracket Type:"))
        self.type_combo = QComboBox()
        self.type_combo.addItems(['single_elimination', 'round_robin', 'double_elimination'])
        type_layout.addWidget(self.type_combo)
        layout.addLayout(type_layout)
        
        # Athletes selection
        layout.addWidget(QLabel("Select Athletes:"))
        
        # Available athletes
        available_layout = QHBoxLayout()
        
        available_label = QLabel("Available Athletes:")
        available_layout.addWidget(available_label)
        
        self.available_list = QListWidget()
        self.load_available_athletes()
        available_layout.addWidget(self.available_list)
        
        # Buttons between lists
        button_layout = QVBoxLayout()
        btn_add = QPushButton("➕ Add")
        btn_add.clicked.connect(self.add_athlete)
        button_layout.addWidget(btn_add)
        
        btn_remove = QPushButton("➖ Remove")
        btn_remove.clicked.connect(self.remove_athlete)
        button_layout.addWidget(btn_remove)
        
        button_layout.addStretch()
        available_layout.addLayout(button_layout)
        
        # Selected athletes
        selected_label = QLabel("Selected Athletes:")
        available_layout.addWidget(selected_label)
        
        self.selected_list = QListWidget()
        available_layout.addWidget(self.selected_list)
        
        layout.addLayout(available_layout, 1)
        
        # Dialog buttons
        dialog_buttons = QHBoxLayout()
        dialog_buttons.addStretch()
        
        btn_create = QPushButton("Create Bracket")
        btn_create.clicked.connect(self.create_bracket)
        dialog_buttons.addWidget(btn_create)
        
        btn_cancel = QPushButton("Cancel")
        btn_cancel.clicked.connect(self.reject)
        dialog_buttons.addWidget(btn_cancel)
        
        layout.addLayout(dialog_buttons)
        self.setLayout(layout)
    
    def load_available_athletes(self):
        """Load available athletes for the category"""
        # Get all athletes
        athletes = self.db.get_all_athletes()
        
        for athlete in athletes:
            item = QListWidgetItem(
                f"{athlete.get('first_name', '')} {athlete.get('last_name', '')}"
            )
            item.setData(Qt.ItemDataRole.UserRole, {
                'id': athlete.get('id'),
                'name': f"{athlete.get('first_name', '')} {athlete.get('last_name', '')}"
            })
            self.available_list.addItem(item)
    
    def add_athlete(self):
        """Add selected athlete to selected list"""
        current_item = self.available_list.currentItem()
        if not current_item:
            QMessageBox.warning(self, 'No Selection', 'Please select an athlete to add')
            return
        
        data = current_item.data(Qt.ItemDataRole.UserRole)
        
        # Check if already selected
        for i in range(self.selected_list.count()):
            item_data = self.selected_list.item(i).data(Qt.ItemDataRole.UserRole)
            if item_data['id'] == data['id']:
                QMessageBox.warning(self, 'Already Selected', 'This athlete is already in the bracket')
                return
        
        # Add to selected
        item = QListWidgetItem(data['name'])
        item.setData(Qt.ItemDataRole.UserRole, data)
        self.selected_list.addItem(item)
    
    def remove_athlete(self):
        """Remove selected athlete from selected list"""
        current_item = self.selected_list.currentItem()
        if not current_item:
            QMessageBox.warning(self, 'No Selection', 'Please select an athlete to remove')
            return
        
        row = self.selected_list.row(current_item)
        self.selected_list.takeItem(row)
    
    def create_bracket(self):
        """Create the bracket"""
        if self.selected_list.count() == 0:
            QMessageBox.warning(self, 'No Athletes', 'Please select at least 2 athletes for the bracket')
            return
        
        if self.selected_list.count() < 2:
            QMessageBox.warning(self, 'Insufficient Athletes', 'Please select at least 2 athletes for the bracket')
            return
        
        # Collect selected athletes
        participants = []
        for i in range(self.selected_list.count()):
            item = self.selected_list.item(i)
            data = item.data(Qt.ItemDataRole.UserRole)
            participants.append(data)
        
        # Create bracket
        bracket_name = self.name_input.text() or f"{self.category.get('name', '')} Bracket"
        bracket_type = self.type_combo.currentText()
        
        try:
            self.db.create_bracket(
                category_id=self.category_id,
                category_name=self.category.get('name', ''),
                category_type=self.category.get('category_type', ''),
                bracket_type=bracket_type,
                bracket_name=bracket_name,
                participants=participants
            )
            
            QMessageBox.information(self, 'Success', 'Bracket created successfully!')
            self.accept()
        except Exception as e:
            QMessageBox.critical(self, 'Error', f'Failed to create bracket: {str(e)}')


class MatchScoringDialog(QDialog):
    """Dialog for recording match scores"""
    
    def __init__(self, db: Database, position: dict, parent=None):
        super().__init__(parent)
        self.db = db
        self.position = position
        
        self.setWindowTitle("Match Scoring")
        self.resize(500, 400)
        self.init_ui()
    
    def init_ui(self):
        """Initialize the dialog UI"""
        layout = QVBoxLayout(self)
        
        # Match info
        info_label = QLabel(f"Round {self.position.get('round')} - Position {self.position.get('position_number')}")
        font = QFont()
        font.setPointSize(14)
        font.setBold(True)
        info_label.setFont(font)
        layout.addWidget(info_label)
        
        # Athletes frame
        athletes_frame = QFrame()
        athletes_frame.setFrameStyle(QFrame.Shape.Box)
        athletes_frame.setStyleSheet("""
            QFrame {
                background-color: #f5f5f5;
                border: 2px solid #ddd;
                border-radius: 8px;
                padding: 15px;
            }
        """)
        
        athletes_layout = QFormLayout()
        
        # Athlete 1
        athlete1_label = QLabel(f"🔴 {self.position.get('athlete1_name', 'N/A')}")
        self.score1_input = QDoubleSpinBox()
        self.score1_input.setDecimals(1)
        self.score1_input.setMinimum(0)
        self.score1_input.setMaximum(100)
        athletes_layout.addRow(athlete1_label, self.score1_input)
        
        # Athlete 2
        athlete2_label = QLabel(f"🔵 {self.position.get('athlete2_name', 'N/A')}")
        self.score2_input = QDoubleSpinBox()
        self.score2_input.setDecimals(1)
        self.score2_input.setMinimum(0)
        self.score2_input.setMaximum(100)
        athletes_layout.addRow(athlete2_label, self.score2_input)
        
        athletes_frame.setLayout(athletes_layout)
        layout.addWidget(athletes_frame)
        
        # Winner selection
        winner_label = QLabel("Select Winner:")
        winner_label.setFont(QFont("Arial", 12, QFont.Weight.Bold))
        layout.addWidget(winner_label)
        
        winner_layout = QHBoxLayout()
        
        self.winner_combo = QComboBox()
        self.winner_combo.addItem("-")
        self.winner_combo.addItem(self.position.get('athlete1_name', 'Athlete 1'))
        self.winner_combo.addItem(self.position.get('athlete2_name', 'Athlete 2'))
        winner_layout.addWidget(self.winner_combo)
        
        layout.addLayout(winner_layout)
        
        # Notes
        layout.addWidget(QLabel("Notes:"))
        self.notes_input = QLineEdit()
        self.notes_input.setPlaceholderText("Optional notes about the match...")
        layout.addWidget(self.notes_input)
        
        # Buttons
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        btn_save = QPushButton("💾 Save")
        btn_save.clicked.connect(self.save_match)
        button_layout.addWidget(btn_save)
        
        btn_cancel = QPushButton("Cancel")
        btn_cancel.clicked.connect(self.reject)
        button_layout.addWidget(btn_cancel)
        
        layout.addLayout(button_layout)
        
        self.setLayout(layout)
    
    def save_match(self):
        """Save match scoring"""
        winner = self.winner_combo.currentText()
        if winner == "-":
            QMessageBox.warning(self, 'No Winner', 'Please select a winner')
            return
        
        try:
            conn = self.db.connect()
            cursor = conn.cursor()
            
            # Update bracket position
            cursor.execute('''
                UPDATE bracket_positions
                SET winner_name = ?,
                    status = 'completed'
                WHERE id = ?
            ''', (winner, self.position.get('id')))
            
            conn.commit()
            
            QMessageBox.information(self, 'Success', f'Match recorded: {winner} wins!')
            self.accept()
        except Exception as e:
            QMessageBox.critical(self, 'Error', f'Failed to save match: {str(e)}')
