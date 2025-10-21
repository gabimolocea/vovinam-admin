#!/usr/bin/env python3
"""
User Acceptance Testing Script for FRVV Athlete Registration Workflow
This script tests the complete workflow programmatically.
"""

import requests
import json
from datetime import date, datetime
import sys
import os

# Configuration
BASE_URL = "http://127.0.0.1:8000"
FRONTEND_URL = "http://localhost:5173"

class WorkflowTester:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []
        self.tokens = {}
    
    def log_test(self, test_name, success, message, details=None):
        """Log test results"""
        result = {
            'test': test_name,
            'success': success,
            'message': message,
            'details': details,
            'timestamp': datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
        print(f"   {message}")
        if details:
            print(f"   Details: {details}")
        print()
    
    def test_enhanced_registration(self, role='athlete'):
        """Test the enhanced user registration"""
        test_name = f"Enhanced Registration - {role.title()}"
        
        # Generate unique test data
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        username = f"test_{role}_{timestamp}"
        email = f"{username}@test.com"
        
        registration_data = {
            "username": username,
            "email": email,
            "password": "TestPass123!",
            "password_confirm": "TestPass123!",
            "first_name": "Test",
            "last_name": "User",
            "role": role,
            "phone_number": "+1234567890" if role == 'athlete' else None,
            "date_of_birth": "1990-01-01" if role == 'athlete' else None,
            "city": 1 if role == 'athlete' else None
        }
        
        try:
            response = self.session.post(
                f"{BASE_URL}/auth/register-enhanced/",
                json=registration_data,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 201:
                data = response.json()
                self.tokens = data.get('tokens', {})
                
                self.log_test(
                    test_name, 
                    True, 
                    f"Registration successful for user {username}",
                    {
                        'user_id': data['user']['id'],
                        'username': data['user']['username'],
                        'role': data['user']['role'],
                        'tokens_received': bool(self.tokens)
                    }
                )
                return data['user']
            else:
                self.log_test(
                    test_name, 
                    False, 
                    f"Registration failed with status {response.status_code}",
                    response.json()
                )
                return None
                
        except Exception as e:
            self.log_test(test_name, False, f"Registration error: {str(e)}")
            return None
    
    def test_athlete_profile_creation(self, user_data):
        """Test athlete profile creation"""
        test_name = "Athlete Profile Creation"
        
        if not user_data or user_data.get('role') != 'athlete':
            self.log_test(test_name, False, "No athlete user available for testing")
            return None
        
        # Set up authentication
        headers = {
            'Authorization': f'Bearer {self.tokens.get("access")}',
            'Content-Type': 'application/json'
        }
        
        profile_data = {
            # Required fields
            "first_name": "Test",
            "last_name": "Athlete",
            "date_of_birth": "1990-01-01",
            "club": None,  # Optional field - no clubs exist yet
            "city": 1,  # City ID 1 exists (Iasi)
            
            # Optional fields
            "address": "123 Test Street",
            "mobile_number": "+1234567890",
            "emergency_contact_name": "Emergency Contact",
            "emergency_contact_phone": "+1987654321",
            "previous_experience": "5 years of martial arts experience"
        }
        
        try:
            response = self.session.post(
                f"{BASE_URL}/athlete-profile/",
                json=profile_data,
                headers=headers
            )
            
            if response.status_code == 201:
                data = response.json()
                self.log_test(
                    test_name, 
                    True, 
                    f"Athlete profile created successfully",
                    {
                        'profile_id': data['id'],
                        'status': data['status'],
                        'user': data['user']
                    }
                )
                return data
            else:
                self.log_test(
                    test_name, 
                    False, 
                    f"Profile creation failed with status {response.status_code}",
                    response.json()
                )
                return None
                
        except Exception as e:
            self.log_test(test_name, False, f"Profile creation error: {str(e)}")
            return None
    
    def test_admin_workflow(self, profile_data):
        """Test admin approval workflow"""
        test_name = "Admin Approval Workflow"
        
        if not profile_data:
            self.log_test(test_name, False, "No athlete profile available for testing")
            return
        
        # Test getting profile details (simulating admin view)
        try:
            response = self.session.get(f"{BASE_URL}/athlete-profile/{profile_data['id']}/")
            
            if response.status_code == 200:
                profile = response.json()
                self.log_test(
                    test_name, 
                    True, 
                    f"Admin can view profile details",
                    {
                        'profile_status': profile['status'],
                        'has_required_fields': all([
                            profile.get('weight'),
                            profile.get('height'),
                            profile.get('emergency_contact_name')
                        ])
                    }
                )
            else:
                self.log_test(test_name, False, f"Cannot retrieve profile: {response.status_code}")
                
        except Exception as e:
            self.log_test(test_name, False, f"Admin workflow error: {str(e)}")
    
    def test_user_authentication(self):
        """Test user authentication and session management"""
        test_name = "User Authentication"
        
        if not self.tokens.get('access'):
            self.log_test(test_name, False, "No access token available")
            return
        
        headers = {'Authorization': f'Bearer {self.tokens["access"]}'}
        
        try:
            response = self.session.get(f"{BASE_URL}/auth/profile/", headers=headers)
            
            if response.status_code == 200:
                user_data = response.json()
                self.log_test(
                    test_name, 
                    True, 
                    "User authentication successful",
                    {
                        'user_id': user_data['id'],
                        'role': user_data['role'],
                        'profile_completed': user_data.get('profile_completed', False)
                    }
                )
            else:
                self.log_test(test_name, False, f"Authentication failed: {response.status_code}")
                
        except Exception as e:
            self.log_test(test_name, False, f"Authentication error: {str(e)}")
    
    def run_complete_workflow_test(self):
        """Run the complete workflow test"""
        print("🚀 Starting FRVV Athlete Registration Workflow Tests")
        print("=" * 60)
        
        # Test 1: Enhanced User Registration for Athlete
        athlete_user = self.test_enhanced_registration('athlete')
        
        # Test 2: Enhanced User Registration for Supporter
        supporter_user = self.test_enhanced_registration('supporter')
        
        # Test 3: User Authentication
        self.test_user_authentication()
        
        # Test 4: Athlete Profile Creation
        athlete_profile = self.test_athlete_profile_creation(athlete_user)
        
        # Test 5: Admin Workflow
        self.test_admin_workflow(athlete_profile)
        
        # Summary
        self.print_summary()
    
    def print_summary(self):
        """Print test summary"""
        print("=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for r in self.test_results if r['success'])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if failed_tests > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  - {result['test']}: {result['message']}")
        
        print("\n🎯 NEXT STEPS:")
        if failed_tests == 0:
            print("  - All automated tests passed!")
            print("  - Proceed with manual frontend testing")
            print("  - Test admin interface at http://127.0.0.1:8000/admin/")
            print("  - Test registration at http://localhost:5173/register-enhanced")
        else:
            print("  - Fix failed tests before proceeding")
            print("  - Check server logs for detailed error information")

if __name__ == "__main__":
    print("🔧 FRVV Workflow User Acceptance Testing")
    print("Make sure both servers are running:")
    print("  Backend: http://127.0.0.1:8000")
    print("  Frontend: http://localhost:5173")
    print()
    
    # Check if servers are running
    try:
        backend_response = requests.get(f"{BASE_URL}/api/", timeout=5)
        print("✅ Backend server is running")
    except:
        print("❌ Backend server is not accessible")
        sys.exit(1)
    
    try:
        frontend_response = requests.get(f"{FRONTEND_URL}", timeout=5)
        print("✅ Frontend server is running")
    except:
        print("❌ Frontend server is not accessible")
        print("   (This is expected if using Vite dev server)")
    
    print()
    
    # Run tests
    tester = WorkflowTester()
    tester.run_complete_workflow_test()