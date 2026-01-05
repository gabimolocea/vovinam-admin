"""
Migrate athlete profile tables to match backend structure
"""
import sqlite3
from pathlib import Path

# Use the same path as the app
db_path = Path(__file__).parent / 'desktop' / 'data' / 'offline_db.sqlite3'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("Migrating athlete profile tables...")

# Drop old tables
print("Dropping old tables...")
cursor.execute("DROP TABLE IF EXISTS grade_history")
cursor.execute("DROP TABLE IF EXISTS visas")
cursor.execute("DROP TABLE IF EXISTS athlete_results")

# Create grade_history table with correct schema
print("Creating grade_history table...")
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
        last_synced_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE
    )
''')

# Create visas table
print("Creating visas table...")
cursor.execute('''
    CREATE TABLE IF NOT EXISTS visas (
        id INTEGER PRIMARY KEY,
        server_id INTEGER UNIQUE,
        athlete_id INTEGER NOT NULL,
        athlete_name TEXT,
        visa_type TEXT NOT NULL,
        issued_date TEXT NOT NULL,
        health_status TEXT,
        visa_status TEXT,
        is_valid INTEGER DEFAULT 0,
        status TEXT DEFAULT 'approved',
        submitted_date TEXT,
        reviewed_date TEXT,
        reviewed_by_id INTEGER,
        admin_notes TEXT,
        document TEXT,
        image TEXT,
        notes TEXT,
        last_synced_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE
    )
''')

# Create athlete_results table
print("Creating athlete_results table...")
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

conn.commit()

# Verify tables
print("\nVerifying tables...")
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()

profile_tables = ['grade_history', 'visas', 'athlete_results']
for table_name in profile_tables:
    if any(table[0] == table_name for table in tables):
        print(f"✓ {table_name}")
        # Show columns
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = cursor.fetchall()
        print(f"  Columns ({len(columns)}): {', '.join([col[1] for col in columns])}")
    else:
        print(f"✗ {table_name} NOT FOUND")

conn.close()

print("\n✓ Migration complete!")
