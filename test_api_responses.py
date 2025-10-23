#!/usr/bin/env python3

import os
import django
import sys
import requests
import json

# Add the backend directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

# Set the Django settings module
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'crud.settings')

# Initialize Django
django.setup()

from api.models import Athlete, CategoryAthleteScore
from django.test import Client
from django.contrib.auth import get_user_model

def test_api_responses():
    print("=== TESTING API RESPONSES ===\n")
    
    # Create a test client
    client = Client()
    
    try:
        # Get Angel's user account
        angel = Athlete.objects.get(id=3)
        if not angel.user:
            print("Angel doesn't have a user account")
            return
            
        # Login as Angel
        client.force_login(angel.user)
        print(f"Logged in as: {angel.first_name} {angel.last_name} (User: {angel.user.email})")
        
        # Test the all_results endpoint
        response = client.get('/api/category-athlete-score/all_results/')
        print(f"\n1. /api/category-athlete-score/all_results/ response:")
        print(f"   Status code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"   Results count: {len(data)}")
            
            for i, result in enumerate(data):
                print(f"\n   Result {i+1}:")
                print(f"     ID: {result.get('id')}")
                print(f"     Category: {result.get('category_name', 'N/A')}")
                print(f"     Competition: {result.get('competition_name', 'N/A')}")
                print(f"     Result Type: {result.get('result_type')}")
                print(f"     Placement: {result.get('placement_claimed')}")
                print(f"     Status: {result.get('status')}")
                print(f"     Submitted by athlete: {result.get('submitted_by_athlete')}")
                print(f"     Team members: {result.get('team_members', [])}")
                print(f"     Team name: {result.get('team_name')}")
                
        else:
            print(f"   Error: {response.content.decode()}")
            
        # Also test Gabi's results for comparison
        gabi = Athlete.objects.get(id=1)
        if gabi.user:
            client.force_login(gabi.user)
            print(f"\n2. Testing Gabi's results for comparison:")
            print(f"   Logged in as: {gabi.first_name} {gabi.last_name} (User: {gabi.user.email})")
            
            response = client.get('/api/category-athlete-score/all_results/')
            print(f"   Status code: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"   Results count: {len(data)}")
                
                for i, result in enumerate(data):
                    print(f"\n   Result {i+1}:")
                    print(f"     ID: {result.get('id')}")
                    print(f"     Category: {result.get('category_name', 'N/A')}")
                    print(f"     Result Type: {result.get('result_type')}")
                    print(f"     Placement: {result.get('placement_claimed')}")
                    print(f"     Team members: {result.get('team_members', [])}")
                    
    except Exception as e:
        print(f"Error: {e}")
        
if __name__ == "__main__":
    test_api_responses()