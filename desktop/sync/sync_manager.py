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
            total_synced = 0
            
            # Sync cities
            print("Syncing cities...")
            response = self.session.get(f"{self.api_base_url}/cities/")
            print(f"Cities API response: {response.status_code}")
            
            if response.status_code == 200:
                cities_data = response.json()
                cities_list = cities_data.get('results', []) if isinstance(cities_data, dict) else cities_data
                print(f"Found {len(cities_list)} cities")
                
                for city in cities_list:
                    city_id = city.get('id')
                    conn = self.db.connect()
                    existing = conn.execute("SELECT id FROM cities WHERE server_id = ?", (city_id,)).fetchone()
                    
                    local_data = {
                        'server_id': city_id,
                        'name': city.get('name'),
                        'last_synced_at': datetime.now().isoformat()
                    }
                    
                    if existing:
                        cursor = conn.cursor()
                        cursor.execute(
                            "UPDATE cities SET name = ?, last_synced_at = ? WHERE server_id = ?",
                            (local_data['name'], local_data['last_synced_at'], city_id)
                        )
                        conn.commit()
                    else:
                        cursor = conn.cursor()
                        cursor.execute(
                            "INSERT INTO cities (server_id, name, last_synced_at) VALUES (?, ?, ?)",
                            (local_data['server_id'], local_data['name'], local_data['last_synced_at'])
                        )
                        conn.commit()
                    total_synced += 1
                print(f"Synced {len(cities_list)} cities")
            elif response.status_code == 401 or response.status_code == 403:
                print(f"Cities API authentication error: {response.text}")
                return False, "Authentication required. Please login first."
            else:
                print(f"Cities API error: {response.status_code} - {response.text[:200]}")
            
            # Sync clubs
            print("Syncing clubs...")
            success, msg, count = self.pull_clubs()
            if success:
                total_synced += count
                print(msg)
            else:
                print(f"Clubs sync failed: {msg}")
            
            # Sync grades
            print("Syncing grades...")
            success, msg, count = self.pull_grades()
            if success:
                total_synced += count
                print(msg)
            else:
                print(f"Grades sync failed: {msg}")
            
            return True, f"Reference data synced successfully ({total_synced} records)"
        except Exception as e:
            print(f"Reference data sync error: {e}")
            import traceback
            traceback.print_exc()
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
            
            count = 0
            errors = []
            
            for athlete in unsynced:
                try:
                    # Map to server format
                    data = self._map_local_to_server(athlete)
                    
                    # Check if this is an update or create
                    server_id = athlete.get('server_id')
                    
                    if server_id:
                        # Update existing athlete
                        response = self.session.put(
                            f"{self.api_base_url}/athletes/{server_id}/",
                            json=data
                        )
                    else:
                        # Create new athlete
                        response = self.session.post(
                            f"{self.api_base_url}/athletes/",
                            json=data
                        )
                    
                    if response.status_code in [200, 201]:
                        result = response.json()
                        new_server_id = result.get('id')
                        
                        # Mark as synced
                        conn = self.db.connect()
                        conn.execute(
                            "UPDATE athletes SET server_id = ?, is_synced = 1, last_synced_at = ? WHERE id = ?",
                            (new_server_id, datetime.now().isoformat(), athlete['id'])
                        )
                        conn.commit()
                        count += 1
                    else:
                        errors.append(f"Athlete {athlete.get('first_name')} {athlete.get('last_name')}: {response.status_code}")
                        
                except Exception as e:
                    errors.append(f"Athlete {athlete.get('first_name')} {athlete.get('last_name')}: {str(e)}")
            
            self.db.log_sync('athletes', 'push', count, True)
            
            if errors:
                error_msg = f"Uploaded {count} athletes. Errors: " + "; ".join(errors[:3])
                return count > 0, error_msg, count
            
            return True, f"Uploaded {count} athletes", count
            
        except Exception as e:
            self.db.log_sync('athletes', 'push', 0, False, str(e))
            return False, f"Push failed: {str(e)}", 0
    
    def push_competitions(self) -> Tuple[bool, str, int]:
        """Upload local unsynced competitions to server"""
        try:
            unsynced = self.db.get_unsynced_competitions()
            
            if not unsynced:
                return True, "No competitions to upload", 0
            
            count = 0
            errors = []
            
            for comp in unsynced:
                try:
                    # Generate slug from title (URL-friendly version)
                    import re
                    title = comp['title']
                    slug = re.sub(r'[^\w\s-]', '', title.lower())  # Remove special chars
                    slug = re.sub(r'[-\s]+', '-', slug)  # Replace spaces with hyphens
                    slug = slug.strip('-')  # Remove leading/trailing hyphens
                    
                    # Make slug unique by appending timestamp if needed
                    from datetime import datetime
                    slug = f"{slug}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
                    
                    # Prepare competition data for API (events endpoint)
                    data = {
                        'title': title,
                        'slug': slug,
                        'description': comp.get('description', ''),
                        'start_date': comp.get('start_date'),
                        'end_date': comp.get('end_date'),
                        'address': comp.get('address', ''),
                        'city': comp.get('city_id'),
                        'event_type': comp.get('event_type', 'competition'),
                        'is_featured': bool(comp.get('is_featured', 0)),
                    }
                    
                    # Create event on server via landing/events endpoint
                    response = self.session.post(
                        f"{self.api_base_url}/landing/events/",
                        json=data
                    )
                    
                    if response.status_code in [200, 201]:
                        result = response.json()
                        server_id = result.get('id')
                        
                        # Update local record with server_id
                        conn = self.db.connect()
                        cursor = conn.cursor()
                        cursor.execute(
                            "UPDATE competitions SET server_id = ?, last_synced_at = ? WHERE id = ?",
                            (server_id, datetime.now().isoformat(), comp['id'])
                        )
                        conn.commit()
                        
                        count += 1
                        print(f"Uploaded competition: {comp['title']}")
                    else:
                        error_msg = f"{comp['title']}: {response.status_code}"
                        errors.append(error_msg)
                        print(f"Failed to upload competition {comp['title']}: {response.text}")
                
                except Exception as e:
                    error_msg = f"{comp['title']}: {str(e)}"
                    errors.append(error_msg)
                    print(f"Error uploading competition {comp['title']}: {str(e)}")
            
            if errors:
                return False, f"Uploaded {count}, errors: {len(errors)}", count
            
            return True, f"Successfully uploaded {count} competitions", count
            
        except Exception as e:
            return False, f"Error uploading competitions: {str(e)}", 0
    
    
    def push_categories(self) -> Tuple[bool, str, int]:
        """Upload local unsynced categories to server"""
        try:
            unsynced = self.db.get_unsynced_categories()
            
            if not unsynced:
                return True, "No categories to upload", 0
            
            count = 0
            errors = []
            
            for cat in unsynced:
                try:
                    # Prepare category data for API
                    data = {
                        'name': cat['name'],
                        'event': cat.get('competition_id'),  # competition_id maps to event
                        'type': cat.get('category_type', 'solo'),
                        'gender': cat.get('gender', 'mixt'),
                    }
                    
                    # Create category on server
                    response = self.session.post(
                        f"{self.api_base_url}/categories/",
                        json=data
                    )
                    
                    if response.status_code in [200, 201]:
                        result = response.json()
                        server_id = result.get('id')
                        
                        # Update local record with server_id
                        conn = self.db.connect()
                        cursor = conn.cursor()
                        cursor.execute(
                            "UPDATE categories SET server_id = ?, last_synced_at = ? WHERE id = ?",
                            (server_id, datetime.now().isoformat(), cat['id'])
                        )
                        conn.commit()
                        
                        count += 1
                        print(f"Uploaded category: {cat['name']}")
                    else:
                        error_msg = f"{cat['name']}: {response.status_code}"
                        errors.append(error_msg)
                        print(f"Failed to upload category {cat['name']}: {response.text}")
                
                except Exception as e:
                    error_msg = f"{cat['name']}: {str(e)}"
                    errors.append(error_msg)
                    print(f"Error uploading category {cat['name']}: {str(e)}")
            
            if errors:
                return False, f"Uploaded {count}, errors: {len(errors)}", count
            
            return True, f"Successfully uploaded {count} categories", count
            
        except Exception as e:
            return False, f"Error uploading categories: {str(e)}", 0
    
    def push_grades(self) -> Tuple[bool, str, int]:
        """Upload local unsynced grades to server"""
        try:
            unsynced = self.db.get_unsynced_grades()
            
            if not unsynced:
                return True, "No grades to upload", 0
            
            count = 0
            errors = []
            
            for grade in unsynced:
                try:
                    # Prepare grade data for API
                    data = {
                        'name': grade['name'],
                        'rank_order': grade.get('rank_order', 0),
                        'grade_type': grade.get('grade_type', 'inferior'),
                    }
                    
                    # Create grade on server
                    response = self.session.post(
                        f"{self.api_base_url}/grades/",
                        json=data
                    )
                    
                    if response.status_code in [200, 201]:
                        result = response.json()
                        server_id = result.get('id')
                        
                        # Update local record with server_id
                        conn = self.db.connect()
                        cursor = conn.cursor()
                        cursor.execute(
                            "UPDATE grades SET server_id = ?, last_synced_at = ? WHERE id = ?",
                            (server_id, datetime.now().isoformat(), grade['id'])
                        )
                        conn.commit()
                        
                        count += 1
                        print(f"Uploaded grade: {grade['name']}")
                    else:
                        error_msg = f"{grade['name']}: {response.status_code}"
                        errors.append(error_msg)
                        print(f"Failed to upload grade {grade['name']}: {response.text}")
                
                except Exception as e:
                    error_msg = f"{grade['name']}: {str(e)}"
                    errors.append(error_msg)
                    print(f"Error uploading grade {grade['name']}: {str(e)}")
            
            if errors:
                return False, f"Uploaded {count}, errors: {len(errors)}", count
            
            return True, f"Successfully uploaded {count} grades", count
            
        except Exception as e:
            return False, f"Error uploading grades: {str(e)}", 0
    
    def push_clubs(self) -> Tuple[bool, str, int]:
        """Upload local unsynced clubs to server"""
        try:
            unsynced = self.db.get_unsynced_clubs()
            
            if not unsynced:
                return True, "No clubs to upload", 0
            
            count = 0
            errors = []
            
            for club in unsynced:
                try:
                    # Prepare club data for API
                    data = {
                        'name': club['name'],
                        'address': club.get('address', ''),
                        'mobile_number': club.get('mobile_number', ''),
                        'website': club.get('website', ''),
                    }
                    
                    # Add city if available
                    if club.get('city_id'):
                        data['city'] = club['city_id']
                    
                    # Create club on server
                    response = self.session.post(
                        f"{self.api_base_url}/clubs/",
                        json=data
                    )
                    
                    if response.status_code in [200, 201]:
                        result = response.json()
                        server_id = result.get('id')
                        
                        # Update local record with server_id
                        conn = self.db.connect()
                        cursor = conn.cursor()
                        cursor.execute(
                            "UPDATE clubs SET server_id = ?, last_synced_at = ? WHERE id = ?",
                            (server_id, datetime.now().isoformat(), club['id'])
                        )
                        conn.commit()
                        
                        count += 1
                        print(f"Uploaded club: {club['name']}")
                    else:
                        error_msg = f"{club['name']}: {response.status_code}"
                        errors.append(error_msg)
                        print(f"Failed to upload club {club['name']}: {response.text}")
                
                except Exception as e:
                    error_msg = f"{club['name']}: {str(e)}"
                    errors.append(error_msg)
                    print(f"Error uploading club {club['name']}: {str(e)}")
            
            if errors:
                return False, f"Uploaded {count}, errors: {len(errors)}", count
            
            return True, f"Successfully uploaded {count} clubs", count
            
        except Exception as e:
            return False, f"Error uploading clubs: {str(e)}", 0
    
    def push_deletions(self) -> Tuple[bool, str, int]:
        """Upload pending deletions to server"""
        try:
            pending = self.db.get_pending_deletions()
            
            if not pending:
                return True, "No deletions to sync", 0
            
            count = 0
            errors = []
            
            # Map entity types to API endpoints
            endpoint_map = {
                'athlete': 'athletes',
                'club': 'clubs',
                'grade': 'grades',
                'competition': 'landing/events',
                'category': 'categories',
                'match': 'matches'
            }
            
            for deletion in pending:
                entity_type = deletion['entity_type']
                server_id = deletion['server_id']
                entity_name = deletion.get('entity_name', f'{entity_type} {server_id}')
                
                endpoint = endpoint_map.get(entity_type)
                if not endpoint:
                    errors.append(f"{entity_name}: Unknown entity type")
                    continue
                
                try:
                    # Send DELETE request to server
                    response = self.session.delete(
                        f"{self.api_base_url}/{endpoint}/{server_id}/"
                    )
                    
                    if response.status_code in [200, 204]:
                        # Mark deletion as synced
                        self.db.mark_deletion_synced(deletion['id'])
                        count += 1
                        print(f"Deleted {entity_type} on server: {entity_name}")
                    elif response.status_code == 404:
                        # Already deleted on server, mark as synced anyway
                        self.db.mark_deletion_synced(deletion['id'])
                        count += 1
                        print(f"{entity_type} already deleted on server: {entity_name}")
                    else:
                        error_msg = f"{entity_name}: {response.status_code}"
                        errors.append(error_msg)
                        print(f"Failed to delete {entity_type} {entity_name}: {response.text}")
                
                except Exception as e:
                    error_msg = f"{entity_name}: {str(e)}"
                    errors.append(error_msg)
                    print(f"Error deleting {entity_type} {entity_name}: {str(e)}")
            
            if errors:
                return False, f"Synced {count} deletions, {len(errors)} errors", count
            
            return True, f"Successfully synced {count} deletions", count
            
        except Exception as e:
            return False, f"Error syncing deletions: {str(e)}", 0
    
    def push_matches(self) -> Tuple[bool, str, int]:
        """Upload match changes (central_referee) to server"""
        try:
            unsynced_matches = self.db.get_unsynced_matches()
            
            if not unsynced_matches:
                return True, "No match changes to upload", 0
            
            uploaded = 0
            errors = []
            
            for match in unsynced_matches:
                server_id = match.get('server_id')
                if not server_id:
                    continue
                
                # Get central_referee athlete ID from name
                central_referee_id = None
                central_referee_name = match.get('central_referee')
                
                if central_referee_name:
                    # Find athlete by name
                    conn = self.db.connect()
                    cursor = conn.cursor()
                    # Parse "First Last" format
                    name_parts = central_referee_name.strip().split(' ', 1)
                    if len(name_parts) == 2:
                        first_name, last_name = name_parts
                        athlete = cursor.execute(
                            "SELECT server_id FROM athletes WHERE first_name = ? AND last_name = ?",
                            (first_name, last_name)
                        ).fetchone()
                        
                        if athlete:
                            central_referee_id = athlete['server_id']
                
                # Get full match data first (required for PUT)
                try:
                    url = f"{self.api_base_url}/matches/{server_id}/"
                    get_response = self.session.get(url)
                    
                    if get_response.status_code != 200:
                        errors.append(f"Match {server_id}: Failed to fetch - {get_response.status_code}")
                        continue
                    
                    # Get existing data and update only central_referee
                    match_data = get_response.json()
                    match_data['central_referee'] = central_referee_id  # Can be None to clear
                    
                    # PUT to update match (full update required)
                    response = self.session.put(url, json=match_data)
                    
                    if response.status_code in [200, 204]:
                        # Mark as synced
                        conn = self.db.connect()
                        cursor = conn.cursor()
                        cursor.execute(
                            "UPDATE matches SET is_synced = 1 WHERE id = ?",
                            (match['id'],)
                        )
                        conn.commit()
                        uploaded += 1
                    else:
                        error_msg = f"Match {server_id}: {response.status_code}"
                        errors.append(error_msg)
                        print(f"Failed to upload match {server_id}: {response.text}")
                
                except Exception as e:
                    error_msg = f"Match {server_id}: {str(e)}"
                    errors.append(error_msg)
                    print(f"Error uploading match {server_id}: {e}")
            
            if errors:
                error_summary = "\n".join(errors[:5])  # Show first 5 errors
                if len(errors) > 5:
                    error_summary += f"\n... and {len(errors) - 5} more errors"
                return False, f"Uploaded {uploaded}, failed {len(errors)}:\n{error_summary}", uploaded
            
            self.db.log_sync('matches', 'push', uploaded, True)
            return True, f"Uploaded {uploaded} match changes", uploaded
            
        except Exception as e:
            self.db.log_sync('matches', 'push', 0, False, str(e))
            return False, f"Push failed: {str(e)}", 0
    
    def push_referee_scores(self) -> Tuple[bool, str, int]:
        """Upload local referee scores to server - NOT IMPLEMENTED
        
        Backend uses RefereePointEvent model for scoring, not RefereeScore.
        Referee scoring is managed through the web application match scoring interface.
        Desktop app is read-only for referee scores.
        """
        return True, "Referee scores are managed on the server", 0
    
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
                    red_corner = match_data.get('red_corner')
                    blue_corner = match_data.get('blue_corner')
                    winner = match_data.get('winner')
                    
                    local_data = {
                        'server_id': match_id,
                        'category_id': category if isinstance(category, int) else (category.get('id') if isinstance(category, dict) else None),
                        'category_name': match_data.get('category_name'),
                        'match_number': match_data.get('id'),  # Use match ID as match number
                        'round': match_data.get('match_type'),  # match_type is the round
                        'athlete1_id': red_corner if isinstance(red_corner, int) else (red_corner.get('id') if isinstance(red_corner, dict) else None),
                        'athlete1_name': match_data.get('red_corner_full_name'),
                        'athlete2_id': blue_corner if isinstance(blue_corner, int) else (blue_corner.get('id') if isinstance(blue_corner, dict) else None),
                        'athlete2_name': match_data.get('blue_corner_full_name'),
                        'winner_id': winner if isinstance(winner, int) else (winner.get('id') if isinstance(winner, dict) else None),
                        'winner_name': match_data.get('winner_name'),
                        'central_referee': match_data.get('central_referee_name'),
                        'status': 'completed' if match_data.get('winner') else 'scheduled',
                        'scheduled_time': match_data.get('scheduled_time'),
                        'last_synced_at': datetime.now().isoformat()
                    }
                    
                    if existing:
                        self.db.update_match(existing['id'], local_data)
                        local_match_id = existing['id']
                    else:
                        local_match_id = self.db.insert_match(local_data)
                    
                    # Sync referees for this match
                    referees_list = match_data.get('referees', [])
                    if referees_list and local_match_id:
                        self._sync_match_referees(local_match_id, referees_list)
                    
                    # Sync referee scores for this match
                    referee_scores = match_data.get('referee_scores', [])
                    if referee_scores and local_match_id:
                        self._sync_referee_scores(local_match_id, match_id, referee_scores)
                    
                    count += 1
                except Exception as e:
                    print(f"Error syncing match {match_data.get('id')}: {e}")
            
            self.db.log_sync('matches', 'pull', count, True)
            return True, f"Downloaded {count} matches", count
            
        except Exception as e:
            print(f"Pull matches failed: {e}")
            self.db.log_sync('matches', 'pull', 0, False, str(e))
            return False, f"Pull failed: {str(e)}", 0
    
    def _sync_match_referees(self, local_match_id: int, referees_list: list):
        """Sync assigned referees for a specific match
        
        Args:
            local_match_id: Local database match ID
            referees_list: List of referee name strings from API
        """
        try:
            conn = self.db.connect()
            
            # Clear existing referees for this match
            conn.execute('DELETE FROM match_referees WHERE match_id = ?', (local_match_id,))
            
            # Insert new referees
            for referee_name in referees_list:
                if referee_name:  # Skip empty names
                    conn.execute(
                        'INSERT INTO match_referees (match_id, referee_name) VALUES (?, ?)',
                        (local_match_id, str(referee_name))
                    )
            
            conn.commit()
            print(f"Synced {len(referees_list)} referees for match {local_match_id}")
        except Exception as e:
            print(f"Error syncing match referees: {e}")
    
    def _sync_referee_scores(self, local_match_id: int, server_match_id: int, referee_scores: list):
        """Sync referee scores for a specific match
        
        Args:
            local_match_id: Local database match ID
            server_match_id: Server match ID
            referee_scores: List of referee score dicts from API (includes rounds array)
        """
        try:
            import json
            
            # First, get existing referee scores for this match
            existing_scores = self.db.get_referee_scores_for_match(local_match_id)
            existing_by_referee = {score.get('referee_name'): score for score in existing_scores}
            
            # Sync each referee score
            for score_data in referee_scores:
                referee_name = score_data.get('referee_name', '')
                rounds = score_data.get('rounds', [])  # Array of {round: 1, red: X, blue: Y}
                total_red = score_data.get('total_red', 0)
                total_blue = score_data.get('total_blue', 0)
                
                # Determine winner
                winner = None
                if total_red > total_blue:
                    winner = 'red'
                elif total_blue > total_red:
                    winner = 'blue'
                
                score_record = {
                    'match_id': local_match_id,
                    'referee_name': referee_name,
                    'red_corner_score': total_red,
                    'blue_corner_score': total_blue,
                    'winner': winner,
                    'rounds': json.dumps(rounds),  # Store rounds as JSON string
                    'last_synced_at': datetime.now().isoformat()
                }
                
                # Check if this referee score already exists
                if referee_name in existing_by_referee:
                    # Update existing score
                    existing_id = existing_by_referee[referee_name]['id']
                    self.db.update_referee_score(existing_id, score_record)
                else:
                    # Insert new score
                    self.db.insert_referee_score(score_record)
            
            print(f"Synced {len(referee_scores)} referee scores for match {server_match_id}")
        except Exception as e:
            print(f"Error syncing referee scores for match {server_match_id}: {e}")
    
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
            
            print(f"Grades API response: {response.status_code}")
            
            if response.status_code != 200:
                print(f"Grades API error: {response.text[:200]}")
                return False, f"Server error: {response.status_code}", 0
            
            grades_data = response.json()
            print(f"Grades data type: {type(grades_data)}, is dict: {isinstance(grades_data, dict)}")
            
            if isinstance(grades_data, dict):
                grades_list = grades_data.get('results', [])
                print(f"Got grades from 'results' key: {len(grades_list)}")
            else:
                grades_list = grades_data
                print(f"Using grades_data directly as list: {len(grades_list)}")
            
            print(f"Found {len(grades_list)} grades to sync")
            if grades_list:
                print(f"First grade: {grades_list[0]}")
            
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
    
    # Grade History Sync
    def pull_grade_history(self, athlete_id: int = None) -> Tuple[bool, str, int]:
        """Pull grade history from API"""
        try:
            url = f"{self.api_base_url}/grade-histories/"
            if athlete_id:
                # Filter by athlete if provided (use server_id)
                url += f"?athlete={athlete_id}"
            
            response = self.session.get(url)
            
            if response.status_code == 401 or response.status_code == 403:
                return False, "Authentication required", 0
            
            if response.status_code != 200:
                return False, f"Server error: {response.status_code}", 0
            
            data = response.json()
            records = data.get('results', []) if isinstance(data, dict) else data
            
            count = 0
            for record in records:
                # Map API data to local schema - match backend model structure
                local_athlete_id = self._get_local_athlete_id(record.get('athlete'))
                
                # Skip if we don't have this athlete locally
                if not local_athlete_id:
                    continue
                
                grade_data = {
                    'server_id': record.get('id'),
                    'athlete_id': local_athlete_id,
                    'athlete_name': record.get('athlete_name', ''),
                    'grade_id': self._get_local_grade_id(record.get('grade')),
                    'grade_name': record.get('grade_name', ''),
                    'obtained_date': record.get('obtained_date', ''),  # Backend uses 'obtained_date' not 'date_earned'
                    'level': record.get('level', 'good'),  # good/bad level
                    'event_id': record.get('event'),
                    'event_name': record.get('event_name', ''),
                    'examiner_1_id': record.get('examiner_1'),
                    'examiner_1_name': record.get('examiner_1_name', ''),
                    'examiner_2_id': record.get('examiner_2'),
                    'examiner_2_name': record.get('examiner_2_name', ''),
                    'submitted_by_athlete': 1 if record.get('submitted_by_athlete') else 0,
                    'status': record.get('status', 'approved'),
                    'submitted_date': record.get('submitted_date', ''),
                    'reviewed_date': record.get('reviewed_date', ''),
                    'reviewed_by_id': record.get('reviewed_by'),
                    'admin_notes': record.get('admin_notes', ''),
                    'last_synced_at': datetime.now().isoformat()
                }
                
                self.db.insert_grade_history(grade_data)
                count += 1
            
            return True, f"Synced {count} grade history records", count
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return False, f"Error pulling grade history: {str(e)}", 0
    
    # Visas Sync
    def pull_visas(self, athlete_id: int = None) -> Tuple[bool, str, int]:
        """Pull visas from API (both medical and annual)"""
        try:
            # Pull from both endpoints since backend has separate endpoints
            total_count = 0
            errors = []
            
            for visa_type, endpoint in [('medical', 'medical-visas'), ('annual', 'annual-visas')]:
                url = f"{self.api_base_url}/{endpoint}/"
                if athlete_id:
                    url += f"?athlete={athlete_id}"
                
                response = self.session.get(url)
                
                if response.status_code == 401 or response.status_code == 403:
                    errors.append(f"{visa_type}: Authentication required")
                    continue
                
                if response.status_code != 200:
                    errors.append(f"{visa_type}: Server error {response.status_code}")
                    continue
                
                data = response.json()
                records = data.get('results', []) if isinstance(data, dict) else data
                
                for record in records:
                    local_athlete_id = self._get_local_athlete_id(record.get('athlete'))
                    
                    # Skip if we don't have this athlete locally
                    if not local_athlete_id:
                        continue
                    
                    # Get athlete name from local database
                    athlete = self.db.get_athlete_by_id(local_athlete_id)
                    athlete_name = f"{athlete.get('first_name', '')} {athlete.get('last_name', '')}" if athlete else ''
                    
                    visa_data = {
                        'server_id': record.get('id'),
                        'athlete_id': local_athlete_id,
                        'athlete_name': athlete_name,
                        'visa_type': visa_type,  # Use endpoint type since API doesn't return it
                        'issued_date': record.get('issued_date', ''),
                        'health_status': record.get('health_status', ''),
                        'visa_status': record.get('visa_status', ''),
                        'is_valid': 1 if record.get('is_valid') else 0,
                        'status': record.get('status', 'approved'),
                        'submitted_date': record.get('submitted_date', ''),
                        'reviewed_date': record.get('reviewed_date', ''),
                        'reviewed_by_id': record.get('reviewed_by'),
                        'admin_notes': record.get('admin_notes', ''),
                        'document': record.get('document', ''),
                        'image': record.get('image', ''),
                        'last_synced_at': datetime.now().isoformat()
                    }
                    
                    self.db.insert_visa(visa_data)
                    total_count += 1
            
            if errors and total_count == 0:
                return False, f"Visa sync errors: {'; '.join(errors)}", 0
            elif errors:
                return True, f"Synced {total_count} visas with warnings: {'; '.join(errors)}", total_count
            else:
                return True, f"Synced {total_count} visa records", total_count
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return False, f"Error pulling visas: {str(e)}", 0
    
    # Athlete Results Sync
    def pull_athlete_results(self, athlete_id: int = None) -> Tuple[bool, str, int]:
        """Pull competition results (placements) from categories API"""
        try:
            # Get all categories
            url = f"{self.api_base_url}/categories/"
            
            response = self.session.get(url)
            
            if response.status_code == 401 or response.status_code == 403:
                return False, "Authentication required", 0
            
            if response.status_code != 200:
                return False, f"Server error: {response.status_code}", 0
            
            data = response.json()
            categories = data.get('results', []) if isinstance(data, dict) else data
            
            # Extract placements from each category
            count = 0
            for category in categories:
                category_id = category.get('id')
                category_name = category.get('name', '')
                category_type = category.get('type', 'solo')  # solo, fight, teams
                event_name = category.get('competition_name') or category.get('event_name', '')
                event_id = category.get('event')
                
                # For solo and fight categories: get placements from first_place, second_place, third_place
                if category_type in ['solo', 'fight']:
                    placements = [
                        (category.get('first_place'), 1),
                        (category.get('second_place'), 2),
                        (category.get('third_place'), 3)
                    ]
                    
                    for athlete_data, rank in placements:
                        if not athlete_data:
                            continue
                        
                        # Extract athlete ID
                        if isinstance(athlete_data, dict):
                            athlete_id_from_api = athlete_data.get('id')
                            athlete_name = f"{athlete_data.get('first_name', '')} {athlete_data.get('last_name', '')}".strip()
                        else:
                            athlete_id_from_api = athlete_data
                            athlete_name = ''
                        
                        local_athlete_id = self._get_local_athlete_id(athlete_id_from_api)
                        
                        # Skip if we don't have this athlete locally
                        if not local_athlete_id:
                            continue
                        
                        # Get athlete name from local DB if not in API response
                        if not athlete_name:
                            athlete = self.db.get_athlete_by_id(local_athlete_id)
                            athlete_name = f"{athlete.get('first_name', '')} {athlete.get('last_name', '')}" if athlete else ''
                        
                        result_data = {
                            'server_id': f"{category_id}_{athlete_id_from_api}_{rank}",
                            'athlete_id': local_athlete_id,
                            'athlete_name': athlete_name,
                            'category_id': category_id,
                            'category_name': category_name,
                            'event_id': event_id,
                            'event_title': event_name,
                            'score': 0,
                            'rank': rank,
                            'result_type': category_type,
                            'status': 'approved',
                            'submitted_date': '',
                            'reviewed_date': '',
                            'reviewed_by_id': None,
                            'admin_notes': '',
                            'last_synced_at': datetime.now().isoformat()
                        }
                        
                        self.db.insert_athlete_result(result_data)
                        count += 1
                
                # For team categories: get results from CategoryAthleteScore
                elif category_type == 'teams':
                    # Get athlete scores for this team category
                    scores_url = f"{self.api_base_url}/category-athlete-score/?category={category_id}&type=teams"
                    scores_response = self.session.get(scores_url)
                    
                    if scores_response.status_code != 200:
                        continue
                    
                    scores_data = scores_response.json()
                    scores = scores_data.get('results', []) if isinstance(scores_data, dict) else scores_data
                    
                    for score_record in scores:
                        # Get athlete info from the score record
                        athlete_data = score_record.get('athlete')
                        if isinstance(athlete_data, dict):
                            athlete_id_from_api = athlete_data.get('id')
                            athlete_name = athlete_data.get('name', '')
                        else:
                            athlete_id_from_api = athlete_data
                            athlete_name = ''
                        
                        # Skip if no athlete
                        if not athlete_id_from_api:
                            continue
                        
                        local_athlete_id = self._get_local_athlete_id(athlete_id_from_api)
                        
                        if not local_athlete_id:
                            continue
                        
                        # Get athlete name from local DB if not in API response
                        if not athlete_name:
                            athlete = self.db.get_athlete_by_id(local_athlete_id)
                            athlete_name = f"{athlete.get('first_name', '')} {athlete.get('last_name', '')}" if athlete else ''
                        
                        # Get placement from placement_claimed field
                        placement = score_record.get('placement_claimed', '')
                        rank = None
                        if placement:
                            if '1st' in placement or placement == '1':
                                rank = 1
                            elif '2nd' in placement or placement == '2':
                                rank = 2
                            elif '3rd' in placement or placement == '3':
                                rank = 3
                        
                        # Get team name
                        team_name = score_record.get('team_name', '')
                        display_name = f"{athlete_name} (Team: {team_name})" if team_name else athlete_name
                        
                        result_data = {
                            'server_id': score_record.get('id'),
                            'athlete_id': local_athlete_id,
                            'athlete_name': display_name,
                            'category_id': category_id,
                            'category_name': category_name,
                            'event_id': event_id,
                            'event_title': event_name,
                            'score': 0,
                            'rank': rank,
                            'result_type': 'teams',
                            'status': score_record.get('status', 'approved'),
                            'submitted_date': score_record.get('submitted_date', ''),
                            'reviewed_date': score_record.get('reviewed_date', ''),
                            'reviewed_by_id': score_record.get('reviewed_by'),
                            'admin_notes': f"Team: {team_name}" if team_name else '',
                            'last_synced_at': datetime.now().isoformat()
                        }
                        
                        self.db.insert_athlete_result(result_data)
                        count += 1
            
            return True, f"Synced {count} competition results", count
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return False, f"Error pulling results: {str(e)}", 0
    
    def _get_local_athlete_id(self, server_athlete_id: int) -> int:
        """Get local athlete ID from server ID"""
        if not server_athlete_id:
            return None
        
        conn = self.db.connect()
        cursor = conn.cursor()
        result = cursor.execute(
            "SELECT id FROM athletes WHERE server_id = ?",
            (server_athlete_id,)
        ).fetchone()
        
        return result['id'] if result else None
    
    def _get_local_grade_id(self, server_grade_id: int) -> int:
        """Get local grade ID from server ID"""
        if not server_grade_id:
            return None
        
        conn = self.db.connect()
        cursor = conn.cursor()
        result = cursor.execute(
            "SELECT id FROM grades WHERE server_id = ?",
            (server_grade_id,)
        ).fetchone()
        
        return result['id'] if result else None

