"""
Tatami/Scoring Station Management UI
"""
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel, QLineEdit,
    QComboBox, QTableWidget, QTableWidgetItem, QDialog, QMessageBox,
    QInputDialog, QSpinBox, QFormLayout
)
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QFont, QColor
from models.lan_manager import LANManager, TatamiType


class TatamiDialog(QDialog):
    """Dialog for creating/editing tatami"""
    
    def __init__(self, parent=None, tatami=None):
        super().__init__(parent)
        self.tatami = tatami
        self.setWindowTitle("Tatami Configuration")
        self.setGeometry(200, 200, 400, 300)
        self.init_ui()
    
    def init_ui(self):
        """Initialize dialog UI"""
        layout = QFormLayout()
        
        # Name
        self.name_input = QLineEdit()
        if self.tatami:
            self.name_input.setText(self.tatami.name)
        layout.addRow("Tatami Name:", self.name_input)
        
        # Station Number
        self.station_input = QSpinBox()
        self.station_input.setMinimum(1)
        self.station_input.setMaximum(20)
        if self.tatami:
            self.station_input.setValue(self.tatami.station_number)
        else:
            self.station_input.setValue(1)
        layout.addRow("Station Number:", self.station_input)
        
        # Type
        self.type_combo = QComboBox()
        self.type_combo.addItems([TatamiType.FIGHT.value, TatamiType.DEMONSTRATION.value])
        if self.tatami:
            self.type_combo.setCurrentText(self.tatami.type.value)
        layout.addRow("Type:", self.type_combo)
        
        # Buttons
        button_layout = QHBoxLayout()
        
        ok_btn = QPushButton("OK")
        ok_btn.clicked.connect(self.accept)
        button_layout.addWidget(ok_btn)
        
        cancel_btn = QPushButton("Cancel")
        cancel_btn.clicked.connect(self.reject)
        button_layout.addWidget(cancel_btn)
        
        layout.addRow(button_layout)
        
        self.setLayout(layout)
    
    def get_data(self):
        """Get dialog data"""
        return {
            'name': self.name_input.text(),
            'station_number': self.station_input.value(),
            'type': self.type_combo.currentText()
        }


class TatamiManagerWidget(QWidget):
    """Widget for managing tatami/scoring stations"""
    
    tatami_selected = pyqtSignal(int)  # Emits tatami_id
    
    def __init__(self, db):
        super().__init__()
        self.db = db
        self.lan_manager = LANManager(db.connection)
        self.init_ui()
        self.load_tatamis()
    
    def init_ui(self):
        """Initialize UI"""
        layout = QVBoxLayout()
        
        # Header
        header = QLabel("🏛️ Tatami/Scoring Stations")
        font = QFont()
        font.setPointSize(14)
        font.setBold(True)
        header.setFont(font)
        layout.addWidget(header)
        
        # Controls
        control_layout = QHBoxLayout()
        
        add_btn = QPushButton("➕ Add Tatami")
        add_btn.clicked.connect(self.add_tatami)
        control_layout.addWidget(add_btn)
        
        self.edit_btn = QPushButton("✏️ Edit")
        self.edit_btn.clicked.connect(self.edit_tatami)
        self.edit_btn.setEnabled(False)
        control_layout.addWidget(self.edit_btn)
        
        self.delete_btn = QPushButton("🗑️ Delete")
        self.delete_btn.clicked.connect(self.delete_tatami)
        self.delete_btn.setEnabled(False)
        control_layout.addWidget(self.delete_btn)
        
        self.activate_btn = QPushButton("✅ Activate/Deactivate")
        self.activate_btn.clicked.connect(self.toggle_active)
        self.activate_btn.setEnabled(False)
        control_layout.addWidget(self.activate_btn)
        
        control_layout.addStretch()
        layout.addLayout(control_layout)
        
        # Tatami Table
        self.table = QTableWidget()
        self.table.setColumnCount(5)
        self.table.setHorizontalHeaderLabels([
            "Station #", "Name", "Type", "Active", "Created"
        ])
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.setSelectionMode(QTableWidget.SelectionMode.SingleSelection)
        self.table.itemSelectionChanged.connect(self.on_selection_changed)
        layout.addWidget(self.table)
        
        self.setLayout(layout)
    
    def load_tatamis(self):
        """Load tatamis from database"""
        self.table.setRowCount(0)
        
        tatamis = self.lan_manager.get_all_tatamis()
        
        for tatami in tatamis:
            row = self.table.rowCount()
            self.table.insertRow(row)
            
            # Station Number
            item = QTableWidgetItem(str(tatami.station_number))
            self.table.setItem(row, 0, item)
            
            # Name
            item = QTableWidgetItem(tatami.name)
            self.table.setItem(row, 1, item)
            
            # Type
            type_text = tatami.type.value.capitalize()
            item = QTableWidgetItem(type_text)
            self.table.setItem(row, 2, item)
            
            # Active
            active_text = "✅ Yes" if tatami.is_active else "❌ No"
            item = QTableWidgetItem(active_text)
            if not tatami.is_active:
                item.setBackground(QColor(200, 200, 200))
            self.table.setItem(row, 3, item)
            
            # Created
            item = QTableWidgetItem(tatami.created_at[:10])
            self.table.setItem(row, 4, item)
            
            # Store tatami ID
            item.tatami_id = tatami.id
        
        self.table.resizeColumnsToContents()
    
    def add_tatami(self):
        """Add new tatami"""
        dialog = TatamiDialog(self)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            data = dialog.get_data()
            try:
                self.lan_manager.create_tatami(
                    data['name'],
                    data['station_number'],
                    data['type']
                )
                self.load_tatamis()
                QMessageBox.information(self, "Success", f"Tatami '{data['name']}' created")
            except Exception as e:
                QMessageBox.critical(self, "Error", f"Failed to create tatami: {str(e)}")
    
    def edit_tatami(self):
        """Edit selected tatami"""
        selected = self.table.selectedIndexes()
        if not selected:
            return
        
        row = selected[0].row()
        tatami_id = self.table.item(row, 0).tatami_id if hasattr(self.table.item(row, 0), 'tatami_id') else None
        
        if not tatami_id:
            tatami_id = int(self.table.item(row, 0).text())
        
        tatami = self.lan_manager.get_tatami(tatami_id)
        if tatami:
            dialog = TatamiDialog(self, tatami)
            if dialog.exec() == QDialog.DialogCode.Accepted:
                data = dialog.get_data()
                try:
                    self.lan_manager.update_tatami(tatami_id, data['name'])
                    self.load_tatamis()
                    QMessageBox.information(self, "Success", "Tatami updated")
                except Exception as e:
                    QMessageBox.critical(self, "Error", f"Failed to update: {str(e)}")
    
    def delete_tatami(self):
        """Delete selected tatami"""
        selected = self.table.selectedIndexes()
        if not selected:
            return
        
        reply = QMessageBox.question(self, "Confirm",
                                    "Delete this tatami and all its sessions?",
                                    QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        
        if reply == QMessageBox.StandardButton.Yes:
            row = selected[0].row()
            tatami_id = int(self.table.item(row, 0).text())
            try:
                self.lan_manager.delete_tatami(tatami_id)
                self.load_tatamis()
                QMessageBox.information(self, "Success", "Tatami deleted")
            except Exception as e:
                QMessageBox.critical(self, "Error", f"Failed to delete: {str(e)}")
    
    def toggle_active(self):
        """Toggle tatami active status"""
        selected = self.table.selectedIndexes()
        if not selected:
            return
        
        row = selected[0].row()
        tatami_id = int(self.table.item(row, 0).text())
        
        tatami = self.lan_manager.get_tatami(tatami_id)
        if tatami:
            try:
                self.lan_manager.update_tatami(tatami_id, is_active=not tatami.is_active)
                self.load_tatamis()
            except Exception as e:
                QMessageBox.critical(self, "Error", f"Failed to update: {str(e)}")
    
    def on_selection_changed(self):
        """Handle selection change"""
        has_selection = len(self.table.selectedIndexes()) > 0
        self.edit_btn.setEnabled(has_selection)
        self.delete_btn.setEnabled(has_selection)
        self.activate_btn.setEnabled(has_selection)
        
        if has_selection:
            row = self.table.selectedIndexes()[0].row()
            tatami_id = int(self.table.item(row, 0).text())
            self.tatami_selected.emit(tatami_id)
