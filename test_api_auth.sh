#!/bin/bash
# Test the categories API

echo "Testing Categories API"
echo "======================="
echo ""

# First, let's check if we can login and get a token
echo "1. Getting superuser token..."

# Get Django superuser credentials from DB or settings
# For testing, we'll try to create a test token directly

python3 << 'EOF'
import os
import sys
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'crud.settings')

# Disable admin_interface for this test
import django.conf
if not django.conf.settings.configured:
    from django.conf import settings
    # We'll work with what we have
    pass

# Try to get auth info from database
import sqlite3
db_path = 'backend/db.sqlite3'

if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get a user with auth token
    cursor.execute("""
        SELECT u.id, u.username, u.email
        FROM api_user u
        WHERE u.is_staff = 1 AND u.is_superuser = 1
        LIMIT 1
    """)
    user = cursor.fetchone()
    
    if user:
        print(f"Found superuser: {user[1]} ({user[2]})")
        print(f"ID: {user[0]}")
    
    # List some users for reference
    print("\nAvailable users:")
    cursor.execute("SELECT id, username, email FROM api_user LIMIT 5")
    for row in cursor.fetchall():
        print(f"  ID {row[0]}: {row[1]} ({row[2]})")
    
    conn.close()
else:
    print("Database not found")
EOF
