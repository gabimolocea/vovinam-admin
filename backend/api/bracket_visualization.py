"""
Bracket Visualization for Django Admin
Displays tournament brackets for solo and team categories
"""
from django.utils.html import format_html, mark_safe
from django.db.models import Q, Count
import json


class BracketVisualizer:
    """
    Generates HTML visualization of tournament brackets for admin display
    """
    
    def __init__(self, category):
        self.category = category
        self.matches = category.matches.select_related(
            'red_corner', 'blue_corner'
        ).order_by('match_type', 'match_number')
    
    def get_bracket_html(self):
        """Generate bracket visualization HTML"""
        if not self.matches.exists():
            return format_html(
                '<div style="padding: 20px; background: #f0f0f0; border-radius: 4px;">'
                '<p style="margin: 0; color: #666;">No matches scheduled yet</p>'
                '</div>'
            )
        
        rounds = self._organize_by_round()
        html = self._render_bracket(rounds)
        return mark_safe(html)
    
    def _organize_by_round(self):
        """Organize matches by round (using match_type)"""
        rounds = {
            'qualifications': [],
            'semi-finals': [],
            'finals': []
        }
        for match in self.matches:
            match_type = match.match_type or 'qualifications'
            if match_type not in rounds:
                rounds[match_type] = []
            rounds[match_type].append(match)
        # Only return rounds that have matches
        return {k: v for k, v in rounds.items() if v}
    
    def _render_bracket(self, rounds):
        """Render bracket HTML"""
        html = '<div class="bracket-container" style="overflow-x: auto; padding: 20px 0;">'
        html += '<style>.bracket-round { display: inline-block; margin-right: 40px; vertical-align: top; }'
        html += '.bracket-match { margin-bottom: 20px; border: 1px solid #ddd; border-radius: 4px; background: white; width: 280px; }'
        html += '.match-competitor { padding: 10px; border-bottom: 1px solid #eee; }'
        html += '.match-competitor:last-child { border-bottom: none; }'
        html += '.match-competitor.winner { background: #d4edda; font-weight: bold; }'
        html += '.match-status { padding: 8px 10px; background: #f8f9fa; font-size: 12px; color: #666; }'
        html += '.match-round-title { font-weight: bold; color: #333; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #007bff; text-transform: capitalize; }'
        html += '</style>'
        
        # Order of rounds
        round_order = ['qualifications', 'semi-finals', 'finals']
        
        for round_name in round_order:
            if round_name not in rounds:
                continue
            
            html += '<div class="bracket-round">'
            # Format round name nicely
            display_name = round_name.replace('-', ' ').title()
            html += f'<div class="match-round-title">{display_name}</div>'
            
            for match in rounds[round_name]:
                html += self._render_match(match)
            
            html += '</div>'
        
        html += '</div>'
        return html
    
    def _render_match(self, match):
        """Render individual match"""
        html = '<div class="bracket-match">'
        
        # Competitor 1 (Red Corner)
        c1_name = self._get_competitor_name(match.red_corner, match)
        c1_class = 'winner' if match.winner and match.winner.id == match.red_corner.id else ''
        html += f'<div class="match-competitor {c1_class}">{c1_name}</div>'
        
        # Competitor 2 (Blue Corner)
        if match.blue_corner:
            c2_name = self._get_competitor_name(match.blue_corner, match)
            c2_class = 'winner' if match.winner and match.winner.id == match.blue_corner.id else ''
            html += f'<div class="match-competitor {c2_class}">{c2_name}</div>'
        else:
            html += '<div class="match-competitor" style="color: #ccc;">TBD</div>'
        
        # Status
        status = match.get_status_display() if hasattr(match, 'get_status_display') else match.status
        html += f'<div class="match-status">{status}'
        
        if match.winner:
            winner_name = self._get_competitor_name(match.winner, match)
            html += f' | Winner: {winner_name}'
        
        html += '</div></div>'
        
        return html
    
    def _get_competitor_name(self, competitor, match):
        """Get display name for competitor"""
        if not competitor:
            return '—'
        
        # Handle Athlete
        if hasattr(competitor, 'first_name'):
            return f"{competitor.first_name} {competitor.last_name}"
        
        # Handle Team
        if hasattr(competitor, 'team_name'):
            return competitor.team_name
        
        return str(competitor)


def get_bracket_visualization(category):
    """
    Helper function to get bracket visualization HTML
    Usage in admin: get_bracket_visualization.short_description = "Bracket"
    """
    visualizer = BracketVisualizer(category)
    return visualizer.get_bracket_html()


def bracket_visualization_readonly_field(self, obj):
    """
    Admin method for displaying bracket visualization
    Add to ModelAdmin.readonly_fields and to fields/fieldsets
    
    Usage:
        class CategoryAdmin(admin.ModelAdmin):
            readonly_fields = ['bracket_display']
            fields = ['name', 'bracket_display']
            
            def bracket_display(self, obj):
                return bracket_visualization_readonly_field(self, obj)
            bracket_display.short_description = "Tournament Bracket"
    """
    if not obj:
        return format_html(
            '<div style="padding: 20px; background: #f0f0f0; border-radius: 4px;">'
            '<p style="margin: 0; color: #999;">Save the category first to view bracket</p>'
            '</div>'
        )
    
    visualizer = BracketVisualizer(obj)
    return visualizer.get_bracket_html()


class BracketStats:
    """Get statistics about a bracket"""
    
    @staticmethod
    def get_stats(category):
        """Get bracket statistics"""
        matches = category.matches.all()
        completed = matches.filter(status='completed').count()
        scheduled = matches.filter(status='scheduled').count()
        in_progress = matches.filter(status='in_progress').count()
        
        return {
            'total_matches': matches.count(),
            'completed': completed,
            'scheduled': scheduled,
            'in_progress': in_progress,
            'completion_percentage': int((completed / matches.count() * 100) if matches.count() > 0 else 0),
        }
    
    @staticmethod
    def get_stats_display(category):
        """Get HTML display of bracket stats"""
        stats = BracketStats.get_stats(category)
        
        html = (
            f'<div style="padding: 15px; background: #f8f9fa; border-radius: 4px;">'
            f'  <strong>Bracket Progress</strong><br>'
            f'  <div style="margin-top: 10px;">'
            f'    Total Matches: <strong>{stats["total_matches"]}</strong><br>'
            f'    Completed: <strong style="color: #28a745;">{stats["completed"]}</strong><br>'
            f'    In Progress: <strong style="color: #ffc107;">{stats["in_progress"]}</strong><br>'
            f'    Scheduled: <strong style="color: #007bff;">{stats["scheduled"]}</strong><br>'
            f'    <div style="margin-top: 10px; background: #ddd; height: 20px; border-radius: 4px; overflow: hidden;">'
            f'      <div style="background: #28a745; height: 100%; width: {stats["completion_percentage"]}%; transition: width 0.3s;">'
            f'      </div>'
            f'    </div>'
            f'    <small style="color: #666;">{stats["completion_percentage"]}% Complete</small>'
            f'  </div>'
            f'</div>'
        )
        
        return mark_safe(html)
