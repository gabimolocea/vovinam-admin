"""
FRVV Athlete Manager - Offline Desktop Application
Syncs with Django backend and provides Excel import/export
"""
import sys
from PyQt6.QtWidgets import QApplication
from PyQt6.QtGui import QIcon
from ui.main_window import MainWindow
from ui.theme import ThemeManager
import config

def main():
    app = QApplication(sys.argv)
    app.setApplicationName(config.APP_NAME)
    app.setApplicationVersion(config.APP_VERSION)
    
    # Set application style
    app.setStyle('Fusion')
    
    # Apply saved theme
    saved_theme = ThemeManager.get_saved_theme()
    ThemeManager.apply_theme(app, saved_theme)
    
    # Create and show main window
    window = MainWindow()
    window.show()
    
    sys.exit(app.exec())

if __name__ == '__main__':
    main()
