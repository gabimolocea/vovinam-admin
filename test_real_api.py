#!/usr/bin/env python3

import requests
import json

def test_api_endpoints():
    print("=== TESTING REAL API ENDPOINTS ===\n")
    
    # Test the all_results endpoint without authentication first to see the structure
    try:
        response = requests.get('http://127.0.0.1:8001/api/category-athlete-score/all_results/')
        print(f"1. Testing all_results endpoint (unauthenticated):")
        print(f"   Status code: {response.status_code}")
        
        if response.status_code == 401:
            print("   Expected: Authentication required")
        else:
            print(f"   Response: {response.text[:500]}...")
            
        # Try to get some sample data to understand the structure
        response = requests.get('http://127.0.0.1:8001/api/category-athlete-score/')
        print(f"\n2. Testing category-athlete-score list endpoint:")
        print(f"   Status code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"   Total records: {data.get('count', 'N/A')}")
            if 'results' in data and data['results']:
                sample = data['results'][0]
                print(f"   Sample record structure:")
                for key, value in sample.items():
                    if isinstance(value, (str, int, bool)) or value is None:
                        print(f"     {key}: {value}")
                    else:
                        print(f"     {key}: {type(value).__name__}")
        else:
            print(f"   Error: {response.text[:200]}...")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_api_endpoints()