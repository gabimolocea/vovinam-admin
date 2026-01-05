"""
Dashboard widget with statistics and charts
"""
from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel, 
                              QFrame, QGridLayout, QScrollArea)
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFont, QPixmap
from models.db import Database
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
from matplotlib.backends.backend_qt5agg import FigureCanvasQTAgg as FigureCanvas
from matplotlib.figure import Figure
import io
from PIL import Image

class StatCard(QFrame):
    """Card widget for displaying a statistic"""
    def __init__(self, title: str, value: str, color: str = "#2196F3"):
        super().__init__()
        self.setFrameStyle(QFrame.Shape.Box | QFrame.Shadow.Raised)
        self.setLineWidth(2)
        
        layout = QVBoxLayout()
        
        # Title
        title_label = QLabel(title)
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        font = QFont()
        font.setPointSize(10)
        title_label.setFont(font)
        title_label.setStyleSheet(f"color: {color};")
        layout.addWidget(title_label)
        
        # Value
        value_label = QLabel(value)
        value_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        font.setPointSize(24)
        font.setBold(True)
        value_label.setFont(font)
        value_label.setStyleSheet(f"color: {color};")
        layout.addWidget(value_label)
        
        self.setLayout(layout)
        self.setMinimumHeight(120)
        self.setStyleSheet(f"""
            StatCard {{
                background-color: white;
                border: 2px solid {color};
                border-radius: 8px;
            }}
        """)


class DashboardWidget(QWidget):
    """Dashboard showing statistics and charts"""
    def __init__(self, db: Database):
        super().__init__()
        self.db = db
        self.setup_ui()
        self.load_data()
    
    def setup_ui(self):
        """Setup dashboard UI"""
        # Create scroll area for the entire dashboard
        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)
        scroll_area.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll_area.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        
        # Create content widget
        content_widget = QWidget()
        main_layout = QVBoxLayout(content_widget)
        main_layout.setSpacing(20)
        
        # Title
        title = QLabel("📊 Dashboard")
        font = QFont()
        font.setPointSize(18)
        font.setBold(True)
        title.setFont(font)
        main_layout.addWidget(title)
        
        # Stats cards
        self.stats_layout = QGridLayout()
        self.stats_layout.setSpacing(15)
        
        # Create stat cards
        self.total_athletes_card = StatCard("Total Athletes", "0", "#2196F3")
        self.total_clubs_card = StatCard("Total Clubs", "0", "#4CAF50")
        self.total_competitions_card = StatCard("Competitions", "0", "#FF9800")
        self.total_matches_card = StatCard("Matches", "0", "#9C27B0")
        
        self.stats_layout.addWidget(self.total_athletes_card, 0, 0)
        self.stats_layout.addWidget(self.total_clubs_card, 0, 1)
        self.stats_layout.addWidget(self.total_competitions_card, 0, 2)
        self.stats_layout.addWidget(self.total_matches_card, 0, 3)
        
        main_layout.addLayout(self.stats_layout)
        
        # Charts section
        charts_layout = QHBoxLayout()
        charts_layout.setSpacing(15)
        
        # Pie charts container
        self.grades_chart = QLabel()
        self.grades_chart.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.grades_chart.setMinimumSize(400, 350)
        charts_layout.addWidget(self.create_chart_container("Athletes by Grade", self.grades_chart))
        
        self.clubs_chart = QLabel()
        self.clubs_chart.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.clubs_chart.setMinimumSize(400, 350)
        charts_layout.addWidget(self.create_chart_container("Athletes by Club", self.clubs_chart))
        
        main_layout.addLayout(charts_layout)
        
        # Gender distribution
        gender_layout = QHBoxLayout()
        gender_layout.setSpacing(15)
        
        self.gender_chart = QLabel()
        self.gender_chart.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.gender_chart.setMinimumSize(400, 350)
        gender_layout.addWidget(self.create_chart_container("Gender Distribution", self.gender_chart))
        
        self.cities_chart = QLabel()
        self.cities_chart.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.cities_chart.setMinimumSize(400, 350)
        gender_layout.addWidget(self.create_chart_container("Top 10 Cities", self.cities_chart))
        
        main_layout.addLayout(gender_layout)
        
        # Breakdown sections (text lists)
        breakdown_layout = QHBoxLayout()
        breakdown_layout.setSpacing(15)
        
        # Athletes by Grade
        self.grades_widget = self.create_breakdown_widget("Grade Details")
        breakdown_layout.addWidget(self.grades_widget)
        
        # Athletes by Club
        self.clubs_widget = self.create_breakdown_widget("Club Details")
        breakdown_layout.addWidget(self.clubs_widget)
        
        # Athletes by City
        self.cities_widget = self.create_breakdown_widget("City Details")
        breakdown_layout.addWidget(self.cities_widget)
        
        main_layout.addLayout(breakdown_layout)
        
        main_layout.addStretch()
        
        # Set the content widget to the scroll area
        scroll_area.setWidget(content_widget)
        
        # Set the scroll area as the main widget layout
        wrapper_layout = QVBoxLayout()
        wrapper_layout.setContentsMargins(0, 0, 0, 0)
        wrapper_layout.addWidget(scroll_area)
        self.setLayout(wrapper_layout)
    
    def create_breakdown_widget(self, title: str) -> QFrame:
        """Create a breakdown widget"""
        frame = QFrame()
        frame.setFrameStyle(QFrame.Shape.Box | QFrame.Shadow.Raised)
        frame.setStyleSheet("""
            QFrame {
                background-color: white;
                border: 1px solid #ccc;
                border-radius: 8px;
                padding: 10px;
            }
        """)
        
        layout = QVBoxLayout()
        
        # Title
        title_label = QLabel(title)
        font = QFont()
        font.setPointSize(12)
        font.setBold(True)
        title_label.setFont(font)
        layout.addWidget(title_label)
        
        # Content scroll area
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setMaximumHeight(300)
        
        content = QWidget()
        content_layout = QVBoxLayout()
        content_layout.setSpacing(5)
        content.setLayout(content_layout)
        
        scroll.setWidget(content)
        layout.addWidget(scroll)
        
        frame.setLayout(layout)
        
        # Store reference to content layout for updates
        if "Grade" in title:
            self.grades_content_layout = content_layout
        elif "Club" in title:
            self.clubs_content_layout = content_layout
        elif "City" in title:
            self.cities_content_layout = content_layout
        
        return frame
    
    def create_chart_container(self, title: str, chart_label: QLabel) -> QFrame:
        """Create a container frame for a chart"""
        frame = QFrame()
        frame.setFrameStyle(QFrame.Shape.Box | QFrame.Shadow.Raised)
        frame.setStyleSheet("""
            QFrame {
                background-color: white;
                border: 1px solid #ccc;
                border-radius: 8px;
                padding: 10px;
            }
        """)
        
        layout = QVBoxLayout()
        
        # Title
        title_label = QLabel(title)
        font = QFont()
        font.setPointSize(12)
        font.setBold(True)
        title_label.setFont(font)
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(title_label)
        
        # Chart
        layout.addWidget(chart_label)
        
        frame.setLayout(layout)
        return frame
    
    def create_pie_chart(self, data: list, title: str, colors: list = None) -> QPixmap:
        """Create a pie chart from data"""
        if not data:
            # Create empty chart
            fig, ax = plt.subplots(figsize=(5, 4), facecolor='white')
            ax.text(0.5, 0.5, 'No data available', ha='center', va='center', fontsize=12, color='gray')
            ax.set_xlim(0, 1)
            ax.set_ylim(0, 1)
            ax.axis('off')
        else:
            labels = [str(row[0])[:20] for row in data[:8]]  # Top 8, truncate labels
            sizes = [row[1] for row in data[:8]]
            
            if colors is None:
                colors = plt.cm.Set3.colors[:len(labels)]
            
            fig, ax = plt.subplots(figsize=(5, 4), facecolor='white')
            wedges, texts, autotexts = ax.pie(
                sizes, 
                labels=labels, 
                autopct='%1.1f%%',
                colors=colors,
                startangle=90,
                textprops={'fontsize': 9}
            )
            
            # Make percentage text bold
            for autotext in autotexts:
                autotext.set_color('white')
                autotext.set_fontweight('bold')
            
            ax.axis('equal')
        
        # Convert to QPixmap
        buf = io.BytesIO()
        plt.tight_layout()
        plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
        buf.seek(0)
        plt.close(fig)
        
        # Load image and convert to QPixmap
        img = Image.open(buf)
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format='PNG')
        
        pixmap = QPixmap()
        pixmap.loadFromData(img_byte_arr.getvalue())
        return pixmap
    
    def create_bar_chart(self, data: list, title: str, color: str = '#2196F3') -> QPixmap:
        """Create a horizontal bar chart from data"""
        if not data:
            fig, ax = plt.subplots(figsize=(5, 4), facecolor='white')
            ax.text(0.5, 0.5, 'No data available', ha='center', va='center', fontsize=12, color='gray')
            ax.set_xlim(0, 1)
            ax.set_ylim(0, 1)
            ax.axis('off')
        else:
            labels = [str(row[0])[:25] for row in data[:10]]  # Top 10
            values = [row[1] for row in data[:10]]
            
            fig, ax = plt.subplots(figsize=(5, 4), facecolor='white')
            y_pos = range(len(labels))
            
            bars = ax.barh(y_pos, values, color=color, alpha=0.8)
            ax.set_yticks(y_pos)
            ax.set_yticklabels(labels, fontsize=9)
            ax.set_xlabel('Number of Athletes', fontsize=10)
            ax.invert_yaxis()  # Top to bottom
            
            # Add value labels on bars
            for i, (bar, value) in enumerate(zip(bars, values)):
                ax.text(value + max(values) * 0.01, i, str(value), 
                       va='center', fontsize=9, fontweight='bold')
            
            ax.spines['top'].set_visible(False)
            ax.spines['right'].set_visible(False)
        
        # Convert to QPixmap
        buf = io.BytesIO()
        plt.tight_layout()
        plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
        buf.seek(0)
        plt.close(fig)
        
        img = Image.open(buf)
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format='PNG')
        
        pixmap = QPixmap()
        pixmap.loadFromData(img_byte_arr.getvalue())
        return pixmap
    
    
    def load_data(self):
        """Load dashboard data"""
        conn = self.db.connect()
        cursor = conn.cursor()
        
        # Total athletes
        cursor.execute("SELECT COUNT(*) FROM athletes")
        total_athletes = cursor.fetchone()[0]
        self.update_card(self.total_athletes_card, str(total_athletes))
        
        # Total clubs
        cursor.execute("SELECT COUNT(*) FROM clubs")
        total_clubs = cursor.fetchone()[0]
        self.update_card(self.total_clubs_card, str(total_clubs))
        
        # Total competitions
        cursor.execute("SELECT COUNT(*) FROM competitions")
        total_competitions = cursor.fetchone()[0]
        self.update_card(self.total_competitions_card, str(total_competitions))
        
        # Total matches
        cursor.execute("SELECT COUNT(*) FROM matches")
        total_matches = cursor.fetchone()[0]
        self.update_card(self.total_matches_card, str(total_matches))
        
        # Athletes by grade
        cursor.execute("""
            SELECT current_grade_name, COUNT(*) as count
            FROM athletes
            WHERE current_grade_name IS NOT NULL AND current_grade_name != ''
            GROUP BY current_grade_name
            ORDER BY count DESC
        """)
        grades_data = cursor.fetchall()
        self.update_breakdown(self.grades_content_layout, grades_data, "#2196F3")
        
        # Create pie chart for grades
        grade_colors = ['#2196F3', '#4CAF50', '#FF9800', '#F44336', '#9C27B0', '#00BCD4', '#FFEB3B', '#795548']
        pixmap = self.create_pie_chart(grades_data, "Athletes by Grade", grade_colors)
        self.grades_chart.setPixmap(pixmap)
        
        # Athletes by club
        cursor.execute("""
            SELECT club_name, COUNT(*) as count
            FROM athletes
            WHERE club_name IS NOT NULL AND club_name != ''
            GROUP BY club_name
            ORDER BY count DESC
            LIMIT 10
        """)
        clubs_data = cursor.fetchall()
        self.update_breakdown(self.clubs_content_layout, clubs_data, "#4CAF50")
        
        # Create pie chart for clubs
        club_colors = ['#4CAF50', '#8BC34A', '#CDDC39', '#FFC107', '#FF9800', '#FF5722', '#795548', '#9E9E9E']
        pixmap = self.create_pie_chart(clubs_data, "Athletes by Club", club_colors)
        self.clubs_chart.setPixmap(pixmap)
        
        # Athletes by city
        cursor.execute("""
            SELECT team_place, COUNT(*) as count
            FROM athletes
            WHERE team_place IS NOT NULL AND team_place != ''
            GROUP BY team_place
            ORDER BY count DESC
            LIMIT 10
        """)
        cities_data = cursor.fetchall()
        self.update_breakdown(self.cities_content_layout, cities_data, "#FF9800")
        
        # Create bar chart for cities
        pixmap = self.create_bar_chart(cities_data, "Top 10 Cities", '#FF9800')
        self.cities_chart.setPixmap(pixmap)
        
        # Gender distribution
        cursor.execute("""
            SELECT gender, COUNT(*) as count
            FROM athletes
            WHERE gender IS NOT NULL AND gender != ''
            GROUP BY gender
            ORDER BY count DESC
        """)
        gender_data = cursor.fetchall()
        
        # Create pie chart for gender
        gender_colors = ['#2196F3', '#E91E63', '#9C27B0']
        pixmap = self.create_pie_chart(gender_data, "Gender Distribution", gender_colors)
        self.gender_chart.setPixmap(pixmap)
    
    def update_card(self, card: StatCard, value: str):
        """Update a stat card value"""
        # Find the value label (second child)
        layout = card.layout()
        value_label = layout.itemAt(1).widget()
        value_label.setText(value)
    
    def update_breakdown(self, layout: QVBoxLayout, data: list, color: str):
        """Update breakdown widget with data"""
        # Clear existing items
        while layout.count():
            item = layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        
        # Add new items
        if not data:
            label = QLabel("No data available")
            label.setStyleSheet("color: #999;")
            layout.addWidget(label)
            return
        
        max_count = max(row[1] for row in data) if data else 1
        
        for name, count in data:
            item_widget = QWidget()
            item_layout = QHBoxLayout()
            item_layout.setContentsMargins(0, 0, 0, 0)
            
            # Name
            name_label = QLabel(str(name)[:30])  # Truncate long names
            name_label.setMinimumWidth(150)
            item_layout.addWidget(name_label)
            
            # Progress bar
            progress = QFrame()
            progress.setFrameStyle(QFrame.Shape.Box)
            progress.setStyleSheet(f"""
                QFrame {{
                    background-color: {color};
                    border-radius: 3px;
                }}
            """)
            width = int((count / max_count) * 200) if max_count > 0 else 0
            progress.setFixedSize(width, 20)
            item_layout.addWidget(progress)
            
            # Count
            count_label = QLabel(str(count))
            count_label.setMinimumWidth(40)
            count_label.setAlignment(Qt.AlignmentFlag.AlignRight)
            font = QFont()
            font.setBold(True)
            count_label.setFont(font)
            item_layout.addWidget(count_label)
            
            item_layout.addStretch()
            item_widget.setLayout(item_layout)
            layout.addWidget(item_widget)
        
        layout.addStretch()
