"""
Match detail dialog for viewing match information
"""
from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QFormLayout, QLabel, QPushButton, 
    QHBoxLayout, QTextEdit, QTableWidget, QTableWidgetItem,
    QHeaderView, QAbstractItemView, QMessageBox, QLineEdit,
    QComboBox, QSpinBox
)
from PyQt6.QtCore import Qt
from models.db import Database

class RefereeScoreDialog(QDialog):
    """Dialog for adding/editing referee scores with round-by-round scoring"""
    def __init__(self, db: Database, match_id: int, score_id: int = None, parent=None):
        super().__init__(parent)
        self.db = db
        self.match_id = match_id
        self.score_id = score_id
        self.score_data = None
        
        # Get all referee athletes
        self.referee_athletes = db.get_referee_athletes()
        
        # Round scores storage
        self.round_red_scores = []
        self.round_blue_scores = []
        
        if score_id:
            scores = db.get_referee_scores_for_match(match_id)
            self.score_data = next((s for s in scores if s['id'] == score_id), None)
            self.setWindowTitle('Edit Referee Score')
        else:
            self.setWindowTitle('Add Referee Score')
        
        self.init_ui()
        
        if self.score_data:
            self.load_data()
    
    def init_ui(self):
        """Initialize the dialog UI with round-by-round scoring"""
        self.setMinimumWidth(600)
        self.setMinimumHeight(400)
        
        layout = QVBoxLayout(self)
        
        # Referee selection with search
        ref_layout = QFormLayout()
        
        # Search box for filtering referees
        self.referee_search = QLineEdit()
        self.referee_search.setPlaceholderText('Search referee...')
        self.referee_search.textChanged.connect(self.filter_referees)
        ref_layout.addRow('Search:', self.referee_search)
        
        # Referee dropdown
        self.referee_name = QComboBox()
        self.referee_name.setEditable(False)
        self.populate_referees()
        ref_layout.addRow('Referee:', self.referee_name)
        
        layout.addLayout(ref_layout)
        
        # Rounds section
        rounds_label = QLabel('Round-by-Round Scoring:')
        rounds_label.setStyleSheet('font-weight: bold; font-size: 11pt; margin-top: 10px;')
        layout.addWidget(rounds_label)
        
        # Create 3 rounds
        from PyQt6.QtWidgets import QGroupBox, QGridLayout
        
        for round_num in range(1, 4):
            group = QGroupBox(f'Round {round_num}')
            grid = QGridLayout()
            
            # Red corner score
            grid.addWidget(QLabel('Red Corner:'), 0, 0)
            red_spin = QSpinBox()
            red_spin.setRange(0, 50)
            red_spin.setValue(0)
            red_spin.valueChanged.connect(self.calculate_totals)
            grid.addWidget(red_spin, 0, 1)
            self.round_red_scores.append(red_spin)
            
            # Blue corner score
            grid.addWidget(QLabel('Blue Corner:'), 0, 2)
            blue_spin = QSpinBox()
            blue_spin.setRange(0, 50)
            blue_spin.setValue(0)
            blue_spin.valueChanged.connect(self.calculate_totals)
            grid.addWidget(blue_spin, 0, 3)
            self.round_blue_scores.append(blue_spin)
            
            group.setLayout(grid)
            layout.addWidget(group)
        
        # Totals display
        totals_layout = QFormLayout()
        totals_layout.setContentsMargins(10, 10, 10, 10)
        
        self.total_red_label = QLabel('0')
        self.total_red_label.setStyleSheet('font-weight: bold; color: red; font-size: 12pt;')
        totals_layout.addRow('Total Red:', self.total_red_label)
        
        self.total_blue_label = QLabel('0')
        self.total_blue_label.setStyleSheet('font-weight: bold; color: blue; font-size: 12pt;')
        totals_layout.addRow('Total Blue:', self.total_blue_label)
        
        self.winner_label = QLabel('N/A')
        self.winner_label.setStyleSheet('font-weight: bold; color: green; font-size: 12pt;')
        totals_layout.addRow('Winner:', self.winner_label)
        
        layout.addLayout(totals_layout)
        
        # Buttons
        button_layout = QHBoxLayout()
        
        btn_save = QPushButton('💾 Save')
        btn_save.clicked.connect(self.save)
        button_layout.addWidget(btn_save)
        
        btn_cancel = QPushButton('❌ Cancel')
        btn_cancel.clicked.connect(self.reject)
        button_layout.addWidget(btn_cancel)
        
        layout.addLayout(button_layout)
    
    def populate_referees(self, filter_text=''):
        """Populate referee dropdown with optional filtering"""
        self.referee_name.clear()
        
        if not self.referee_athletes:
            self.referee_name.addItem('No referees available')
            self.referee_name.setEnabled(False)
            return
        
        # Store current selection
        current_text = self.referee_name.currentText()
        
        # Filter and add referees
        filter_lower = filter_text.lower()
        added_count = 0
        
        for ref in self.referee_athletes:
            full_name = f"{ref.get('first_name', '')} {ref.get('last_name', '')}"
            if not filter_text or filter_lower in full_name.lower():
                club = ref.get('club_name', '')
                display_text = f"{full_name} ({club})" if club else full_name
                self.referee_name.addItem(display_text, full_name)  # Store full name as data
                added_count += 1
        
        if added_count == 0:
            self.referee_name.addItem('No matching referees')
            self.referee_name.setEnabled(False)
        else:
            self.referee_name.setEnabled(True)
            # Restore selection if it exists
            if current_text:
                index = self.referee_name.findText(current_text)
                if index >= 0:
                    self.referee_name.setCurrentIndex(index)
    
    def filter_referees(self):
        """Filter referees based on search text"""
        self.populate_referees(self.referee_search.text())
    
    def calculate_totals(self):
        """Calculate and display total scores"""
        total_red = sum(spin.value() for spin in self.round_red_scores)
        total_blue = sum(spin.value() for spin in self.round_blue_scores)
        
        self.total_red_label.setText(str(total_red))
        self.total_blue_label.setText(str(total_blue))
        
        if total_red > total_blue:
            self.winner_label.setText('Red Corner')
            self.winner_label.setStyleSheet('font-weight: bold; color: red; font-size: 12pt;')
        elif total_blue > total_red:
            self.winner_label.setText('Blue Corner')
            self.winner_label.setStyleSheet('font-weight: bold; color: blue; font-size: 12pt;')
        else:
            self.winner_label.setText('Draw')
            self.winner_label.setStyleSheet('font-weight: bold; color: gray; font-size: 12pt;')
    
    def load_data(self):
        """Load score data into form"""
        if not self.score_data:
            return
        
        # Select referee from dropdown - use the stored data (full name)
        referee_name = self.score_data.get('referee_name', '')
        for i in range(self.referee_name.count()):
            if self.referee_name.itemData(i) == referee_name:
                self.referee_name.setCurrentIndex(i)
                break
        else:
            # If not found in current list, add it
            if referee_name:
                self.referee_name.addItem(referee_name, referee_name)
                self.referee_name.setCurrentIndex(self.referee_name.count() - 1)
        
        # Load round scores from JSON
        import json
        rounds_data = self.score_data.get('rounds')
        if rounds_data:
            try:
                if isinstance(rounds_data, str):
                    rounds = json.loads(rounds_data)
                else:
                    rounds = rounds_data
                
                # rounds is array of {round: 1, red: X, blue: Y}
                for round_data in rounds:
                    round_num = round_data.get('round', 1)
                    if 1 <= round_num <= 3:
                        self.round_red_scores[round_num - 1].setValue(round_data.get('red', 0))
                        self.round_blue_scores[round_num - 1].setValue(round_data.get('blue', 0))
            except:
                pass
        
        self.calculate_totals()
    
    def save(self):
        """Save referee score with round-by-round data"""
        import json
        
        # Get referee name from combobox data
        current_index = self.referee_name.currentIndex()
        referee_name = self.referee_name.itemData(current_index)
        
        if not referee_name:
            # Fallback to text if no data
            referee_name = self.referee_name.currentText().strip()
            # Extract name from "Name (Club)" format
            if '(' in referee_name:
                referee_name = referee_name.split('(')[0].strip()
        
        if not referee_name or referee_name in ['No referees available', 'No matching referees']:
            QMessageBox.warning(self, 'Validation Error', 'Please select a valid referee')
            return
        
        # Build rounds array
        rounds = []
        for i in range(3):
            rounds.append({
                'round': i + 1,
                'red': self.round_red_scores[i].value(),
                'blue': self.round_blue_scores[i].value()
            })
        
        # Calculate totals
        total_red = sum(r['red'] for r in rounds)
        total_blue = sum(r['blue'] for r in rounds)
        
        # Determine winner
        winner = None
        if total_red > total_blue:
            winner = 'red'
        elif total_blue > total_red:
            winner = 'blue'
        
        data = {
            'match_id': self.match_id,
            'referee_name': referee_name,
            'red_corner_score': total_red,
            'blue_corner_score': total_blue,
            'winner': winner,
            'rounds': json.dumps(rounds)
        }
        
        try:
            if self.score_id:
                self.db.update_referee_score(self.score_id, data)
                QMessageBox.information(self, 'Success', 'Referee score updated successfully')
            else:
                self.db.insert_referee_score(data)
                QMessageBox.information(self, 'Success', 'Referee score added successfully')
            
            self.accept()
        except Exception as e:
            QMessageBox.critical(self, 'Error', f'Failed to save referee score: {str(e)}')

class SelectRefereeDialog(QDialog):
    """Dialog for selecting a referee from referee athletes"""
    def __init__(self, db: Database, parent=None):
        super().__init__(parent)
        self.db = db
        self.selected_referee = None
        
        self.setWindowTitle('Select Central Referee')
        self.setMinimumWidth(600)
        self.setMinimumHeight(400)
        
        self.init_ui()
        self.load_referees()
    
    def init_ui(self):
        """Initialize the dialog UI"""
        layout = QVBoxLayout(self)
        
        # Instructions
        info_label = QLabel('Select a referee from the list below:')
        layout.addWidget(info_label)
        
        # Search box
        search_layout = QHBoxLayout()
        search_layout.addWidget(QLabel('Search:'))
        self.search_box = QLineEdit()
        self.search_box.setPlaceholderText('Search by name...')
        self.search_box.textChanged.connect(self.filter_referees)
        search_layout.addWidget(self.search_box)
        layout.addLayout(search_layout)
        
        # Referees table
        self.referees_table = QTableWidget()
        self.referees_table.setColumnCount(5)
        self.referees_table.setHorizontalHeaderLabels(['ID', 'First Name', 'Last Name', 'Club', 'Grade'])
        self.referees_table.hideColumn(0)  # Hide ID column
        self.referees_table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.referees_table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.referees_table.doubleClicked.connect(self.select_referee)
        
        header = self.referees_table.horizontalHeader()
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(3, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(4, QHeaderView.ResizeMode.ResizeToContents)
        
        layout.addWidget(self.referees_table)
        
        # Buttons
        button_layout = QHBoxLayout()
        
        btn_select = QPushButton('✓ Select')
        btn_select.clicked.connect(self.select_referee)
        button_layout.addWidget(btn_select)
        
        btn_cancel = QPushButton('✗ Cancel')
        btn_cancel.clicked.connect(self.reject)
        button_layout.addWidget(btn_cancel)
        
        button_layout.addStretch()
        layout.addLayout(button_layout)
    
    def load_referees(self):
        """Load all referee athletes"""
        self.all_referees = self.db.get_referee_athletes()
        self.filter_referees()
    
    def filter_referees(self):
        """Filter referees based on search text"""
        search_text = self.search_box.text().lower()
        
        # Filter referees
        filtered = []
        for ref in self.all_referees:
            full_name = f"{ref.get('first_name', '')} {ref.get('last_name', '')}"
            
            if search_text:
                if (search_text in full_name.lower() or 
                    search_text in ref.get('club_name', '').lower()):
                    filtered.append(ref)
            else:
                filtered.append(ref)
        
        # Update table
        self.referees_table.setRowCount(len(filtered))
        
        for row, ref in enumerate(filtered):
            self.referees_table.setItem(row, 0, QTableWidgetItem(str(ref.get('id', ''))))
            self.referees_table.setItem(row, 1, QTableWidgetItem(ref.get('first_name', '')))
            self.referees_table.setItem(row, 2, QTableWidgetItem(ref.get('last_name', '')))
            self.referees_table.setItem(row, 3, QTableWidgetItem(ref.get('club_name', '') or 'N/A'))
            self.referees_table.setItem(row, 4, QTableWidgetItem(ref.get('current_grade_name', '') or 'N/A'))
    
    def select_referee(self):
        """Select referee from table"""
        selected = self.referees_table.selectedItems()
        if not selected:
            QMessageBox.warning(self, 'No Selection', 'Please select a referee')
            return
        
        row = selected[0].row()
        first_name = self.referees_table.item(row, 1).text()
        last_name = self.referees_table.item(row, 2).text()
        self.selected_referee = f"{first_name} {last_name}"
        
        self.accept()

class MatchDetailDialog(QDialog):
    def __init__(self, db: Database, match_id: int, parent=None):
        super().__init__(parent)
        self.db = db
        self.match_id = match_id
        self.match_data = None
        
        # Get match data
        matches = db.get_all_matches()
        self.match_data = next((m for m in matches if m['id'] == match_id), None)
        
        if self.match_data:
            self.setWindowTitle(f"Match Details - {self.match_data.get('category_name', 'Unknown')}")
        else:
            self.setWindowTitle('Match Details')
        
        self.init_ui()
        
        if self.match_data:
            self.load_data()
    
    def init_ui(self):
        """Initialize the dialog UI"""
        self.setMinimumWidth(500)
        
        layout = QVBoxLayout(self)
        form_layout = QFormLayout()
        
        # Match information labels
        self.match_number = QLabel()
        form_layout.addRow('Match #:', self.match_number)
        
        self.category = QLabel()
        form_layout.addRow('Category:', self.category)
        
        self.round = QLabel()
        form_layout.addRow('Round:', self.round)
        
        self.status = QLabel()
        form_layout.addRow('Status:', self.status)
        
        # Athlete information
        form_layout.addRow('', QLabel())  # Spacer
        
        self.athlete1_label = QLabel()
        self.athlete1_label.setStyleSheet("font-weight: bold; color: #DC143C;")
        form_layout.addRow('Red Corner:', self.athlete1_label)
        
        self.athlete2_label = QLabel()
        self.athlete2_label.setStyleSheet("font-weight: bold; color: #4169E1;")
        form_layout.addRow('Blue Corner:', self.athlete2_label)
        
        form_layout.addRow('', QLabel())  # Spacer
        
        self.winner_label = QLabel()
        self.winner_label.setStyleSheet("font-weight: bold; font-size: 12pt; color: #228B22;")
        form_layout.addRow('Winner:', self.winner_label)
        
        layout.addLayout(form_layout)
        
        # Central Referee section
        layout.addWidget(QLabel())  # Spacer
        central_ref_label = QLabel('Central Referee:')
        central_ref_label.setStyleSheet("font-weight: bold; font-size: 11pt;")
        layout.addWidget(central_ref_label)
        
        # Central referee display and management
        central_ref_layout = QHBoxLayout()
        
        self.central_referee_label = QLabel('Not assigned')
        self.central_referee_label.setStyleSheet('font-size: 10pt; padding: 5px;')
        central_ref_layout.addWidget(self.central_referee_label)
        
        btn_change_referee = QPushButton('Change Referee')
        btn_change_referee.clicked.connect(self.change_central_referee)
        central_ref_layout.addWidget(btn_change_referee)
        
        btn_clear_referee = QPushButton('Clear')
        btn_clear_referee.clicked.connect(self.clear_central_referee)
        central_ref_layout.addWidget(btn_clear_referee)
        
        central_ref_layout.addStretch()
        layout.addLayout(central_ref_layout)
        
        # Referee scores section
        layout.addWidget(QLabel())  # Spacer
        scores_label = QLabel('Referee Scores:')
        scores_label.setStyleSheet("font-weight: bold; font-size: 11pt;")
        layout.addWidget(scores_label)
        
        # Referee scores buttons
        scores_button_layout = QHBoxLayout()
        
        btn_add_score = QPushButton('➕ Add Score')
        btn_add_score.clicked.connect(self.add_referee_score)
        scores_button_layout.addWidget(btn_add_score)
        
        btn_edit_score = QPushButton('✏️ Edit Score')
        btn_edit_score.clicked.connect(self.edit_referee_score)
        scores_button_layout.addWidget(btn_edit_score)
        
        btn_delete_score = QPushButton('🗑️ Delete Score')
        btn_delete_score.clicked.connect(self.delete_referee_score)
        scores_button_layout.addWidget(btn_delete_score)
        
        scores_button_layout.addStretch()
        layout.addLayout(scores_button_layout)
        
        # Referee scores table
        self.scores_table = QTableWidget()
        self.scores_table.setColumnCount(10)
        self.scores_table.setHorizontalHeaderLabels([
            'ID', 'Referee', 
            'Red R1', 'Red R2', 'Red R3', 'Red Total',
            'Blue R1', 'Blue R2', 'Blue R3', 'Blue Total'
        ])
        self.scores_table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.scores_table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.scores_table.setMaximumHeight(200)
        
        # Column widths
        header = self.scores_table.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        for col in range(2, 10):
            header.setSectionResizeMode(col, QHeaderView.ResizeMode.ResizeToContents)
        
        layout.addWidget(self.scores_table)
        
        # Close button
        button_layout = QHBoxLayout()
        btn_close = QPushButton('Close')
        btn_close.clicked.connect(self.accept)
        button_layout.addStretch()
        button_layout.addWidget(btn_close)
        
        layout.addLayout(button_layout)
    
    def load_data(self):
        """Load match data into form"""
        if not self.match_data:
            return
        
        self.match_number.setText(str(self.match_data.get('match_number', 'N/A')))
        self.category.setText(self.match_data.get('category_name', 'N/A'))
        
        round_text = self.match_data.get('round', 'N/A')
        if round_text:
            round_text = round_text.replace('-', ' ').title()
        self.round.setText(round_text)
        
        status_text = self.match_data.get('status', 'N/A')
        if status_text:
            status_text = status_text.capitalize()
        self.status.setText(status_text)
        
        athlete1_name = self.match_data.get('athlete1_name', 'TBD')
        self.athlete1_label.setText(athlete1_name or 'TBD')
        
        athlete2_name = self.match_data.get('athlete2_name', 'TBD')
        self.athlete2_label.setText(athlete2_name or 'TBD')
        
        winner_name = self.match_data.get('winner_name')
        if winner_name:
            self.winner_label.setText(winner_name)
        else:
            self.winner_label.setText('Match not completed')
            self.winner_label.setStyleSheet("font-weight: normal; font-size: 10pt; color: #666;")
        
        # Load central referee and scores
        self.load_central_referee()
        self.load_referee_scores()
    
    def load_central_referee(self):
        """Load and display central referee"""
        referee_name = self.db.get_central_referee(self.match_id)
        if referee_name:
            self.central_referee_label.setText(referee_name)
            self.central_referee_label.setStyleSheet('font-size: 10pt; padding: 5px; font-weight: bold; color: #2E7D32;')
        else:
            self.central_referee_label.setText('Not assigned')
            self.central_referee_label.setStyleSheet('font-size: 10pt; padding: 5px; color: #666;')
    
    def change_central_referee(self):
        """Open dialog to select central referee"""
        dialog = SelectRefereeDialog(self.db, parent=self)
        if dialog.exec():
            referee_name = dialog.selected_referee
            if referee_name:
                self.db.update_central_referee(self.match_id, referee_name)
                self.load_central_referee()
                QMessageBox.information(self, 'Success', 'Central referee updated')
    
    def clear_central_referee(self):
        """Clear the central referee"""
        reply = QMessageBox.question(
            self, 'Confirm Clear',
            'Are you sure you want to clear the central referee?',
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            self.db.update_central_referee(self.match_id, '')
            self.load_central_referee()
            QMessageBox.information(self, 'Success', 'Central referee cleared')
    
    def load_referee_scores(self):
        """Load referee scores into table with round-by-round breakdown"""
        import json
        
        scores = self.db.get_referee_scores_for_match(self.match_id)
        
        self.scores_table.setRowCount(len(scores))
        
        for row, score in enumerate(scores):
            # ID and Referee name
            self.scores_table.setItem(row, 0, QTableWidgetItem(str(score.get('id', ''))))
            self.scores_table.setItem(row, 1, QTableWidgetItem(score.get('referee_name', '')))
            
            # Parse rounds JSON
            rounds = []
            rounds_json = score.get('rounds')
            if rounds_json:
                try:
                    if isinstance(rounds_json, str):
                        rounds = json.loads(rounds_json)
                    else:
                        rounds = rounds_json
                except:
                    rounds = []
            
            # Extract round scores
            red_r1 = red_r2 = red_r3 = 0
            blue_r1 = blue_r2 = blue_r3 = 0
            
            for round_data in rounds:
                round_num = round_data.get('round', 0)
                if round_num == 1:
                    red_r1 = round_data.get('red', 0)
                    blue_r1 = round_data.get('blue', 0)
                elif round_num == 2:
                    red_r2 = round_data.get('red', 0)
                    blue_r2 = round_data.get('blue', 0)
                elif round_num == 3:
                    red_r3 = round_data.get('red', 0)
                    blue_r3 = round_data.get('blue', 0)
            
            # Calculate totals
            red_total = red_r1 + red_r2 + red_r3
            blue_total = blue_r1 + blue_r2 + blue_r3
            
            # Red corner columns (R1, R2, R3, Total)
            self.scores_table.setItem(row, 2, QTableWidgetItem(str(red_r1)))
            self.scores_table.setItem(row, 3, QTableWidgetItem(str(red_r2)))
            self.scores_table.setItem(row, 4, QTableWidgetItem(str(red_r3)))
            
            red_total_item = QTableWidgetItem(str(red_total))
            red_total_item.setForeground(Qt.GlobalColor.red)
            self.scores_table.setItem(row, 5, red_total_item)
            
            # Blue corner columns (R1, R2, R3, Total)
            self.scores_table.setItem(row, 6, QTableWidgetItem(str(blue_r1)))
            self.scores_table.setItem(row, 7, QTableWidgetItem(str(blue_r2)))
            self.scores_table.setItem(row, 8, QTableWidgetItem(str(blue_r3)))
            
            blue_total_item = QTableWidgetItem(str(blue_total))
            blue_total_item.setForeground(Qt.GlobalColor.blue)
            self.scores_table.setItem(row, 9, blue_total_item)
    
    def get_selected_score_id(self):
        """Get the ID of the currently selected referee score"""
        selected = self.scores_table.selectedItems()
        if not selected:
            return None
        
        row = selected[0].row()
        id_item = self.scores_table.item(row, 0)
        return int(id_item.text()) if id_item else None
    
    def add_referee_score(self):
        """Open dialog to add new referee score"""
        dialog = RefereeScoreDialog(self.db, self.match_id, parent=self)
        if dialog.exec():
            self.load_referee_scores()
    
    def edit_referee_score(self):
        """Open dialog to edit selected referee score"""
        score_id = self.get_selected_score_id()
        if not score_id:
            QMessageBox.warning(self, 'No Selection', 'Please select a referee score to edit')
            return
        
        dialog = RefereeScoreDialog(self.db, self.match_id, score_id, parent=self)
        if dialog.exec():
            self.load_referee_scores()
    
    def delete_referee_score(self):
        """Delete selected referee score"""
        score_id = self.get_selected_score_id()
        if not score_id:
            QMessageBox.warning(self, 'No Selection', 'Please select a referee score to delete')
            return
        
        reply = QMessageBox.question(
            self, 'Confirm Delete',
            'Are you sure you want to delete this referee score?',
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            try:
                self.db.delete_referee_score(score_id)
                QMessageBox.information(self, 'Success', 'Referee score deleted successfully')
                self.load_referee_scores()
            except Exception as e:
                QMessageBox.critical(self, 'Error', f'Failed to delete referee score: {str(e)}')
