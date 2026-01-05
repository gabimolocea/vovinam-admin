"""
Sync Manager - handles sync between local DB and Django API
"""
import requests
from typing import Dict, List, Tuple
from datetime import datetime
import config
from models.db import Database

class SyncManager:
    def __init__(self, api_base_url: str = None):
        self.api_base_url = api_base_url or config.API_BASE_URL
        self.db = Database()
        self.session = requests.Session()
    
    def set_auth_token(self, token: str):
        """Set JWT authentication token"""
        self.session.headers.update({
            'Authorization': f'Bearer {token}'
        })
    
    def test_connection(self) -> Tuple[bool, str]:
        """Test connection to API"""
        try:
            response = self.session.get(f"{self.api_base_url}/", timeout=5)
            if response.status_code == 200:
                return True, "Connected successfully"
            return False, f"Server returned {response.status_code}"
        except requests.exceptions.ConnectionError:
            return False, "Cannot connect to server"
        except Exception as e:
            return False, str(e)
    
    def sync_reference_data(self) -> Tuple[bool, str]:
        """Download reference data (clubs, cities, grades) from server"""
        try:
            # Sync clubs
            response = self.session.get(f"{self.api_base_url}/sync/sync_metadata/?entities=clubs")
            if response.status_code == 200:
                data = response.json()
                if 'clubs' in data:
                    self.db.upsert_reference_data('clubs', data['clubs'])
            
            # Sync cities (if you have cities endpoint)
            # response = self.session.get(f"{self.api_base_url}/cities/")
            # ...
            
            return True, "Reference data synced successfully"
        except Exception as e:
            return False, f"Sync failed: {str(e)}"
    
    def pull_athletes(self) -> Tuple[bool, str, int]:
        """Download athletes from server"""
        try:
            # Get all athletes from the main athletes endpoint
            response = self.session.get(f"{self.api_base_url}/athletes/")
            
            if response.status_code != 200:
                return False, f"Server error: {response.status_code}", 0
            
            athletes_data = response.json()
            
            # Handle paginated response
            if isinstance(athletes_data, dict):
                # If paginated, get results array
                athletes_list = athletes_data.get('results', [])
            else:
                # If it's already a list
                athletes_list = athletes_data
            
            if not athletes_list:
                return False, "No athletes returned from server", 0
            
            count = 0
            errors = []
            
            for athlete_data in athletes_list:
                try:
                    athlete_id = athlete_data.get('id')
                    if not athlete_id:
                        errors.append("Missing athlete ID")
                        continue
                    
                    # Check if exists locally
                    conn = self.db.connect()
                    existing = conn.execute(
                        "SELECT id FROM athletes WHERE server_id = ?", 
                        (athlete_id,)
                    ).fetchone()
                    
                    local_data = self._map_server_to_local(athlete_data)
                    
                    # Debug: print what we're trying to insert
                    print(f"Syncing athlete {athlete_id}: {local_data.get('first_name')} {local_data.get('last_name')}")
                    
                    if existing:
                        success = self.db.update_athlete(existing['id'], local_data)
                        if not success:
                            errors.append(f"Failed to update athlete {athlete_id}")
                    else:
                        new_id = self.db.insert_athlete(local_data)
                        if not new_id:
                            errors.append(f"Failed to insert athlete {athlete_id}")
                    
                    count += 1
                except Exception as e:
                    errors.append(f"Athlete {athlete_data.get('id', 'unknown')}: {str(e)}")
                    print(f"Error syncing athlete: {e}")
            
            self.db.log_sync('athletes', 'pull', count, True)
            
            msg = f"Downloaded {count} athletes"
            if errors:
                msg += f" ({len(errors)} errors)"
                print(f"Sync errors: {errors[:5]}")  # Print first 5 errors
            
            return True, msg, count
            
        except Exception as e:
            print(f"Pull failed with error: {e}")
            import traceback
            traceback.print_exc()
            self.db.log_sync('athletes', 'pull', 0, False, str(e))
            return False, f"Pull failed: {str(e)}", 0
    
    def push_athletes(self) -> Tuple[bool, str, int]:
        """Upload local unsynced athletes to server"""
        try:
            unsynced = self.db.get_unsynced_athletes()
            
            if not unsynced:
                return True, "No athletes to sync", 0
            
            # Prepare bulk sync data
            sync_data = {
                'athletes': [self._map_local_to_server(a) for a in unsynced]
            }
            
            response = self.session.post(
                f"{self.api_base_url}/sync/bulk_sync/",
                json=sync_data
            )
            
            if response.status_code != 200:
                return False, f"Server error: {response.status_code}", 0
            
            results = response.json()
            
            # Update local records with server IDs
            for result in results.get('results', []):
                if result.get('status') in ['created', 'updated']:
                    local_id = result.get('temp_id')  # You'd need to track this
                    server_id = result.get('id')
                    
                    # Mark as synced
                    self.db.connect().execute(
                        "UPDATE athletes SET server_id = ?, is_synced = 1, last_synced_at = ? WHERE temp_id = ?",
                        (server_id, datetime.now().isoformat(), local_id)
                    )
                    self.db.connect().commit()
            
            count = len(results.get('results', []))
            self.db.log_sync('athletes', 'push', count, True)
            return True, f"Uploaded {count} athletes", count
            
        except Exception as e:
            self.db.log_sync('athletes', 'push', 0, False, str(e))
            return False, f"Push failed: {str(e)}", 0
    
    def pull_competitions(self) -> Tuple[bool, str, int]:
        """Download competitions from server"""
        try:
            # Get competitions (Events with event_type='competition')
            response = self.session.get(f"{self.api_base_url.replace('/api', '')}/api/landing/events/")
            
            if response.status_code != 200:
                return False, f"Server error: {response.status_code}", 0
            
            events_data = response.json()
            
            # Handle paginated or list response
            if isinstance(events_data, dict):
                events_list = events_data.get('results', [])
            else:
                events_list = events_data
            
            # Filter for competitions only
            competitions = [e for e in events_list if e.get('event_type') == 'competition']
            
            count = 0
            for comp_data in competitions:
                try:
                    comp_id = comp_data.get('id')
                    
                    # Check if exists locally
                    conn = self.db.connect()
                    existing = conn.execute(
                        "SELECT id FROM competitions WHERE server_id = ?",
                        (comp_id,)
                    ).fetchone()
                    
                    # Map data
                    city = comp_data.get('city')
                    local_data = {
                        'server_id': comp_id,
                        'title': comp_data.get('title') or comp_data.get('name', ''),
                        'description': comp_data.get('description'),
                        'start_date': comp_data.get('start_date'),
                        'end_date': comp_data.get('end_date'),
                        'address': comp_data.get('address'),
                        'city_id': city.get('id') if isinstance(city, dict) else city,
                        'city_name': city.get('name') if isinstance(city, dict) else None,
                        'event_type': comp_data.get('event_type', 'competition'),
                        'is_featured': 1 if comp_data.get('is_featured') else 0,
                        'last_synced_at': datetime.now().isoformat()
                    }
                    
                    if existing:
                        self.db.update_competition(existing['id'], local_data)
                    else:
                        self.db.insert_competition(local_data)
                    
                    count += 1
                except Exception as e:
                    print(f"Error syncing competition {comp_data.get('id')}: {e}")
            
            self.db.log_sync('competitions', 'pull', count, True)
            return True, f"Downloaded {count} competitions", count
            
        except Exception as e:
            print(f"Pull competitions failed: {e}")
            self.db.log_sync('competitions', 'pull', 0, False, str(e))
            return False, f"Pull failed: {str(e)}", 0
    
    def pull_categories(self) -> Tuple[bool, str, int]:
        """Download categories from server"""
        try:
            print("Fetching categories from API...")
            response = self.session.get(f"{self.api_base_url}/categories/")
            
            print(f"Categories API response: {response.status_code}")
            
            if response.status_code != 200:
                print(f"Categories API error: {response.text[:200]}")
                return False, f"Server error: {response.status_code}", 0
            
            categories_data = response.json()
            
            if isinstance(categories_data, dict):
                categories_list = categories_data.get('results', [])
            else:
                categories_list = categories_data
            
            print(f"Found {len(categories_list)} categories to sync")
            
            count = 0
            for cat_data in categories_list:
                try:
                    cat_id = cat_data.get('id')
                    
                    conn = self.db.connect()
                    existing = conn.execute(
                        "SELECT id FROM categories WHERE server_id = ?",
                        (cat_id,)
                    ).fetchone()
                    
                    # Map data
                    event = cat_data.get('event')
                    local_data = {
                        'server_id': cat_id,
                        'competition_id': event if isinstance(event, int) else (event.get('id') if event else None),
                        'competition_title': cat_data.get('event_name') or cat_data.get('competition_name'),
                        'name': cat_data.get('name', ''),
                        'gender': cat_data.get('gender'),
                        'min_age': cat_data.get('min_age'),
                        'max_age': cat_data.get('max_age'),
                        'min_weight': cat_data.get('min_weight'),
                        'max_weight': cat_data.get('max_weight'),
                        'category_type': cat_data.get('type'),
                        'is_team_category': 1 if cat_data.get('type') == 'teams' else 0,
                        'last_synced_at': datetime.now().isoformat()
                    }
                    
                    if existing:
                        self.db.update_category(existing['id'], local_data)
                    else:
                        self.db.insert_category(local_data)
                    
                    count += 1
                except Exception as e:
                    print(f"Error syncing category {cat_data.get('id')}: {e}")
                    import traceback
                    traceback.print_exc()
            
            self.db.log_sync('categories', 'pull', count, True)
            return True, f"Downloaded {count} categories", count
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"Pull categories failed: {e}")
            self.db.log_sync('categories', 'pull', 0, False, str(e))
            return False, f"Pull failed: {str(e)}", 0
    
    def pull_matches(self) -> Tuple[bool, str, int]:
        """Download matches from server"""
        try:
            print("Fetching matches from API...")
            response = self.session.get(f"{self.api_base_url}/matches/")
            
            print(f"Matches API response: {response.status_code}")
            
            if response.status_code != 200:
                print(f"Matches API error: {response.text[:200]}")
                return False, f"Server error: {response.status_code}", 0
            
            matches_data = response.json()
            
            if isinstance(matches_data, dict):
                matches_list = matches_data.get('results', [])
            else:
                matches_list = matches_data
            
            print(f"Found {len(matches_list)} matches to sync")
            
            count = 0
            for match_data in matches_list:
                try:
                    match_id = match_data.get('id')
                    
                    conn = self.db.connect()
                    existing = conn.execute(
                        "SELECT id FROM matches WHERE server_id = ?",
                        (match_id,)
                    ).fetchone()
                    
                    # Map data
                    category = match_data.get('category')
                    athlete1 = match_data.get('athlete1')
                    athlete2 = match_data.get('athlete2')
                    winner = match_data.get('winner')
                    
                    local_data = {
                        'server_id': match_id,
                        'category_id': category.get('id') if isinstance(category, dict) else category,
                        'category_name': category.get('name') if isinstance(category, dict) else None,
                        'match_number': match_data.get('match_number'),
                        'round': match_data.get('round'),
                        'athlete1_id': athlete1.get('id') if isinstance(athlete1, dict) else athlete1,
                        'athlete1_name': f"{athlete1.get('first_name', '')} {athlete1.get('last_name', '')}" if isinstance(athlete1, dict) else None,
                        'athlete2_id': athlete2.get('id') if isinstance(athlete2, dict) else athlete2,
                        'athlete2_name': f"{athlete2.get('first_name', '')} {athlete2.get('last_name', '')}" if isinstance(athlete2, dict) else None,
                        'winner_id': winner.get('id') if isinstance(winner, dict) else winner,
                        'winner_name': f"{winner.get('first_name', '')} {winner.get('last_name', '')}" if isinstance(winner, dict) else None,
                        'status': match_data.get('status', 'scheduled'),
                        'scheduled_time': match_data.get('scheduled_time'),
                        'last_synced_at': datetime.now().isoformat()
                    }
                    
                    if existing:
                        self.db.update_match(existing['id'], local_data)
                    else:
                        self.db.insert_match(local_data)
                    
                    count += 1
                except Exception as e:
                    print(f"Error syncing match {match_data.get('id')}: {e}")
            
            self.db.log_sync('matches', 'pull', count, True)
            return True, f"Downloaded {count} matches", count
            
        except Exception as e:
            print(f"Pull matches failed: {e}")
            self.db.log_sync('matches', 'pull', 0, False, str(e))
            return False, f"Pull failed: {str(e)}", 0
    
    def pull_clubs(self) -> Tuple[bool, str, int]:
        """Download clubs from server"""
        try:
            print("Fetching clubs from API...")
            response = self.session.get(f"{self.api_base_url}/clubs/")
            
            if response.status_code != 200:
                return False, f"Server error: {response.status_code}", 0
            
            clubs_data = response.json()
            
            if isinstance(clubs_data, dict):
                clubs_list = clubs_data.get('results', [])
            else:
                clubs_list = clubs_data
            
            print(f"Found {len(clubs_list)} clubs to sync")
            
            count = 0
            for club_data in clubs_list:
                try:
                    club_id = club_data.get('id')
                    
                    conn = self.db.connect()
                    existing = conn.execute(
                        "SELECT id FROM clubs WHERE server_id = ?",
                        (club_id,)
                    ).fetchone()
                    
                    # Map city
                    city = club_data.get('city')
                    if isinstance(city, dict):
                        city_id = city.get('id')
                        city_name = city.get('name')
                    else:
                        city_id = city
                        city_name = None
                    
                    local_data = {
                        'server_id': club_id,
                        'name': club_data.get('name'),
                        'logo': club_data.get('logo'),
                        'city_id': city_id,
                        'city_name': city_name,
                        'address': club_data.get('address'),
                        'mobile_number': club_data.get('mobile_number'),
                        'website': club_data.get('website'),
                        'created': club_data.get('created'),
                        'modified': club_data.get('modified'),
                        'last_synced_at': datetime.now().isoformat()
                    }
                    
                    if existing:
                        self.db.update_club(existing['id'], local_data)
                    else:
                        self.db.insert_club(local_data)
                    
                    count += 1
                except Exception as e:
                    print(f"Error syncing club {club_data.get('id')}: {e}")
            
            self.db.log_sync('clubs', 'pull', count, True)
            return True, f"Downloaded {count} clubs", count
            
        except Exception as e:
            print(f"Pull clubs failed: {e}")
            self.db.log_sync('clubs', 'pull', 0, False, str(e))
            return False, f"Pull failed: {str(e)}", 0
    
    def pull_grades(self) -> Tuple[bool, str, int]:
        """Download grades from server"""
        try:
            print("Fetching grades from API...")
            response = self.session.get(f"{self.api_base_url}/grades/")
            
            if response.status_code != 200:
                return False, f"Server error: {response.status_code}", 0
            
            grades_data = response.json()
            
            if isinstance(grades_data, dict):
                grades_list = grades_data.get('results', [])
            else:
                grades_list = grades_data
            
            print(f"Found {len(grades_list)} grades to sync")
            
            count = 0
            for grade_data in grades_list:
                try:
                    grade_id = grade_data.get('id')
                    
                    conn = self.db.connect()
                    existing = conn.execute(
                        "SELECT id FROM grades WHERE server_id = ?",
                        (grade_id,)
                    ).fetchone()
                    
                    local_data = {
                        'server_id': grade_id,
                        'name': grade_data.get('name'),
                        'rank_order': grade_data.get('rank_order', 0),
                        'grade_type': grade_data.get('grade_type', 'inferior'),
                        'image': grade_data.get('image'),
                        'created': grade_data.get('created'),
                        'modified': grade_data.get('modified'),
                        'last_synced_at': datetime.now().isoformat()
                    }
                    
                    if existing:
                        self.db.update_grade(existing['id'], local_data)
                    else:
                        self.db.insert_grade(local_data)
                    
                    count += 1
                except Exception as e:
                    print(f"Error syncing grade {grade_data.get('id')}: {e}")
            
            self.db.log_sync('grades', 'pull', count, True)
            return True, f"Downloaded {count} grades", count
            
        except Exception as e:
            print(f"Pull grades failed: {e}")
            self.db.log_sync('grades', 'pull', 0, False, str(e))
            return False, f"Pull failed: {str(e)}", 0
    
    def _map_server_to_local(self, server_data: Dict) -> Dict:
        """Map server athlete data to local database format"""
        # Handle nested club object
        club = server_data.get('club')
        if isinstance(club, dict):
            club_id = club.get('id')
            club_name = club.get('name')
        else:
            club_id = club
            club_name = None
        
        # Handle nested city object
        city = server_data.get('city')
        if isinstance(city, dict):
            city_id = city.get('id')
            city_name = city.get('name')
        else:
            city_id = city
            city_name = None
        
        # Handle nested grade object
        current_grade = server_data.get('current_grade')
        current_grade_details = server_data.get('current_grade_details')
        if current_grade_details and isinstance(current_grade_details, dict):
            grade_id = current_grade_details.get('id')
            grade_name = current_grade_details.get('name')
        elif isinstance(current_grade, dict):
            grade_id = current_grade.get('id')
            grade_name = current_grade.get('name')
        else:
            grade_id = current_grade
            grade_name = None
        
        # Handle user object
        user = server_data.get('user')
        user_id = None
        if isinstance(user, dict):
            user_id = user.get('id')
        else:
            user_id = user
        
        return {
            'server_id': server_data.get('id'),
            'user_id': user_id,
            'first_name': server_data.get('first_name', ''),
            'last_name': server_data.get('last_name', ''),
            'date_of_birth': server_data.get('date_of_birth'),
            'team_place': server_data.get('team_place'),
            'address': server_data.get('address'),
            'mobile_number': server_data.get('mobile_number'),
            'emergency_contact_name': server_data.get('emergency_contact_name'),
            'emergency_contact_phone': server_data.get('emergency_contact_phone'),
            'previous_experience': server_data.get('previous_experience'),
            'club_id': club_id,
            'club_name': club_name,
            'city_id': city_id,
            'city_name': city_name,
            'current_grade_id': grade_id,
            'current_grade_name': grade_name,
            'federation_role_id': server_data.get('federation_role'),
            'title_id': server_data.get('title'),
            'registered_date': server_data.get('registered_date'),
            'expiration_date': server_data.get('expiration_date'),
            'is_coach': 1 if server_data.get('is_coach') else 0,
            'is_referee': 1 if server_data.get('is_referee') else 0,
            'profile_image': server_data.get('profile_image'),
            'medical_certificate': server_data.get('medical_certificate'),
            'status': server_data.get('status', 'pending'),
            'submitted_date': server_data.get('submitted_date'),
            'reviewed_date': server_data.get('reviewed_date'),
            'reviewed_by_id': server_data.get('reviewed_by'),
            'admin_notes': server_data.get('admin_notes'),
            'approved_date': server_data.get('approved_date'),
            'approved_by_id': server_data.get('approved_by'),
            'version': server_data.get('version', 1),
            'is_synced': 1,
            'last_synced_at': datetime.now().isoformat()
        }
    
    def _map_local_to_server(self, local_data: Dict) -> Dict:
        """Map local athlete data to server format"""
        return {
            'temp_id': local_data.get('temp_id'),
            'first_name': local_data.get('first_name'),
            'last_name': local_data.get('last_name'),
            'date_of_birth': local_data.get('date_of_birth'),
            'mobile_number': local_data.get('mobile_number'),
            'address': local_data.get('address'),
            'club': local_data.get('club_id'),
            'city': local_data.get('city_id'),
            'status': local_data.get('status', 'pending'),
            'is_coach': bool(local_data.get('is_coach')),
            'is_referee': bool(local_data.get('is_referee')),
            'version': local_data.get('version', 1)
        }
