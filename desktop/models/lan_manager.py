"""
LAN Manager for offline scoring by tatami/station
Manages multiple tatami stations with independent scoring sessions
"""
import sqlite3
from datetime import datetime
from typing import Optional, List, Dict
from dataclasses import dataclass
from enum import Enum


class TatamiType(Enum):
    """Types of tatami/scoring stations"""
    DEMONSTRATION = "demonstration"
    FIGHT = "fight"


@dataclass
class Tatami:
    """Represents a tatami/scoring station"""
    id: int
    name: str
    station_number: int
    type: TatamiType
    is_active: bool
    created_at: str
    
    
@dataclass
class ScoringSession:
    """Represents an active scoring session on a tatami"""
    id: int
    tatami_id: int
    category_id: int
    category_name: str
    category_type: str  # 'solo', 'team', or 'match'
    athlete1_id: Optional[int]
    athlete1_name: str
    athlete2_id: Optional[int]
    athlete2_name: Optional[str]
    status: str  # 'active', 'paused', 'completed'
    started_at: str
    completed_at: Optional[str]
    score_data: Dict
    

class LANManager:
    """Manages LAN-based tatami scoring"""
    
    def __init__(self, db_conn):
        self.db_conn = db_conn
        self.init_tables()
    
    def init_tables(self):
        """Initialize tatami and scoring session tables"""
        cursor = self.db_conn.cursor()
        
        # Tatami/Scoring Station Table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS tatamis (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                station_number INTEGER UNIQUE,
                type TEXT NOT NULL DEFAULT 'fight',
                is_active INTEGER DEFAULT 1,
                ip_address TEXT,
                port INTEGER DEFAULT 8765,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Scoring Sessions Table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS scoring_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tatami_id INTEGER NOT NULL,
                category_id INTEGER,
                category_name TEXT,
                category_type TEXT,
                athlete1_id INTEGER,
                athlete1_name TEXT,
                athlete2_id INTEGER,
                athlete2_name TEXT,
                match_id INTEGER,
                status TEXT DEFAULT 'active',
                started_at TEXT DEFAULT CURRENT_TIMESTAMP,
                completed_at TEXT,
                score_data TEXT,
                notes TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tatami_id) REFERENCES tatamis(id)
            )
        ''')
        
        # Score Submissions Table (for individual referee scores)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS score_submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                referee_id INTEGER,
                referee_name TEXT,
                score_data TEXT NOT NULL,
                submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES scoring_sessions(id)
            )
        ''')
        
        self.db_conn.commit()
    
    # === Tatami Management ===
    
    def create_tatami(self, name: str, station_number: int, tatami_type: str) -> int:
        """Create a new tatami/scoring station"""
        cursor = self.db_conn.cursor()
        
        cursor.execute('''
            INSERT INTO tatamis (name, station_number, type, is_active)
            VALUES (?, ?, ?, 1)
        ''', (name, station_number, tatami_type))
        
        self.db_conn.commit()
        return cursor.lastrowid
    
    def get_all_tatamis(self) -> List[Tatami]:
        """Get all tatami stations"""
        cursor = self.db_conn.cursor()
        cursor.execute('SELECT id, name, station_number, type, is_active, created_at FROM tatamis ORDER BY station_number')
        
        tatamis = []
        for row in cursor.fetchall():
            tatamis.append(Tatami(
                id=row[0],
                name=row[1],
                station_number=row[2],
                type=TatamiType(row[3]),
                is_active=bool(row[4]),
                created_at=row[5]
            ))
        
        return tatamis
    
    def get_tatami(self, tatami_id: int) -> Optional[Tatami]:
        """Get a specific tatami"""
        cursor = self.db_conn.cursor()
        cursor.execute('''
            SELECT id, name, station_number, type, is_active, created_at 
            FROM tatamis WHERE id = ?
        ''', (tatami_id,))
        
        row = cursor.fetchone()
        if row:
            return Tatami(
                id=row[0],
                name=row[1],
                station_number=row[2],
                type=TatamiType(row[3]),
                is_active=bool(row[4]),
                created_at=row[5]
            )
        return None
    
    def update_tatami(self, tatami_id: int, name: str = None, is_active: bool = None) -> bool:
        """Update a tatami configuration"""
        cursor = self.db_conn.cursor()
        
        updates = []
        params = []
        
        if name is not None:
            updates.append("name = ?")
            params.append(name)
        
        if is_active is not None:
            updates.append("is_active = ?")
            params.append(1 if is_active else 0)
        
        if not updates:
            return False
        
        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(tatami_id)
        
        cursor.execute(f'''
            UPDATE tatamis SET {', '.join(updates)}
            WHERE id = ?
        ''', params)
        
        self.db_conn.commit()
        return cursor.rowcount > 0
    
    def delete_tatami(self, tatami_id: int) -> bool:
        """Delete a tatami and its sessions"""
        cursor = self.db_conn.cursor()
        
        # Delete associated sessions
        cursor.execute('DELETE FROM scoring_sessions WHERE tatami_id = ?', (tatami_id,))
        
        # Delete tatami
        cursor.execute('DELETE FROM tatamis WHERE id = ?', (tatami_id,))
        
        self.db_conn.commit()
        return cursor.rowcount > 0
    
    # === Scoring Session Management ===
    
    def create_session(self, tatami_id: int, category_id: int, category_name: str,
                      category_type: str, athlete1_id: int, athlete1_name: str,
                      athlete2_id: Optional[int] = None, athlete2_name: Optional[str] = None,
                      match_id: Optional[int] = None) -> int:
        """Create a new scoring session on a tatami"""
        cursor = self.db_conn.cursor()
        
        cursor.execute('''
            INSERT INTO scoring_sessions 
            (tatami_id, category_id, category_name, category_type, 
             athlete1_id, athlete1_name, athlete2_id, athlete2_name, match_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (tatami_id, category_id, category_name, category_type,
              athlete1_id, athlete1_name, athlete2_id, athlete2_name, match_id))
        
        self.db_conn.commit()
        return cursor.lastrowid
    
    def get_active_sessions(self, tatami_id: Optional[int] = None) -> List[ScoringSession]:
        """Get all active scoring sessions"""
        cursor = self.db_conn.cursor()
        
        if tatami_id:
            cursor.execute('''
                SELECT id, tatami_id, category_id, category_name, category_type,
                       athlete1_id, athlete1_name, athlete2_id, athlete2_name,
                       status, started_at, completed_at, score_data
                FROM scoring_sessions
                WHERE tatami_id = ? AND status = 'active'
                ORDER BY started_at DESC
            ''', (tatami_id,))
        else:
            cursor.execute('''
                SELECT id, tatami_id, category_id, category_name, category_type,
                       athlete1_id, athlete1_name, athlete2_id, athlete2_name,
                       status, started_at, completed_at, score_data
                FROM scoring_sessions
                WHERE status = 'active'
                ORDER BY tatami_id, started_at DESC
            ''')
        
        sessions = []
        for row in cursor.fetchall():
            sessions.append(ScoringSession(
                id=row[0],
                tatami_id=row[1],
                category_id=row[2],
                category_name=row[3],
                category_type=row[4],
                athlete1_id=row[5],
                athlete1_name=row[6],
                athlete2_id=row[7],
                athlete2_name=row[8],
                status=row[9],
                started_at=row[10],
                completed_at=row[11],
                score_data=row[12] or '{}'
            ))
        
        return sessions
    
    def get_session(self, session_id: int) -> Optional[ScoringSession]:
        """Get a specific scoring session"""
        cursor = self.db_conn.cursor()
        cursor.execute('''
            SELECT id, tatami_id, category_id, category_name, category_type,
                   athlete1_id, athlete1_name, athlete2_id, athlete2_name,
                   status, started_at, completed_at, score_data
            FROM scoring_sessions WHERE id = ?
        ''', (session_id,))
        
        row = cursor.fetchone()
        if row:
            return ScoringSession(
                id=row[0],
                tatami_id=row[1],
                category_id=row[2],
                category_name=row[3],
                category_type=row[4],
                athlete1_id=row[5],
                athlete1_name=row[6],
                athlete2_id=row[7],
                athlete2_name=row[8],
                status=row[9],
                started_at=row[10],
                completed_at=row[11],
                score_data=row[12] or '{}'
            )
        return None
    
    def update_session_status(self, session_id: int, status: str) -> bool:
        """Update session status"""
        cursor = self.db_conn.cursor()
        
        completed_at = None
        if status == 'completed':
            completed_at = datetime.now().isoformat()
        
        cursor.execute('''
            UPDATE scoring_sessions 
            SET status = ?, completed_at = COALESCE(?, completed_at)
            WHERE id = ?
        ''', (status, completed_at, session_id))
        
        self.db_conn.commit()
        return cursor.rowcount > 0
    
    def update_session_scores(self, session_id: int, score_data: str) -> bool:
        """Update session score data"""
        cursor = self.db_conn.cursor()
        
        cursor.execute('''
            UPDATE scoring_sessions 
            SET score_data = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (score_data, session_id))
        
        self.db_conn.commit()
        return cursor.rowcount > 0
    
    def end_session(self, session_id: int) -> bool:
        """End a scoring session"""
        return self.update_session_status(session_id, 'completed')
    
    # === Score Submission Management ===
    
    def submit_referee_score(self, session_id: int, referee_id: int, 
                           referee_name: str, score_data: str) -> int:
        """Record a referee's score submission"""
        cursor = self.db_conn.cursor()
        
        cursor.execute('''
            INSERT INTO score_submissions 
            (session_id, referee_id, referee_name, score_data)
            VALUES (?, ?, ?, ?)
        ''', (session_id, referee_id, referee_name, score_data))
        
        self.db_conn.commit()
        return cursor.lastrowid
    
    def get_session_submissions(self, session_id: int) -> List[Dict]:
        """Get all referee submissions for a session"""
        cursor = self.db_conn.cursor()
        
        cursor.execute('''
            SELECT id, referee_id, referee_name, score_data, submitted_at
            FROM score_submissions
            WHERE session_id = ?
            ORDER BY submitted_at
        ''', (session_id,))
        
        submissions = []
        for row in cursor.fetchall():
            submissions.append({
                'id': row[0],
                'referee_id': row[1],
                'referee_name': row[2],
                'score_data': row[3],
                'submitted_at': row[4]
            })
        
        return submissions
