"""
Direct SQL test for creating tables
"""
import sqlite3

db_path = 'desktop/athletes.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("Creating tables directly...")

try:
    # Grade History table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS grade_history (
            id INTEGER PRIMARY KEY,
            server_id INTEGER UNIQUE,
            athlete_id INTEGER NOT NULL,
            athlete_name TEXT,
            grade_id INTEGER NOT NULL,
            grade_name TEXT,
            date_earned TEXT,
            event_id INTEGER,
            event_title TEXT,
            status TEXT DEFAULT 'pending',
            submitted_date TEXT,
            reviewed_date TEXT,
            reviewed_by_id INTEGER,
            admin_notes TEXT,
            last_synced_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE
        )
    ''')
    print("✓ Created grade_history table")
    
    # Visas table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS visas (
            id INTEGER PRIMARY KEY,
            server_id INTEGER UNIQUE,
            athlete_id INTEGER NOT NULL,
            athlete_name TEXT,
            visa_type TEXT NOT NULL,
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
            last_synced_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE
        )
    ''')
    print("✓ Created visas table")
    
    # Athlete Results table
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
            result_type TEXT,
            status TEXT DEFAULT 'pending',
            submitted_date TEXT,
            reviewed_date TEXT,
            reviewed_by_id INTEGER,
            admin_notes TEXT,
            last_synced_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE
        )
    ''')
    print("✓ Created athlete_results table")
    
    conn.commit()
    print("\n✓ All tables committed")
    
except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()

# Verify
print("\nVerifying tables:")
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()
for table in tables:
    print(f"  - {table[0]}")

conn.close()
