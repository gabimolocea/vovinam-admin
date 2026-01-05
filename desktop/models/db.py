"""
Local SQLite database for offline athlete data
Mirrors backend Django models structure
"""
import sqlite3
from datetime import datetime
from typing import Optional, List, Dict
import config

class Database:
    def __init__(self, db_path: str = None):
        self.db_path = db_path or str(config.DB_PATH)
        self.connection = None
        self.init_db()
    
    def connect(self):
        """Create database connection"""
        if not self.connection:
            self.connection = sqlite3.connect(self.db_path)
            self.connection.row_factory = sqlite3.Row
        return self.connection
    
    def close(self):
        """Close database connection"""
        if self.connection:
            self.connection.close()
            self.connection = None
    
    def init_db(self):
        """Initialize database schema"""
        conn = self.connect()
        cursor = conn.cursor()
        
        # Athletes table (mirrors backend Athlete model)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS athletes (
                id INTEGER PRIMARY KEY,
                server_id INTEGER UNIQUE,
                user_id INTEGER,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                date_of_birth TEXT,
                team_place TEXT,
                address TEXT,
                mobile_number TEXT,
                emergency_contact_name TEXT,
                emergency_contact_phone TEXT,
                previous_experience TEXT,
                club_id INTEGER,
                club_name TEXT,
                city_id INTEGER,
                city_name TEXT,
                current_grade_id INTEGER,
                current_grade_name TEXT,
                federation_role_id INTEGER,
                title_id INTEGER,
                registered_date TEXT,
                expiration_date TEXT,
                is_coach INTEGER DEFAULT 0,
                is_referee INTEGER DEFAULT 0,
                profile_image TEXT,
                medical_certificate TEXT,
                status TEXT DEFAULT 'pending',
                submitted_date TEXT,
                reviewed_date TEXT,
                reviewed_by_id INTEGER,
                admin_notes TEXT,
                approved_date TEXT,
                approved_by_id INTEGER,
                
                -- Sync fields
                version INTEGER DEFAULT 1,
                sync_hash TEXT,
                last_synced_at TEXT,
                created_offline INTEGER DEFAULT 0,
                temp_id TEXT,
                is_synced INTEGER DEFAULT 0,
                
                -- Timestamps
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                
                -- Soft delete
                is_deleted INTEGER DEFAULT 0,
                deleted_at TEXT
            )
        ''')
        
        # Add missing columns to existing athletes table (migration)
        self._migrate_athletes_table(cursor)
        
        # Add central_referee to matches table (migration)
        try:
            cursor.execute("ALTER TABLE matches ADD COLUMN central_referee TEXT")
            conn.commit()
        except:
            pass  # Column already exists
        
        # Add is_synced to matches table (migration)
        try:
            cursor.execute("ALTER TABLE matches ADD COLUMN is_synced INTEGER DEFAULT 1")
            conn.commit()
        except:
            pass  # Column already exists
        
        # Add missing columns to reference tables (migration)
        self._migrate_reference_tables(cursor)
        
        # Clubs reference table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS clubs (
                id INTEGER PRIMARY KEY,
                server_id INTEGER UNIQUE,
                name TEXT NOT NULL UNIQUE,
                logo TEXT,
                city_id INTEGER,
                city_name TEXT,
                address TEXT,
                mobile_number TEXT,
                website TEXT,
                created TEXT,
                modified TEXT,
                last_synced_at TEXT
            )
        ''')
        
        # Cities reference table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS cities (
                id INTEGER PRIMARY KEY,
                server_id INTEGER UNIQUE,
                name TEXT NOT NULL,
                last_synced_at TEXT
            )
        ''')
        
        # Grades reference table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS grades (
                id INTEGER PRIMARY KEY,
                server_id INTEGER UNIQUE,
                name TEXT NOT NULL,
                rank_order INTEGER DEFAULT 0,
                grade_type TEXT DEFAULT 'inferior',
                image TEXT,
                created TEXT,
                modified TEXT,
                last_synced_at TEXT
            )
        ''')
        
        # Sync log
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS sync_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sync_type TEXT,
                direction TEXT,
                records_count INTEGER,
                success INTEGER,
                error_message TEXT,
                synced_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Pending deletions to sync to server
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS pending_deletions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_type TEXT NOT NULL,
                server_id INTEGER NOT NULL,
                entity_name TEXT,
                deleted_at TEXT DEFAULT CURRENT_TIMESTAMP,
                synced INTEGER DEFAULT 0
            )
        ''')
        
        # Competitions table (from landing.Event)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS competitions (
                id INTEGER PRIMARY KEY,
                server_id INTEGER UNIQUE,
                title TEXT NOT NULL,
                description TEXT,
                start_date TEXT,
                end_date TEXT,
                address TEXT,
                city_id INTEGER,
                city_name TEXT,
                event_type TEXT DEFAULT 'competition',
                is_featured INTEGER DEFAULT 0,
                
                -- Sync fields
                last_synced_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Categories table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY,
                server_id INTEGER UNIQUE,
                competition_id INTEGER,
                competition_title TEXT,
                name TEXT NOT NULL,
                gender TEXT,
                min_age INTEGER,
                max_age INTEGER,
                min_weight REAL,
                max_weight REAL,
                category_type TEXT,
                is_team_category INTEGER DEFAULT 0,
                
                -- Sync fields
                last_synced_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Matches table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS matches (
                id INTEGER PRIMARY KEY,
                server_id INTEGER UNIQUE,
                category_id INTEGER,
                category_name TEXT,
                match_number INTEGER,
                round TEXT,
                athlete1_id INTEGER,
                athlete1_name TEXT,
                athlete2_id INTEGER,
                athlete2_name TEXT,
                winner_id INTEGER,
                winner_name TEXT,
                central_referee TEXT,
                status TEXT DEFAULT 'scheduled',
                scheduled_time TEXT,
                
                -- Sync fields
                is_synced INTEGER DEFAULT 1,
                last_synced_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Match referees table (many-to-many)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS match_referees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                match_id INTEGER NOT NULL,
                referee_name TEXT NOT NULL,
                
                FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
            )
        ''')
        
        # Referee scores table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS referee_scores (
                id INTEGER PRIMARY KEY,
                server_id INTEGER UNIQUE,
                match_id INTEGER NOT NULL,
                referee_id INTEGER,
                referee_name TEXT,
                red_corner_score INTEGER DEFAULT 0,
                blue_corner_score INTEGER DEFAULT 0,
                winner TEXT,
                rounds TEXT,  -- JSON string storing round-by-round scores
                
                -- Sync fields
                last_synced_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
            )
        ''')
        
        # Add rounds column to existing referee_scores table if it doesn't exist
        try:
            cursor.execute("ALTER TABLE referee_scores ADD COLUMN rounds TEXT")
            conn.commit()
        except:
            pass  # Column already exists
        
        # Grade History table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS grade_history (
                id INTEGER PRIMARY KEY,
                server_id INTEGER UNIQUE,
                athlete_id INTEGER NOT NULL,
                athlete_name TEXT,
                grade_id INTEGER NOT NULL,
                grade_name TEXT,
                obtained_date TEXT,
                level TEXT DEFAULT 'good',
                event_id INTEGER,
                event_name TEXT,
                examiner_1_id INTEGER,
                examiner_1_name TEXT,
                examiner_2_id INTEGER,
                examiner_2_name TEXT,
                submitted_by_athlete INTEGER DEFAULT 0,
                certificate_image TEXT,
                result_document TEXT,
                notes TEXT,
                status TEXT DEFAULT 'approved',
                submitted_date TEXT,
                reviewed_date TEXT,
                reviewed_by_id INTEGER,
                admin_notes TEXT,
                
                -- Sync fields
                last_synced_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE
            )
        ''')
        
        # Visas table (unified - both medical and annual)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS visas (
                id INTEGER PRIMARY KEY,
                server_id INTEGER UNIQUE,
                athlete_id INTEGER NOT NULL,
                athlete_name TEXT,
                visa_type TEXT NOT NULL,  -- 'medical' or 'annual'
                issued_date TEXT NOT NULL,
                expiration_date TEXT,
                health_status TEXT,
                visa_status TEXT,
                is_valid INTEGER DEFAULT 0,
                status TEXT DEFAULT 'pending',
                submitted_date TEXT,
                reviewed_date TEXT,
                reviewed_by_id INTEGER,
                admin_notes TEXT,
                document TEXT,
                image TEXT,
                
                -- Sync fields
                last_synced_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE
            )
        ''')
        
        # Athlete Competition Results table (CategoryAthleteScore)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS athlete_results (
                id INTEGER PRIMARY KEY,
                server_id INTEGER UNIQUE,
                athlete_id INTEGER NOT NULL,
                athlete_name TEXT,
                category_id INTEGER NOT NULL,
                category_name TEXT,
                event_id INTEGER,
                event_title TEXT,
                score REAL DEFAULT 0,
                rank INTEGER,
                result_type TEXT,  -- 'individual' or 'team'
                status TEXT DEFAULT 'pending',
                submitted_date TEXT,
                reviewed_date TEXT,
                reviewed_by_id INTEGER,
                admin_notes TEXT,
                
                -- Sync fields
                last_synced_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE
            )
        ''')
        
        conn.commit()
    
    def _migrate_athletes_table(self, cursor):
        """Add missing columns to existing athletes table"""
        # Get existing columns
        cursor.execute("PRAGMA table_info(athletes)")
        existing_columns = {row[1] for row in cursor.fetchall()}
        
        # Add missing columns to match backend Athlete model
        migrations = [
            ('user_id', 'INTEGER'),
            ('team_place', 'TEXT'),
            ('previous_experience', 'TEXT'),
            ('federation_role_id', 'INTEGER'),
            ('title_id', 'INTEGER'),
            ('profile_image', 'TEXT'),
            ('medical_certificate', 'TEXT'),
            ('submitted_date', 'TEXT'),
            ('reviewed_date', 'TEXT'),
            ('reviewed_by_id', 'INTEGER'),
            ('admin_notes', 'TEXT'),
            ('approved_date', 'TEXT'),
            ('approved_by_id', 'INTEGER')
        ]
        
        for column_name, column_type in migrations:
            if column_name not in existing_columns:
                try:
                    cursor.execute(f"ALTER TABLE athletes ADD COLUMN {column_name} {column_type}")
                    print(f"Added column {column_name} to athletes table")
                except Exception as e:
                    print(f"Error adding column {column_name}: {e}")
    
    def _migrate_reference_tables(self, cursor):
        """Add missing columns to clubs and grades tables"""
        # Migrate clubs table
        cursor.execute("PRAGMA table_info(clubs)")
        existing_columns = {row[1] for row in cursor.fetchall()}
        
        club_migrations = [
            ('logo', 'TEXT'),
            ('city_id', 'INTEGER'),
            ('city_name', 'TEXT'),
            ('address', 'TEXT'),
            ('mobile_number', 'TEXT'),
            ('website', 'TEXT'),
            ('created', 'TEXT'),
            ('modified', 'TEXT')
        ]
        
        for column_name, column_type in club_migrations:
            if column_name not in existing_columns:
                try:
                    cursor.execute(f"ALTER TABLE clubs ADD COLUMN {column_name} {column_type}")
                    print(f"Added column {column_name} to clubs table")
                except Exception as e:
                    print(f"Error adding column {column_name} to clubs: {e}")
        
        # Migrate grades table
        cursor.execute("PRAGMA table_info(grades)")
        existing_columns = {row[1] for row in cursor.fetchall()}
        
        grade_migrations = [
            ('grade_type', 'TEXT DEFAULT "inferior"'),
            ('image', 'TEXT'),
            ('created', 'TEXT'),
            ('modified', 'TEXT')
        ]
        
        for column_name, column_type in grade_migrations:
            if column_name not in existing_columns:
                try:
                    cursor.execute(f"ALTER TABLE grades ADD COLUMN {column_name} {column_type}")
                    print(f"Added column {column_name} to grades table")
                except Exception as e:
                    print(f"Error adding column {column_name} to grades: {e}")
    
    def get_all_athletes(self, include_deleted: bool = False) -> List[Dict]:
        """Retrieve all athletes"""
        conn = self.connect()
        cursor = conn.cursor()
        
        query = "SELECT * FROM athletes"
        if not include_deleted:
            query += " WHERE is_deleted = 0"
        query += " ORDER BY last_name, first_name"
        
        cursor.execute(query)
        return [dict(row) for row in cursor.fetchall()]
    
    def get_athlete_by_id(self, athlete_id: int) -> Optional[Dict]:
        """Get single athlete by local ID"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM athletes WHERE id = ?", (athlete_id,))
        row = cursor.fetchone()
        return dict(row) if row else None
    
    def insert_athlete(self, athlete_data: Dict) -> int:
        """Insert new athlete record"""
        conn = self.connect()
        cursor = conn.cursor()
        
        fields = list(athlete_data.keys())
        placeholders = ','.join(['?' for _ in fields])
        values = [athlete_data[f] for f in fields]
        
        query = f"INSERT INTO athletes ({','.join(fields)}) VALUES ({placeholders})"
        cursor.execute(query, values)
        conn.commit()
        
        return cursor.lastrowid
    
    def update_athlete(self, athlete_id: int, athlete_data: Dict) -> bool:
        """Update existing athlete"""
        conn = self.connect()
        cursor = conn.cursor()
        
        athlete_data['updated_at'] = datetime.now().isoformat()
        # Mark as unsynced when updated locally
        athlete_data['is_synced'] = 0
        
        set_clause = ','.join([f"{k} = ?" for k in athlete_data.keys()])
        values = list(athlete_data.values()) + [athlete_id]
        
        query = f"UPDATE athletes SET {set_clause} WHERE id = ?"
        cursor.execute(query, values)
        conn.commit()
        
        return cursor.rowcount > 0
    
    def soft_delete_athlete(self, athlete_id: int) -> bool:
        """Soft delete athlete"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE athletes SET is_deleted = 1, deleted_at = ? WHERE id = ?",
            (datetime.now().isoformat(), athlete_id)
        )
        conn.commit()
        return cursor.rowcount > 0
    
    def get_reference_data(self, table: str) -> List[Dict]:
        """Get reference data (clubs, cities, grades)"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute(f"SELECT * FROM {table} ORDER BY name")
        return [dict(row) for row in cursor.fetchall()]
    
    def upsert_reference_data(self, table: str, data: List[Dict]):
        """Insert or update reference data"""
        conn = self.connect()
        cursor = conn.cursor()
        
        for item in data:
            cursor.execute(
                f"INSERT OR REPLACE INTO {table} (server_id, name, last_synced_at) VALUES (?, ?, ?)",
                (item.get('id'), item.get('name'), datetime.now().isoformat())
            )
        
        conn.commit()
    
    def log_sync(self, sync_type: str, direction: str, records_count: int, success: bool, error: str = None):
        """Log sync operation"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO sync_log (sync_type, direction, records_count, success, error_message) VALUES (?, ?, ?, ?, ?)",
            (sync_type, direction, records_count, 1 if success else 0, error)
        )
        conn.commit()
    
    def get_unsynced_athletes(self) -> List[Dict]:
        """Get athletes that haven't been synced to server"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM athletes WHERE is_synced = 0 AND is_deleted = 0"
        )
        return [dict(row) for row in cursor.fetchall()]
    
    def get_unsynced_competitions(self) -> List[Dict]:
        """Get competitions that haven't been synced to server"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM competitions WHERE server_id IS NULL"
        )
        return [dict(row) for row in cursor.fetchall()]
    
    def get_unsynced_categories(self) -> List[Dict]:
        """Get categories that haven't been synced to server"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM categories WHERE server_id IS NULL"
        )
        return [dict(row) for row in cursor.fetchall()]
    
    def get_unsynced_grades(self) -> List[Dict]:
        """Get grades that haven't been synced to server"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM grades WHERE server_id IS NULL"
        )
        return [dict(row) for row in cursor.fetchall()]
    
    def get_unsynced_clubs(self) -> List[Dict]:
        """Get clubs that haven't been synced to server"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM clubs WHERE server_id IS NULL"
        )
        return [dict(row) for row in cursor.fetchall()]
    
    def get_pending_deletions(self) -> List[Dict]:
        """Get deletions that need to be synced to server"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM pending_deletions WHERE synced = 0 ORDER BY deleted_at"
        )
        return [dict(row) for row in cursor.fetchall()]
    
    def mark_deletion_synced(self, deletion_id: int) -> bool:
        """Mark a deletion as synced"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE pending_deletions SET synced = 1 WHERE id = ?",
            (deletion_id,)
        )
        conn.commit()
        return True
    
    # Reference data methods
    def get_all_clubs(self) -> List[Dict]:
        """Retrieve all clubs"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM clubs ORDER BY name")
        return [dict(row) for row in cursor.fetchall()]
    
    def get_all_cities(self) -> List[Dict]:
        """Retrieve all cities"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM cities ORDER BY name")
        return [dict(row) for row in cursor.fetchall()]
    
    def get_all_grades(self) -> List[Dict]:
        """Retrieve all grades"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM grades ORDER BY rank_order")
        return [dict(row) for row in cursor.fetchall()]
    
    def insert_club(self, club_data: Dict) -> int:
        """Insert new club"""
        conn = self.connect()
        cursor = conn.cursor()
        
        fields = list(club_data.keys())
        placeholders = ','.join(['?' for _ in fields])
        values = [club_data[f] for f in fields]
        
        query = f"INSERT INTO clubs ({','.join(fields)}) VALUES ({placeholders})"
        cursor.execute(query, values)
        conn.commit()
        return cursor.lastrowid
    
    def update_club(self, club_id: int, club_data: Dict) -> bool:
        """Update existing club"""
        conn = self.connect()
        cursor = conn.cursor()
        
        set_clause = ','.join([f"{k} = ?" for k in club_data.keys()])
        values = list(club_data.values()) + [club_id]
        
        query = f"UPDATE clubs SET {set_clause} WHERE id = ?"
        cursor.execute(query, values)
        conn.commit()
        return cursor.rowcount > 0
    
    def insert_grade(self, grade_data: Dict) -> int:
        """Insert new grade"""
        conn = self.connect()
        cursor = conn.cursor()
        
        fields = list(grade_data.keys())
        placeholders = ','.join(['?' for _ in fields])
        values = [grade_data[f] for f in fields]
        
        query = f"INSERT INTO grades ({','.join(fields)}) VALUES ({placeholders})"
        cursor.execute(query, values)
        conn.commit()
        return cursor.lastrowid
    
    def update_grade(self, grade_id: int, grade_data: Dict) -> bool:
        """Update existing grade"""
        conn = self.connect()
        cursor = conn.cursor()
        
        set_clause = ','.join([f"{k} = ?" for k in grade_data.keys()])
        values = list(grade_data.values()) + [grade_id]
        
        query = f"UPDATE grades SET {set_clause} WHERE id = ?"
        cursor.execute(query, values)
        conn.commit()
        return cursor.rowcount > 0
    
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM grades ORDER BY rank_order")
        return [dict(row) for row in cursor.fetchall()]
    
    # Competition methods
    def get_all_competitions(self) -> List[Dict]:
        """Retrieve all competitions"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM competitions ORDER BY start_date DESC")
        return [dict(row) for row in cursor.fetchall()]
    
    def insert_competition(self, comp_data: Dict) -> int:
        """Insert new competition"""
        conn = self.connect()
        cursor = conn.cursor()
        
        fields = list(comp_data.keys())
        placeholders = ','.join(['?' for _ in fields])
        values = [comp_data[f] for f in fields]
        
        query = f"INSERT INTO competitions ({','.join(fields)}) VALUES ({placeholders})"
        cursor.execute(query, values)
        conn.commit()
        return cursor.lastrowid
    
    def update_competition(self, comp_id: int, comp_data: Dict) -> bool:
        """Update existing competition"""
        conn = self.connect()
        cursor = conn.cursor()
        
        set_clause = ','.join([f"{k} = ?" for k in comp_data.keys()])
        values = list(comp_data.values()) + [comp_id]
        
        query = f"UPDATE competitions SET {set_clause} WHERE id = ?"
        cursor.execute(query, values)
        conn.commit()
        return cursor.rowcount > 0
    
    # Category methods
    def get_categories_by_competition(self, competition_id: int) -> List[Dict]:
        """Get categories for a specific competition"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM categories WHERE competition_id = ? ORDER BY name",
            (competition_id,)
        )
        return [dict(row) for row in cursor.fetchall()]
    
    def get_all_categories(self) -> List[Dict]:
        """Get all categories"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM categories ORDER BY competition_id, name")
        return [dict(row) for row in cursor.fetchall()]
    
    def insert_category(self, cat_data: Dict) -> int:
        """Insert new category"""
        conn = self.connect()
        cursor = conn.cursor()
        
        fields = list(cat_data.keys())
        placeholders = ','.join(['?' for _ in fields])
        values = [cat_data[f] for f in fields]
        
        query = f"INSERT INTO categories ({','.join(fields)}) VALUES ({placeholders})"
        cursor.execute(query, values)
        conn.commit()
        return cursor.lastrowid
    
    def update_category(self, cat_id: int, cat_data: Dict) -> bool:
        """Update existing category"""
        conn = self.connect()
        cursor = conn.cursor()
        
        set_clause = ','.join([f"{k} = ?" for k in cat_data.keys()])
        values = list(cat_data.values()) + [cat_id]
        
        query = f"UPDATE categories SET {set_clause} WHERE id = ?"
        cursor.execute(query, values)
        conn.commit()
        return cursor.rowcount > 0
    
    # Match methods
    def get_matches_by_category(self, category_id: int) -> List[Dict]:
        """Get matches for a specific category"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM matches WHERE category_id = ? ORDER BY match_number",
            (category_id,)
        )
        return [dict(row) for row in cursor.fetchall()]
    
    def get_all_matches(self) -> List[Dict]:
        """Get all matches"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM matches ORDER BY scheduled_time")
        return [dict(row) for row in cursor.fetchall()]
    
    def insert_match(self, match_data: Dict) -> int:
        """Insert new match"""
        conn = self.connect()
        cursor = conn.cursor()
        
        fields = list(match_data.keys())
        placeholders = ','.join(['?' for _ in fields])
        values = [match_data[f] for f in fields]
        
        query = f"INSERT INTO matches ({','.join(fields)}) VALUES ({placeholders})"
        cursor.execute(query, values)
        conn.commit()
        return cursor.lastrowid
    
    
    def delete_club(self, club_id: int) -> bool:
        """Delete club and track for sync if it has server_id"""
        conn = self.connect()
        cursor = conn.cursor()
        
        # Get club info before deletion
        cursor.execute("SELECT server_id, name FROM clubs WHERE id = ?", (club_id,))
        club = cursor.fetchone()
        
        if club and club['server_id']:
            # Track deletion for sync
            cursor.execute(
                "INSERT INTO pending_deletions (entity_type, server_id, entity_name) VALUES (?, ?, ?)",
                ('club', club['server_id'], club['name'])
            )
        
        # Delete locally
        cursor.execute("DELETE FROM clubs WHERE id = ?", (club_id,))
        conn.commit()
        return cursor.rowcount > 0
    
    def delete_grade(self, grade_id: int) -> bool:
        """Delete grade and track for sync if it has server_id"""
        conn = self.connect()
        cursor = conn.cursor()
        
        # Get grade info before deletion
        cursor.execute("SELECT server_id, name FROM grades WHERE id = ?", (grade_id,))
        grade = cursor.fetchone()
        
        if grade and grade['server_id']:
            # Track deletion for sync
            cursor.execute(
                "INSERT INTO pending_deletions (entity_type, server_id, entity_name) VALUES (?, ?, ?)",
                ('grade', grade['server_id'], grade['name'])
            )
        
        # Delete locally
        cursor.execute("DELETE FROM grades WHERE id = ?", (grade_id,))
        conn.commit()
        return cursor.rowcount > 0
    
    # Referee scores methods
    def get_referee_scores_for_match(self, match_id: int) -> List[Dict]:
        """Get all referee scores for a specific match"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM referee_scores WHERE match_id = ? ORDER BY id", (match_id,))
        return [dict(row) for row in cursor.fetchall()]
    
    def insert_referee_score(self, score_data: Dict) -> int:
        """Insert new referee score"""
        conn = self.connect()
        cursor = conn.cursor()
        
        fields = list(score_data.keys())
        placeholders = ','.join(['?' for _ in fields])
        values = [score_data[f] for f in fields]
        
        query = f"INSERT INTO referee_scores ({','.join(fields)}) VALUES ({placeholders})"
        cursor.execute(query, values)
        conn.commit()
        return cursor.lastrowid
    
    def update_referee_score(self, score_id: int, score_data: Dict) -> bool:
        """Update existing referee score"""
        conn = self.connect()
        cursor = conn.cursor()
        
        set_clause = ','.join([f"{k} = ?" for k in score_data.keys()])
        values = list(score_data.values()) + [score_id]
        
        query = f"UPDATE referee_scores SET {set_clause} WHERE id = ?"
        cursor.execute(query, values)
        conn.commit()
        return cursor.rowcount > 0
    
    def delete_referee_score(self, score_id: int) -> bool:
        """Delete referee score"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM referee_scores WHERE id = ?", (score_id,))
        conn.commit()
        return cursor.rowcount > 0
    
    def update_match(self, match_id: int, match_data: Dict) -> bool:
        """Update existing match"""
        conn = self.connect()
        cursor = conn.cursor()
        
        set_clause = ','.join([f"{k} = ?" for k in match_data.keys()])
        values = list(match_data.values()) + [match_id]
        
        query = f"UPDATE matches SET {set_clause} WHERE id = ?"
        cursor.execute(query, values)
        conn.commit()
        return cursor.rowcount > 0
    
    # Delete methods
    def delete_athlete(self, athlete_id: int) -> bool:
        """Delete athlete (soft delete if synced, hard delete if local only)"""
        conn = self.connect()
        cursor = conn.cursor()
        
        # Check if athlete has been synced
        athlete = cursor.execute("SELECT is_synced, server_id FROM athletes WHERE id = ?", (athlete_id,)).fetchone()
        
        if athlete and (athlete['is_synced'] or athlete['server_id']):
            # Soft delete - mark as deleted
            cursor.execute(
                "UPDATE athletes SET is_deleted = 1, deleted_at = ?, is_synced = 0 WHERE id = ?",
                (datetime.now().isoformat(), athlete_id)
            )
        else:
            # Hard delete - remove from local database
            cursor.execute("DELETE FROM athletes WHERE id = ?", (athlete_id,))
        
        conn.commit()
        return True
    
    def delete_competition(self, competition_id: int) -> bool:
        """Delete competition and track for sync if it has server_id"""
        conn = self.connect()
        cursor = conn.cursor()
        
        # Get competition info before deletion
        cursor.execute("SELECT server_id, title FROM competitions WHERE id = ?", (competition_id,))
        comp = cursor.fetchone()
        
        if comp and comp['server_id']:
            # Track deletion for sync
            cursor.execute(
                "INSERT INTO pending_deletions (entity_type, server_id, entity_name) VALUES (?, ?, ?)",
                ('competition', comp['server_id'], comp['title'])
            )
        
        # Delete locally
        cursor.execute("DELETE FROM competitions WHERE id = ?", (competition_id,))
        conn.commit()
        return cursor.rowcount > 0
    
    def delete_category(self, category_id: int) -> bool:
        """Delete category and track for sync if it has server_id"""
        conn = self.connect()
        cursor = conn.cursor()
        
        # Get category info before deletion
        cursor.execute("SELECT server_id, name FROM categories WHERE id = ?", (category_id,))
        cat = cursor.fetchone()
        
        if cat and cat['server_id']:
            # Track deletion for sync
            cursor.execute(
                "INSERT INTO pending_deletions (entity_type, server_id, entity_name) VALUES (?, ?, ?)",
                ('category', cat['server_id'], cat['name'])
            )
        
        # Delete locally
        cursor.execute("DELETE FROM categories WHERE id = ?", (category_id,))
        conn.commit()
        return cursor.rowcount > 0
    
    def delete_match(self, match_id: int) -> bool:
        """Delete match and track for sync if it has server_id"""
        conn = self.connect()
        cursor = conn.cursor()
        
        # Get match info before deletion
        cursor.execute("SELECT server_id, match_number, category_name FROM matches WHERE id = ?", (match_id,))
        match = cursor.fetchone()
        
        if match and match['server_id']:
            # Track deletion for sync
            entity_name = f"Match {match['match_number']} - {match['category_name']}"
            cursor.execute(
                "INSERT INTO pending_deletions (entity_type, server_id, entity_name) VALUES (?, ?, ?)",
                ('match', match['server_id'], entity_name)
            )
        
        # Delete locally
        cursor.execute("DELETE FROM matches WHERE id = ?", (match_id,))
        conn.commit()
        return cursor.rowcount > 0
    
    def get_central_referee(self, match_id: int) -> str:
        """Get central referee name for a match"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT central_referee FROM matches WHERE id = ?",
            (match_id,)
        )
        row = cursor.fetchone()
        return row['central_referee'] if row and row['central_referee'] else ''
    
    def update_central_referee(self, match_id: int, referee_name: str) -> bool:
        """Update central referee for a match and mark as unsynced"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE matches SET central_referee = ?, is_synced = 0 WHERE id = ?",
            (referee_name, match_id)
        )
        conn.commit()
        return cursor.rowcount > 0
    
    def get_referee_athletes(self) -> List[Dict]:
        """Get all athletes that are referees"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute(
            """SELECT id, first_name, last_name, club_name, current_grade_name 
               FROM athletes 
               WHERE is_referee = 1 AND is_deleted = 0
               ORDER BY last_name, first_name"""
        )
        return [dict(row) for row in cursor.fetchall()]
    
    def get_unsynced_matches(self) -> List[Dict]:
        """Get all matches that have not been synced"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute(
            """SELECT * FROM matches 
               WHERE is_synced = 0 AND server_id IS NOT NULL
               ORDER BY id"""
        )
        return [dict(row) for row in cursor.fetchall()]
    
    # Grade History methods
    def get_grade_history_for_athlete(self, athlete_id: int) -> List[Dict]:
        """Get grade history for a specific athlete"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute(
            """SELECT * FROM grade_history 
               WHERE athlete_id = ? 
               ORDER BY obtained_date DESC""",
            (athlete_id,)
        )
        return [dict(row) for row in cursor.fetchall()]
    
    def insert_grade_history(self, grade_data: Dict) -> int:
        """Insert new grade history record"""
        conn = self.connect()
        cursor = conn.cursor()
        
        fields = list(grade_data.keys())
        placeholders = ','.join(['?' for _ in fields])
        values = [grade_data[f] for f in fields]
        
        query = f"INSERT OR REPLACE INTO grade_history ({','.join(fields)}) VALUES ({placeholders})"
        cursor.execute(query, values)
        conn.commit()
        return cursor.lastrowid
    
    # Visas methods
    def get_visas_for_athlete(self, athlete_id: int) -> List[Dict]:
        """Get visas for a specific athlete"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute(
            """SELECT * FROM visas 
               WHERE athlete_id = ? 
               ORDER BY issued_date DESC""",
            (athlete_id,)
        )
        return [dict(row) for row in cursor.fetchall()]
    
    def insert_visa(self, visa_data: Dict) -> int:
        """Insert new visa record"""
        conn = self.connect()
        cursor = conn.cursor()
        
        fields = list(visa_data.keys())
        placeholders = ','.join(['?' for _ in fields])
        values = [visa_data[f] for f in fields]
        
        query = f"INSERT OR REPLACE INTO visas ({','.join(fields)}) VALUES ({placeholders})"
        cursor.execute(query, values)
        conn.commit()
        return cursor.lastrowid
    
    # Athlete Results methods
    def get_results_for_athlete(self, athlete_id: int) -> List[Dict]:
        """Get competition results for a specific athlete"""
        conn = self.connect()
        cursor = conn.cursor()
        cursor.execute(
            """SELECT * FROM athlete_results 
               WHERE athlete_id = ? 
               ORDER BY submitted_date DESC""",
            (athlete_id,)
        )
        return [dict(row) for row in cursor.fetchall()]
    
    def insert_athlete_result(self, result_data: Dict) -> int:
        """Insert new athlete result record"""
        conn = self.connect()
        cursor = conn.cursor()
        
        fields = list(result_data.keys())
        placeholders = ','.join(['?' for _ in fields])
        values = [result_data[f] for f in fields]
        
        query = f"INSERT OR REPLACE INTO athlete_results ({','.join(fields)}) VALUES ({placeholders})"
        cursor.execute(query, values)
        conn.commit()
        return cursor.lastrowid

