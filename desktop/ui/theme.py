"""
Theme manager for the desktop application
Provides light and dark mode styles
"""
from PyQt6.QtGui import QPalette, QColor
from PyQt6.QtWidgets import QApplication
from PyQt6.QtCore import QSettings

class ThemeManager:
    """Manages application themes"""
    
    # Light theme palette
    LIGHT_THEME = {
        'Window': '#F5F5F5',
        'WindowText': '#212121',
        'Base': '#FFFFFF',
        'AlternateBase': '#F5F5F5',
        'ToolTipBase': '#FFFFCC',
        'ToolTipText': '#212121',
        'Text': '#212121',
        'Button': '#E0E0E0',
        'ButtonText': '#212121',
        'BrightText': '#FF0000',
        'Link': '#2196F3',
        'Highlight': '#2196F3',
        'HighlightedText': '#FFFFFF',
    }
    
    # Dark theme palette
    DARK_THEME = {
        'Window': '#2B2B2B',
        'WindowText': '#E0E0E0',
        'Base': '#1E1E1E',
        'AlternateBase': '#2B2B2B',
        'ToolTipBase': '#424242',
        'ToolTipText': '#E0E0E0',
        'Text': '#E0E0E0',
        'Button': '#424242',
        'ButtonText': '#E0E0E0',
        'BrightText': '#FF0000',
        'Link': '#42A5F5',
        'Highlight': '#42A5F5',
        'HighlightedText': '#FFFFFF',
    }
    
    # Stylesheet for common widgets
    LIGHT_STYLESHEET = """
        QMainWindow {
            background-color: #F5F5F5;
        }
        QTabWidget::pane {
            border: 1px solid #CCCCCC;
            background-color: #FFFFFF;
        }
        QTabBar::tab {
            background-color: #E0E0E0;
            color: #212121;
            padding: 8px 16px;
            border: 1px solid #CCCCCC;
            border-bottom: none;
            border-top-left-radius: 4px;
            border-top-right-radius: 4px;
        }
        QTabBar::tab:selected {
            background-color: #FFFFFF;
            color: #2196F3;
            font-weight: bold;
        }
        QTabBar::tab:hover {
            background-color: #F5F5F5;
        }
        QTableWidget {
            background-color: #FFFFFF;
            alternate-background-color: #F5F5F5;
            gridline-color: #E0E0E0;
            selection-background-color: #2196F3;
            selection-color: #FFFFFF;
        }
        QTableWidget::item {
            padding: 4px;
        }
        QHeaderView::section {
            background-color: #E0E0E0;
            color: #212121;
            padding: 6px;
            border: 1px solid #CCCCCC;
            font-weight: bold;
        }
        QPushButton {
            background-color: #2196F3;
            color: #FFFFFF;
            border: none;
            padding: 6px 16px;
            border-radius: 4px;
            font-weight: bold;
        }
        QPushButton:hover {
            background-color: #1976D2;
        }
        QPushButton:pressed {
            background-color: #0D47A1;
        }
        QPushButton:disabled {
            background-color: #BDBDBD;
            color: #757575;
        }
        QLineEdit, QTextEdit, QSpinBox, QComboBox {
            background-color: #FFFFFF;
            border: 1px solid #CCCCCC;
            padding: 4px;
            border-radius: 3px;
        }
        QLineEdit:focus, QTextEdit:focus, QSpinBox:focus, QComboBox:focus {
            border: 2px solid #2196F3;
        }
        QMenuBar {
            background-color: #FFFFFF;
            color: #212121;
        }
        QMenuBar::item:selected {
            background-color: #E0E0E0;
        }
        QMenu {
            background-color: #FFFFFF;
            color: #212121;
            border: 1px solid #CCCCCC;
        }
        QMenu::item:selected {
            background-color: #2196F3;
            color: #FFFFFF;
        }
        QStatusBar {
            background-color: #E0E0E0;
            color: #212121;
        }
    """
    
    DARK_STYLESHEET = """
        QMainWindow {
            background-color: #2B2B2B;
        }
        QTabWidget::pane {
            border: 1px solid #424242;
            background-color: #1E1E1E;
        }
        QTabBar::tab {
            background-color: #424242;
            color: #E0E0E0;
            padding: 8px 16px;
            border: 1px solid #555555;
            border-bottom: none;
            border-top-left-radius: 4px;
            border-top-right-radius: 4px;
        }
        QTabBar::tab:selected {
            background-color: #1E1E1E;
            color: #42A5F5;
            font-weight: bold;
        }
        QTabBar::tab:hover {
            background-color: #363636;
        }
        QTableWidget {
            background-color: #1E1E1E;
            alternate-background-color: #2B2B2B;
            gridline-color: #424242;
            selection-background-color: #42A5F5;
            selection-color: #FFFFFF;
        }
        QTableWidget::item {
            padding: 4px;
            color: #E0E0E0;
        }
        QHeaderView::section {
            background-color: #424242;
            color: #E0E0E0;
            padding: 6px;
            border: 1px solid #555555;
            font-weight: bold;
        }
        QPushButton {
            background-color: #42A5F5;
            color: #FFFFFF;
            border: none;
            padding: 6px 16px;
            border-radius: 4px;
            font-weight: bold;
        }
        QPushButton:hover {
            background-color: #1E88E5;
        }
        QPushButton:pressed {
            background-color: #1565C0;
        }
        QPushButton:disabled {
            background-color: #555555;
            color: #888888;
        }
        QLineEdit, QTextEdit, QSpinBox, QComboBox {
            background-color: #2B2B2B;
            color: #E0E0E0;
            border: 1px solid #555555;
            padding: 4px;
            border-radius: 3px;
        }
        QLineEdit:focus, QTextEdit:focus, QSpinBox:focus, QComboBox:focus {
            border: 2px solid #42A5F5;
        }
        QComboBox QAbstractItemView {
            background-color: #2B2B2B;
            color: #E0E0E0;
            selection-background-color: #42A5F5;
        }
        QMenuBar {
            background-color: #2B2B2B;
            color: #E0E0E0;
        }
        QMenuBar::item:selected {
            background-color: #424242;
        }
        QMenu {
            background-color: #2B2B2B;
            color: #E0E0E0;
            border: 1px solid #555555;
        }
        QMenu::item:selected {
            background-color: #42A5F5;
            color: #FFFFFF;
        }
        QStatusBar {
            background-color: #424242;
            color: #E0E0E0;
        }
        QLabel {
            color: #E0E0E0;
        }
    """
    
    @staticmethod
    def apply_theme(app: QApplication, theme_name: str = 'dark'):
        """Apply theme to the application
        
        Args:
            app: QApplication instance
            theme_name: 'light' or 'dark'
        """
        if theme_name == 'light':
            palette = ThemeManager._create_palette(ThemeManager.LIGHT_THEME)
            stylesheet = ThemeManager.LIGHT_STYLESHEET
        else:
            palette = ThemeManager._create_palette(ThemeManager.DARK_THEME)
            stylesheet = ThemeManager.DARK_STYLESHEET
        
        app.setPalette(palette)
        app.setStyleSheet(stylesheet)
        
        # Save preference
        settings = QSettings('FRVV', 'AthleteManager')
        settings.setValue('theme', theme_name)
    
    @staticmethod
    def _create_palette(theme_colors: dict) -> QPalette:
        """Create QPalette from theme colors dictionary"""
        palette = QPalette()
        
        color_roles = {
            'Window': QPalette.ColorRole.Window,
            'WindowText': QPalette.ColorRole.WindowText,
            'Base': QPalette.ColorRole.Base,
            'AlternateBase': QPalette.ColorRole.AlternateBase,
            'ToolTipBase': QPalette.ColorRole.ToolTipBase,
            'ToolTipText': QPalette.ColorRole.ToolTipText,
            'Text': QPalette.ColorRole.Text,
            'Button': QPalette.ColorRole.Button,
            'ButtonText': QPalette.ColorRole.ButtonText,
            'BrightText': QPalette.ColorRole.BrightText,
            'Link': QPalette.ColorRole.Link,
            'Highlight': QPalette.ColorRole.Highlight,
            'HighlightedText': QPalette.ColorRole.HighlightedText,
        }
        
        for name, color_hex in theme_colors.items():
            if name in color_roles:
                palette.setColor(color_roles[name], QColor(color_hex))
        
        return palette
    
    @staticmethod
    def get_saved_theme() -> str:
        """Get saved theme preference from settings
        
        Returns:
            'light' or 'dark' (default)
        """
        settings = QSettings('FRVV', 'AthleteManager')
        return settings.value('theme', 'dark')
