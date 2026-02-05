"""
Visual bracket display widget showing tournament bracket structure graphically
"""
from PyQt6.QtWidgets import QWidget, QScrollArea, QVBoxLayout
from PyQt6.QtCore import Qt, QRect, QSize
from PyQt6.QtGui import QPainter, QPen, QFont, QBrush, QColor
from models.db import Database


class MatchBox(QWidget):
    """Visual representation of a single match with professional styling"""
    
    WIDTH = 180
    HEIGHT = 75
    MARGIN = 20
    
    def __init__(self, position_data=None):
        super().__init__()
        self.setFixedSize(self.WIDTH, self.HEIGHT)
        self.position_data = position_data or {}
    
    def paintEvent(self, event):
        """Draw match box with competitors in professional style"""
        super().paintEvent(event)
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        
        # Get data
        athlete1 = self.position_data.get('athlete1_name', 'TBD')
        athlete2 = self.position_data.get('athlete2_name', 'TBD')
        winner = self.position_data.get('winner_name', '')
        status = self.position_data.get('status', 'pending')
        
        # Determine if match is completed
        is_completed = status == 'completed'
        
        # Draw outer border
        border_pen = QPen(QColor(100, 100, 100), 2)
        painter.setPen(border_pen)
        painter.drawRect(0, 0, self.WIDTH - 1, self.HEIGHT - 1)
        
        # Set font
        font_small = QFont()
        font_small.setPointSize(8)
        font_small.setBold(True)
        painter.setFont(font_small)
        
        # Draw competitor boxes
        box_height = 30
        box_y = 5
        text_margin = 5
        
        # Athlete 1 box
        athlete1_color = QColor(220, 220, 220)
        border_color = QColor(50, 50, 50)
        
        if winner == athlete1:
            # Winner gets gold background
            athlete1_color = QColor(255, 215, 0)  # Gold
            font_winner = QFont(font_small)
            font_winner.setBold(True)
            painter.setFont(font_winner)
        
        painter.fillRect(2, box_y, self.WIDTH - 4, box_height, athlete1_color)
        painter.setPen(QPen(border_color, 1))
        painter.drawRect(2, box_y, self.WIDTH - 4, box_height)
        
        # Draw athlete 1 name
        painter.setPen(Qt.PenStyle.SolidLine)
        painter.drawText(
            2 + text_margin,
            box_y + 2,
            self.WIDTH - 8 - text_margin,
            box_height - 4,
            Qt.TextFlag.AlignLeft | Qt.TextFlag.AlignVCenter,
            athlete1[:18]
        )
        
        # Athlete 2 box
        box_y = 40
        athlete2_color = QColor(220, 220, 220)
        
        if winner == athlete2:
            # Winner gets gold background
            athlete2_color = QColor(255, 215, 0)  # Gold
            font_winner = QFont(font_small)
            font_winner.setBold(True)
            painter.setFont(font_winner)
        else:
            painter.setFont(font_small)
        
        painter.fillRect(2, box_y, self.WIDTH - 4, box_height, athlete2_color)
        painter.setPen(QPen(border_color, 1))
        painter.drawRect(2, box_y, self.WIDTH - 4, box_height)
        
        # Draw athlete 2 name
        painter.drawText(
            2 + text_margin,
            box_y + 2,
            self.WIDTH - 8 - text_margin,
            box_height - 4,
            Qt.TextFlag.AlignLeft | Qt.TextFlag.AlignVCenter,
            athlete2[:18]
        )
    
    def update_position(self, position_data):
        """Update match data and redraw"""
        self.position_data = position_data
        self.update()


class AdvancedBracketCanvas(QWidget):
    """Canvas that draws the bracket with connecting lines - professional tournament style"""
    
    def __init__(self, db: Database):
        super().__init__()
        self.db = db
        self.bracket_id = None
        self.positions = []
        self.rounds = {}
        self.match_widgets = {}
        
        self.setStyleSheet("""
            QWidget {
                background-color: #f8f8f8;
            }
        """)
        
        self.match_box_width = 180
        self.match_box_height = 75
        self.round_spacing = 280  # Space between rounds
        self.vertical_spacing = 110  # Space between matches vertically
        self.top_margin = 40
        self.left_margin = 30
    
    def load_bracket(self, bracket_id):
        """Load bracket data and layout"""
        self.bracket_id = bracket_id
        self.positions = self.db.get_bracket_positions(bracket_id)
        
        # Clear existing
        for item in self.match_widgets.values():
            if isinstance(item, dict) and 'widget' in item:
                item['widget'].deleteLater()
            elif hasattr(item, 'deleteLater'):
                item.deleteLater()
        self.match_widgets.clear()
        self.rounds.clear()
        
        if not self.positions:
            return
        
        # Organize by round
        for pos in self.positions:
            round_num = pos.get('round', 1)
            if round_num not in self.rounds:
                self.rounds[round_num] = []
            self.rounds[round_num].append(pos)
        
        # Sort positions in each round
        for round_num in self.rounds:
            self.rounds[round_num].sort(key=lambda p: p.get('position_number', 0))
        
        # Calculate canvas size based on bracket structure
        num_rounds = len(self.rounds)
        max_matches = max(len(m) for m in self.rounds.values()) if self.rounds else 1
        
        width = num_rounds * self.round_spacing + self.left_margin + 100
        height = max_matches * self.vertical_spacing + self.top_margin + 60
        
        self.setFixedSize(width, height)
        
        # Create match widgets at calculated positions
        round_list = sorted(self.rounds.keys())
        
        for round_idx, round_num in enumerate(round_list):
            matches = self.rounds[round_num]
            
            # Calculate x position for this round
            x = self.left_margin + round_idx * self.round_spacing
            
            # Calculate starting y position to center matches vertically
            total_height = len(matches) * self.vertical_spacing
            start_y = (height - total_height) // 2
            
            for match_idx, pos in enumerate(matches):
                y = start_y + match_idx * self.vertical_spacing
                
                # Create match box
                box = MatchBox(pos)
                box.setParent(self)
                box.move(x, y)
                
                pos_id = pos.get('id')
                self.match_widgets[pos_id] = {
                    'widget': box,
                    'pos': (x, y),
                    'data': pos,
                    'round': round_num,
                    'match_idx': match_idx
                }
    
    def paintEvent(self, event):
        """Draw bracket lines connecting matches"""
        super().paintEvent(event)
        
        if not self.match_widgets or not self.rounds:
            return
        
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        
        # Draw connecting lines
        pen = QPen(QColor(150, 150, 150), 2)
        painter.setPen(pen)
        
        # Group matches by round
        round_list = sorted(self.rounds.keys())
        
        # Draw lines from each round to the next
        for i in range(len(round_list) - 1):
            current_round = round_list[i]
            next_round = round_list[i + 1]
            
            # Get matches in current and next round
            current_matches = [m for m in self.match_widgets.values() if m['round'] == current_round]
            next_matches = [m for m in self.match_widgets.values() if m['round'] == next_round]
            
            # Sort by match index
            current_matches.sort(key=lambda m: m['match_idx'])
            next_matches.sort(key=lambda m: m['match_idx'])
            
            # Draw connecting lines
            for next_idx, next_match in enumerate(next_matches):
                # Get the two previous matches that feed into this one
                prev_idx1 = next_idx * 2
                prev_idx2 = next_idx * 2 + 1
                
                # Get positions for connection points
                next_x, next_y = next_match['pos']
                next_center_y = next_y + MatchBox.HEIGHT // 2
                
                # Draw lines from previous matches
                if prev_idx1 < len(current_matches):
                    prev_match = current_matches[prev_idx1]
                    prev_x, prev_y = prev_match['pos']
                    prev_center_y = prev_y + MatchBox.HEIGHT // 2
                    
                    # Draw line: right of previous match -> center -> left of next match
                    mid_x = prev_x + MatchBox.WIDTH + (next_x - prev_x - MatchBox.WIDTH) // 2
                    
                    painter.drawLine(int(prev_x + MatchBox.WIDTH), int(prev_center_y), int(mid_x), int(prev_center_y))
                    if prev_idx2 < len(current_matches):
                        prev_match2 = current_matches[prev_idx2]
                        prev_x2, prev_y2 = prev_match2['pos']
                        prev_center_y2 = prev_y2 + MatchBox.HEIGHT // 2
                        painter.drawLine(int(mid_x), int(prev_center_y), int(mid_x), int(prev_center_y2))
                        painter.drawLine(int(mid_x), int(prev_center_y2), int(next_x), int(next_center_y))
                    else:
                        painter.drawLine(int(mid_x), int(prev_center_y), int(mid_x), int(next_center_y))
                        painter.drawLine(int(mid_x), int(next_center_y), int(next_x), int(next_center_y))
    
    def update_match(self, position_id, position_data):
        """Update a single match display"""
        if position_id in self.match_widgets:
            self.match_widgets[position_id]['widget'].update_position(position_data)

