import os
import sys
import django

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'crud.settings')
django.setup()

from django.db import connection

cursor = connection.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='api_athleteactivity'")
result = cursor.fetchall()
print(f"Table exists: {bool(result)}")
print(f"Result: {result}")

# Try to create the table if it doesn't exist
if not result:
    print("\nAttempting to create table via migration...")
    from django.core.management import call_command
    
    # Force Django to recognize model changes
    from api.models import AthleteActivity
    print(f"Model loaded: {AthleteActivity}")
    
    # Try makemigrations with empty
    call_command('makemigrations', 'api', '--empty', '--name', 'create_athlete_activity_table')
