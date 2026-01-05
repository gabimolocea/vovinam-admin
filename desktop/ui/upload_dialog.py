"""Dialog for selecting what to upload to server"""
from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QCheckBox, 
    QPushButton, QLabel, QGroupBox
)
from PyQt6.QtCore import Qt


class UploadDialog(QDialog):
    """Dialog to select which data types to upload"""
    
    def __init__(self, parent=None, counts=None):
        super().__init__(parent)
        self.counts = counts or {}
        self.setWindowTitle('Select Data to Upload')
        self.setMinimumWidth(400)
        self.setup_ui()
    
    def setup_ui(self):
        layout = QVBoxLayout()
        
        # Header
        header = QLabel('Select what to upload to the server:')
        header.setStyleSheet('font-weight: bold; font-size: 12pt; padding: 10px;')
        layout.addWidget(header)
        
        # Checkboxes group
        group = QGroupBox('Data Types')
        group_layout = QVBoxLayout()
        
        # Create checkboxes
        self.cb_competitions = QCheckBox('Competitions')
        self.cb_categories = QCheckBox('Categories')
        self.cb_grades = QCheckBox('Grades')
        self.cb_clubs = QCheckBox('Clubs')
        self.cb_athletes = QCheckBox('Athletes')
        self.cb_matches = QCheckBox('Match Changes')
        self.cb_scores = QCheckBox('Referee Scores')
        self.cb_deletions = QCheckBox('Deletions')
        
        # Set counts and enable/disable based on availability
        comp_count = self.counts.get('competitions', 0)
        self.cb_competitions.setText(f'Competitions ({comp_count})')
        self.cb_competitions.setEnabled(comp_count > 0)
        if comp_count > 0:
            self.cb_competitions.setChecked(True)
        
        cat_count = self.counts.get('categories', 0)
        self.cb_categories.setText(f'Categories ({cat_count})')
        self.cb_categories.setEnabled(cat_count > 0)
        if cat_count > 0:
            self.cb_categories.setChecked(True)
        
        grade_count = self.counts.get('grades', 0)
        self.cb_grades.setText(f'Grades ({grade_count})')
        self.cb_grades.setEnabled(grade_count > 0)
        if grade_count > 0:
            self.cb_grades.setChecked(True)
        
        club_count = self.counts.get('clubs', 0)
        self.cb_clubs.setText(f'Clubs ({club_count})')
        self.cb_clubs.setEnabled(club_count > 0)
        if club_count > 0:
            self.cb_clubs.setChecked(True)
        
        athlete_count = self.counts.get('athletes', 0)
        self.cb_athletes.setText(f'Athletes ({athlete_count})')
        self.cb_athletes.setEnabled(athlete_count > 0)
        if athlete_count > 0:
            self.cb_athletes.setChecked(True)
        
        match_count = self.counts.get('matches', 0)
        self.cb_matches.setText(f'Match Changes ({match_count})')
        self.cb_matches.setEnabled(match_count > 0)
        if match_count > 0:
            self.cb_matches.setChecked(True)
        
        score_count = self.counts.get('scores', 0)
        self.cb_scores.setText(f'Referee Scores ({score_count})')
        self.cb_scores.setEnabled(score_count > 0)
        if score_count > 0:
            self.cb_scores.setChecked(True)
        
        deletion_count = self.counts.get('deletions', 0)
        self.cb_deletions.setText(f'Deletions ({deletion_count})')
        self.cb_deletions.setEnabled(deletion_count > 0)
        if deletion_count > 0:
            self.cb_deletions.setChecked(True)
        
        group_layout.addWidget(self.cb_competitions)
        group_layout.addWidget(self.cb_categories)
        group_layout.addWidget(self.cb_grades)
        group_layout.addWidget(self.cb_clubs)
        group_layout.addWidget(self.cb_athletes)
        group_layout.addWidget(self.cb_matches)
        group_layout.addWidget(self.cb_scores)
        group_layout.addWidget(self.cb_deletions)
        
        group.setLayout(group_layout)
        layout.addWidget(group)
        
        # Info label
        total = sum(self.counts.values())
        info = QLabel(f'Total items to upload: {total}')
        info.setStyleSheet('padding: 10px; color: #666;')
        layout.addWidget(info)
        
        # Buttons
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        btn_cancel = QPushButton('Cancel')
        btn_cancel.clicked.connect(self.reject)
        button_layout.addWidget(btn_cancel)
        
        btn_upload = QPushButton('Upload Selected')
        btn_upload.clicked.connect(self.accept)
        btn_upload.setDefault(True)
        btn_upload.setStyleSheet('background-color: #4CAF50; color: white; padding: 5px 15px;')
        button_layout.addWidget(btn_upload)
        
        layout.addLayout(button_layout)
        
        self.setLayout(layout)
    
    def get_selected(self):
        """Return dict of selected upload types"""
        return {
            'competitions': self.cb_competitions.isChecked() and self.cb_competitions.isEnabled(),
            'categories': self.cb_categories.isChecked() and self.cb_categories.isEnabled(),
            'grades': self.cb_grades.isChecked() and self.cb_grades.isEnabled(),
            'clubs': self.cb_clubs.isChecked() and self.cb_clubs.isEnabled(),
            'athletes': self.cb_athletes.isChecked() and self.cb_athletes.isEnabled(),
            'matches': self.cb_matches.isChecked() and self.cb_matches.isEnabled(),
            'scores': self.cb_scores.isChecked() and self.cb_scores.isEnabled(),
            'deletions': self.cb_deletions.isChecked() and self.cb_deletions.isEnabled(),
        }
