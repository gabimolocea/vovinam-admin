"""
Initialize database with new tables
"""
import sys
sys.path.append('desktop')

from models.db import Database

print("Initializing database...")
db = Database()

print("Database initialized!")
print("Tables created successfully.")

# Verify tables exist
import sqlite3
conn = sqlite3.connect('desktop/athletes.db')
cursor = conn.cursor()

tables_to_check = ['grade_history', 'visas', 'athlete_results']

print("\nVerifying tables:")
for table in tables_to_check:
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table,)
    )
    result = cursor.fetchone()
    
    if result:
        print(f"✓ {table}")
    else:
        print(f"✗ {table} NOT FOUND")

conn.close()
