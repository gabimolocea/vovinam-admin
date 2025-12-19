#!/usr/bin/env python3
"""
Comprehensive test data creation script for FRVV Admin
Creates users, athletes, clubs, categories, events, and competition results
"""
import os
import sys
import django
from datetime import date, datetime, timedelta
from decimal import Decimal

# Django setup
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'crud.settings')
django.setup()

from django.contrib.auth import get_user_model
from api.models import (
    City, Grade, Club, Athlete, Category, Team,
    CategoryAthlete, CategoryAthleteScore, CategoryTeamScore,
    Group, FederationRole, Title
)
from landing.models import Event

User = get_user_model()

def create_test_data():
    print("=" * 70)
    print("Creating Test Data for FRVV Admin")
    print("=" * 70)
    
    # 1. Create Cities
    print("\n[1/10] Creating cities...")
    cities = []
    city_names = ['București', 'Cluj-Napoca', 'Timișoara', 'Iași', 'Constanța', 'Brașov']
    for city_name in city_names:
        city, created = City.objects.get_or_create(name=city_name)
        cities.append(city)
        if created:
            print(f"  ✓ Created city: {city_name}")
        else:
            print(f"  → City already exists: {city_name}")
    
    # 2. Create Grades
    print("\n[2/10] Creating grades...")
    grades_data = [
        ('Cap Vo', 10, 'superior'),
        ('Cap Nhat', 9, 'superior'),
        ('Cap Nhi', 8, 'superior'),
        ('Cap Tam', 7, 'superior'),
        ('Dai Thanh', 6, 'superior'),
        ('Dai Lam', 5, 'inferior'),
        ('Dai Luc', 4, 'inferior'),
        ('Dai Hoang', 3, 'inferior'),
        ('Dai Hong', 2, 'inferior'),
        ('Dai Trang', 1, 'inferior'),
    ]
    grades = {}
    for name, rank, grade_type in grades_data:
        grade, created = Grade.objects.get_or_create(
            name=name,
            defaults={'rank_order': rank, 'grade_type': grade_type}
        )
        grades[name] = grade
        if created:
            print(f"  ✓ Created grade: {name} (Rank: {rank}, Type: {grade_type})")
        else:
            print(f"  → Grade already exists: {name}")
    
    # 3. Create Clubs
    print("\n[3/10] Creating clubs...")
    clubs_data = [
        ('CS Vovinam București', cities[0]),
        ('CS Vovinam Cluj', cities[1]),
        ('CS Vovinam Timișoara', cities[2]),
        ('CS Vovinam Iași', cities[3]),
        ('CS Vovinam Constanța', cities[4]),
    ]
    clubs = []
    for club_name, city in clubs_data:
        club, created = Club.objects.get_or_create(
            name=club_name,
            defaults={'city': city, 'address': f'Str. Sportului 1, {city.name}'}
        )
        clubs.append(club)
        if created:
            print(f"  ✓ Created club: {club_name}")
        else:
            print(f"  → Club already exists: {club_name}")
    
    # 4. Create Users
    print("\n[4/10] Creating users...")
    users = {}
    
    # Create admin user
    if not User.objects.filter(email='admin@frvv.ro').exists():
        admin = User.objects.create_superuser(
            username='admin',
            email='admin@frvv.ro',
            password='admin123',
            first_name='Admin',
            last_name='FRVV',
            role='admin'
        )
        users['admin'] = admin
        print(f"  ✓ Created admin: {admin.email} (password: admin123)")
    else:
        users['admin'] = User.objects.get(email='admin@frvv.ro')
        print(f"  → Admin already exists: admin@frvv.ro")
    
    # Create athlete users (with gender)
    athletes_data = [
        ('Ion', 'Popescu', 'ion.popescu@email.com', date(2005, 3, 15), clubs[0], 'male'),
        ('Maria', 'Ionescu', 'maria.ionescu@email.com', date(2006, 7, 22), clubs[0], 'female'),
        ('Andrei', 'Georgescu', 'andrei.georgescu@email.com', date(2004, 11, 8), clubs[1], 'male'),
        ('Elena', 'Dumitrescu', 'elena.dumitrescu@email.com', date(2007, 2, 14), clubs[1], 'female'),
        ('Mihai', 'Popa', 'mihai.popa@email.com', date(2005, 9, 30), clubs[2], 'male'),
        ('Ana', 'Radu', 'ana.radu@email.com', date(2006, 4, 18), clubs[2], 'female'),
        ('Alexandru', 'Stoica', 'alex.stoica@email.com', date(2008, 1, 5), clubs[3], 'male'),
        ('Ioana', 'Marin', 'ioana.marin@email.com', date(2007, 10, 27), clubs[3], 'female'),
        ('Cristian', 'Vasile', 'cristian.vasile@email.com', date(2005, 6, 12), clubs[4], 'male'),
        ('Sofia', 'Constantin', 'sofia.constantin@email.com', date(2006, 12, 3), clubs[4], 'female'),
    ]
    
    athletes = []
    for first_name, last_name, email, dob, club, gender in athletes_data:
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                'username': email.split('@')[0],
                'first_name': first_name,
                'last_name': last_name,
                'role': 'athlete',
                'date_of_birth': dob,
                'city': club.city
            }
        )
        if created:
            user.set_password('athlete123')
            user.save()
            print(f"  ✓ Created athlete user: {first_name} {last_name} ({email})")
        else:
            print(f"  → Athlete user already exists: {email}")
        users[email] = user
    
    # Create supporter users
    supporters_data = [
        ('Maria', 'Parent', 'maria.parent@email.com'),
        ('Ion', 'Supporter', 'ion.supporter@email.com'),
    ]
    
    for first_name, last_name, email in supporters_data:
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                'username': email.split('@')[0],
                'first_name': first_name,
                'last_name': last_name,
                'role': 'supporter'
            }
        )
        if created:
            user.set_password('supporter123')
            user.save()
            print(f"  ✓ Created supporter user: {first_name} {last_name} ({email})")
        else:
            print(f"  → Supporter user already exists: {email}")
        users[email] = user
    
    # 5. Create Athlete Profiles
    print("\n[5/10] Creating athlete profiles...")
    for first_name, last_name, email, dob, club, gender in athletes_data:
        user = users[email]
        athlete, created = Athlete.objects.get_or_create(
            user=user,
            defaults={
                'first_name': first_name,
                'last_name': last_name,
                'gender': gender,
                'club': club,
                'city': club.city,
                'date_of_birth': dob,
                'current_grade': grades['Dai Thanh'],
                'status': 'approved',
                'approved_date': datetime.now(),
                'approved_by': users['admin'],
                'registered_date': date.today() - timedelta(days=365),
                'expiration_date': date.today() + timedelta(days=365),
            }
        )
        if created:
            print(f"  ✓ Created athlete profile: {first_name} {last_name} ({gender})")
            athletes.append(athlete)
        else:
            # Update existing athlete with names and gender if missing
            updated = False
            if not athlete.first_name or not athlete.last_name:
                athlete.first_name = first_name
                athlete.last_name = last_name
                updated = True
            if not athlete.gender:
                athlete.gender = gender
                updated = True
            if updated:
                athlete.save()
                print(f"  ✓ Updated athlete profile: {first_name} {last_name} ({gender})")
            else:
                print(f"  → Athlete profile already exists: {first_name} {last_name} ({gender})")
            athletes.append(athlete)
    
    # 6. Create Groups (optional - simplified)
    print("\n[6/10] Skipping competition groups (optional feature)...")
    groups = [None, None, None, None]  # Placeholders
    print("  → Groups are optional and competition-specific")
    
    # 7. Create Events (Competitions)
    print("\n[7/10] Creating events (competitions)...")
    events = []
    events_data = [
        ('Campionatul Național 2025', 'competition', date(2025, 6, 15), date(2025, 6, 17), cities[0]),
        ('Cupa României 2025', 'competition', date(2025, 9, 10), date(2025, 9, 11), cities[1]),
        ('Turneu International București', 'competition', date(2025, 11, 5), date(2025, 11, 7), cities[0]),
    ]
    
    for title, event_type, start, end, city in events_data:
        slug = title.lower().replace(' ', '-').replace('ț', 't').replace('ă', 'a').replace('î', 'i')
        event, created = Event.objects.get_or_create(
            slug=slug,
            defaults={
                'title': title,
                'description': f'<p>Descriere completă pentru {title}. Eveniment de {event_type}.</p>',
                'start_date': datetime.combine(start, datetime.min.time()),
                'end_date': datetime.combine(end, datetime.max.time()) if end else None,
                'city': city,
                'event_type': event_type,
                'address': f'Arena Sportivă, {city.name}',
                'price': Decimal('50.00'),
                'is_featured': True
            }
        )
        events.append(event)
        if created:
            print(f"  ✓ Created event: {title} ({start})")
        else:
            print(f"  → Event already exists: {title}")
    
    # 8. Create Categories
    print("\n[8/10] Creating categories...")
    categories = []
    categories_data = [
        # Campionatul Național categories
        ('Quyền Thiếu niên Nam (Forms Youth Male)', 'solo', 'male', events[0]),
        ('Quyền Thiếu niên Nữ (Forms Youth Female)', 'solo', 'female', events[0]),
        ('Song luyện Thanh niên (Duo Forms Adult)', 'teams', 'mixt', events[0]),
        ('Đối kháng 55kg Nam (Combat 55kg Male)', 'fight', 'male', events[0]),
        ('Đối kháng 60kg Nữ (Combat 60kg Female)', 'fight', 'female', events[0]),
        ('Đòn chân Thanh niên Nam (Leg Techniques Adult Male)', 'solo', 'male', events[0]),
        # Cupa României categories
        ('Quyền Trưởng thành Nam (Forms Senior Male)', 'solo', 'male', events[1]),
        ('Song luyện Thiếu niên (Duo Forms Youth)', 'teams', 'mixt', events[1]),
        ('Đối kháng 65kg Nam (Combat 65kg Male)', 'fight', 'male', events[1]),
    ]
    
    for cat_name, cat_type, gender, event in categories_data:
        category, created = Category.objects.get_or_create(
            name=cat_name,
            event=event,
            defaults={
                'type': cat_type,
                'gender': gender,
            }
        )
        categories.append(category)
        if created:
            print(f"  ✓ Created category: {cat_name}")
        else:
            print(f"  → Category already exists: {cat_name}")
    
    # 9. Enroll Athletes in Categories
    print("\n[9/10] Enrolling athletes in categories...")
    enrollments = 0
    
    # Enroll athletes in quyền (forms) categories based on gender
    male_forms_category = categories[0]  # Quyền Thiếu niên Nam
    female_forms_category = categories[1]  # Quyền Thiếu niên Nữ
    
    # Enroll male athletes in male forms
    for athlete in [athletes[0], athletes[2], athletes[4]]:  # Ion, Andrei, Mihai
        enrollment, created = CategoryAthlete.objects.get_or_create(
            category=male_forms_category,
            athlete=athlete
        )
        if created:
            enrollments += 1
            print(f"  ✓ Enrolled {athlete.user.first_name} {athlete.user.last_name} in {male_forms_category.name}")
    
    # Enroll female athletes in female forms
    for athlete in [athletes[1], athletes[3], athletes[5]]:  # Maria, Elena, Ana
        enrollment, created = CategoryAthlete.objects.get_or_create(
            category=female_forms_category,
            athlete=athlete
        )
        if created:
            enrollments += 1
            print(f"  ✓ Enrolled {athlete.user.first_name} {athlete.user.last_name} in {female_forms_category.name}")
    
    # Create teams for Song luyện (duo forms) and enroll in team category
    print("\n[9.5/10] Creating teams for Song luyện...")
    from api.models import CategoryTeam, TeamMember
    
    song_luyen_category = categories[2]  # Song luyện Thanh niên
    
    team1, created = Team.objects.get_or_create(
        name='Song luyện București - Ion & Maria'
    )
    if created:
        # Add team members (duo)
        TeamMember.objects.get_or_create(team=team1, athlete=athletes[0])
        TeamMember.objects.get_or_create(team=team1, athlete=athletes[1])
        print(f"  ✓ Created song luyện team: {team1.name}")
    else:
        print(f"  → Song luyện team already exists: {team1.name}")
    
    team2, created = Team.objects.get_or_create(
        name='Song luyện Cluj - Andrei & Elena'
    )
    if created:
        # Add team members (duo)
        TeamMember.objects.get_or_create(team=team2, athlete=athletes[2])
        TeamMember.objects.get_or_create(team=team2, athlete=athletes[3])
        print(f"  ✓ Created song luyện team: {team2.name}")
    else:
        print(f"  → Song luyện team already exists: {team2.name}")
    
    # Enroll teams in song luyện category
    CategoryTeam.objects.get_or_create(category=song_luyen_category, team=team1)
    CategoryTeam.objects.get_or_create(category=song_luyen_category, team=team2)
    print(f"  ✓ Total enrolled: {enrollments} athletes + 2 song luyện teams")
    
    # 10. Create Competition Results
    print("\n[10/10] Creating competition results...")
    results = 0
    
    # Create scores for Quyền Thiếu niên Nam (male forms)
    category_male_forms = categories[0]
    enrolled_athletes = CategoryAthlete.objects.filter(category=category_male_forms)
    
    placements = ['1st', '2nd', '3rd']
    for i, enrollment in enumerate(enrolled_athletes[:3]):
        score, created = CategoryAthleteScore.objects.get_or_create(
            athlete=enrollment.athlete,
            category=category_male_forms,
            defaults={
                'score': int(95 - i * 5),  # Scores: 95, 90, 85
                'placement_claimed': placements[i],
                'type': 'solo',
                'status': 'approved',
                'submitted_by_athlete': False,  # Submitted by referee/admin
                'reviewed_by': users['admin'],
                'reviewed_date': datetime.now(datetime.now().astimezone().tzinfo)
            }
        )
        if created:
            results += 1
            print(f"  ✓ Created Quyền result for {enrollment.athlete.user.first_name}: Score {score.score}, Place {score.placement_claimed}")
        else:
            print(f"  → Quyền result already exists for {enrollment.athlete.user.first_name}")
    
    # Create a referee athlete for song luyện scoring
    referee_athlete = athletes[0]  # Use first athlete as referee for demo
    referee_athlete.is_referee = True
    referee_athlete.save()
    
    # Create song luyện (duo forms) scores
    song_luyen_category = categories[2]
    team_score1, created = CategoryTeamScore.objects.get_or_create(
        team=team1,
        category=song_luyen_category,
        referee=referee_athlete,
        defaults={
            'score': 92,  # Song luyện scores are typically out of 100
        }
    )
    if created:
        results += 1
        print(f"  ✓ Created Song luyện result: {team1.name} - Score 92/100")
    else:
        print(f"  → Song luyện result already exists: {team1.name}")
    
    team_score2, created = CategoryTeamScore.objects.get_or_create(
        team=team2,
        category=song_luyen_category,
        referee=referee_athlete,
        defaults={
            'score': 88,
        }
    )
    if created:
        results += 1
        print(f"  ✓ Created Song luyện result: {team2.name} - Score 88/100")
    else:
        print(f"  → Song luyện result already exists: {team2.name}")
    
    print(f"\n{'=' * 70}")
    print("Test Data Creation Summary")
    print(f"{'=' * 70}")
    print(f"  Cities: {City.objects.count()}")
    print(f"  Grades: {Grade.objects.count()}")
    print(f"  Clubs: {Club.objects.count()}")
    print(f"  Users: {User.objects.count()}")
    print(f"  Athletes: {Athlete.objects.count()}")
    print(f"  Events: {Event.objects.count()}")
    print(f"  Categories: {Category.objects.count()}")
    print(f"  Category Enrollments: {CategoryAthlete.objects.count()}")
    print(f"  Teams: {Team.objects.count()}")
    print(f"  Competition Results: {CategoryAthleteScore.objects.count() + CategoryTeamScore.objects.count()}")
    print(f"{'=' * 70}")
    print("\n✅ Test data created successfully!")
    print("\nLogin Credentials:")
    print("  Admin: admin@frvv.ro / admin123")
    print("  Athlete: ion.popescu@email.com / athlete123")
    print("  Supporter: maria.parent@email.com / supporter123")
    print(f"\n{'=' * 70}\n")

if __name__ == '__main__':
    try:
        create_test_data()
    except Exception as e:
        print(f"\n❌ Error creating test data: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
