"""
Management command to populate database with dummy data for testing
Usage: python manage.py populate_dummy_data
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone
from api.models import (
    Club, Athlete, GradeHistory, Competition, Category,
    CategoryAthleteScore, TrainingSeminar, TrainingSeminarParticipation, 
    Grade, City, Group, Match
)
from landing.models import Event
from datetime import datetime, timedelta
import random

User = get_user_model()


class Command(BaseCommand):
    help = 'Populate database with dummy data for testing'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing data before populating',
        )

    def handle(self, *args, **options):
        if options['clear']:
            self.stdout.write(self.style.WARNING('Clearing existing data...'))
            Match.objects.all().delete()
            CategoryAthleteScore.objects.all().delete()
            TrainingSeminarParticipation.objects.all().delete()
            Athlete.objects.all().delete()
            Category.objects.all().delete()
            Group.objects.all().delete()
            Competition.objects.all().delete()
            TrainingSeminar.objects.all().delete()
            Event.objects.all().delete()
            Club.objects.all().delete()
            City.objects.all().delete()
            User.objects.filter(is_superuser=False).delete()
            self.stdout.write(self.style.SUCCESS('✓ Data cleared'))

        self.stdout.write(self.style.SUCCESS('Populating database with dummy data...'))

        # Create cities
        cities = self.create_cities()
        self.stdout.write(self.style.SUCCESS(f'✓ Created {len(cities)} cities'))

        # Create clubs
        clubs = self.create_clubs(cities)
        self.stdout.write(self.style.SUCCESS(f'✓ Created {len(clubs)} clubs'))

        # Create users and athletes
        athletes = self.create_athletes(clubs)
        self.stdout.write(self.style.SUCCESS(f'✓ Created {len(athletes)} athletes'))

        # Skip grade history - requires Grade FK setup
        # grades = self.create_grade_history(athletes)
        # self.stdout.write(self.style.SUCCESS(f'✓ Created {len(grades)} grade records'))

        # Create events (competitions, seminars, examinations)
        events = self.create_events(cities)
        self.stdout.write(self.style.SUCCESS(f'✓ Created {len(events)} events'))

        # Create competitions (link to events)
        competitions = self.create_competitions(events)
        self.stdout.write(self.style.SUCCESS(f'✓ Created {len(competitions)} competitions'))

        # Create groups for competitions
        groups = self.create_groups(competitions)
        self.stdout.write(self.style.SUCCESS(f'✓ Created {len(groups)} groups'))

        # Create competition categories and scores
        categories = self.create_competition_categories(competitions, groups, athletes)
        self.stdout.write(self.style.SUCCESS(f'✓ Created {len(categories)} competition categories with scores'))

        # Create matches for fight categories
        matches = self.create_matches(categories, athletes)
        self.stdout.write(self.style.SUCCESS(f'✓ Created {len(matches)} matches'))

        # Create training seminars (link to events)
        seminars = self.create_seminars(events)
        self.stdout.write(self.style.SUCCESS(f'✓ Created {len(seminars)} training seminars'))

        # Create seminar participations (link to events)
        participations = self.create_seminar_participations(seminars, athletes, events)
        self.stdout.write(self.style.SUCCESS(f'✓ Created {len(participations)} seminar participations'))

        self.stdout.write(self.style.SUCCESS('\n✅ Database populated successfully!'))

    def create_cities(self):
        city_names = ['București', 'Cluj-Napoca', 'Timișoara', 'Iași', 'Brașov', 'Constanța']
        cities = []
        
        for city_name in city_names:
            city, created = City.objects.get_or_create(name=city_name)
            cities.append(city)
        
        return cities

    def create_clubs(self, cities):
        club_data = [
            {'name': 'CS Vovinam București', 'city_name': 'București'},
            {'name': 'Vovinam Cluj-Napoca', 'city_name': 'Cluj-Napoca'},
            {'name': 'CS Dragon Timișoara', 'city_name': 'Timișoara'},
            {'name': 'Vovinam Iași', 'city_name': 'Iași'},
            {'name': 'CS Phoenix Brașov', 'city_name': 'Brașov'},
            {'name': 'Vovinam Constanța', 'city_name': 'Constanța'},
        ]
        
        # Create a city lookup dict
        city_lookup = {city.name: city for city in cities}
        
        clubs = []
        for data in club_data:
            city = city_lookup[data['city_name']]
            club, created = Club.objects.get_or_create(
                name=data['name'],
                defaults={'city': city}
            )
            clubs.append(club)
        
        return clubs

    def create_athletes(self, clubs):
        first_names = ['Alex', 'Diana', 'Radu', 'Ana', 'Cristian', 'Ioana', 'Vlad', 'Elena', 'Mihai', 'Andreea']
        last_names = ['Popescu', 'Ionescu', 'Popa', 'Dumitru', 'Stan', 'Moldovan', 'Georgescu', 'Marinescu']
        
        athletes = []
        for i in range(30):
            first_name = random.choice(first_names)
            last_name = random.choice(last_names)
            club = random.choice(clubs)
            
            # Create user
            username = f'{first_name.lower()}.{last_name.lower()}{i}'
            email = f'{username}@example.com'
            
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    'email': email,
                    'first_name': first_name,
                    'last_name': last_name,
                    'role': 'athlete',
                }
            )
            if created:
                user.set_password('password123')
                user.save()
            
            # Create athlete
            birth_year = random.randint(1995, 2012)
            date_of_birth = f'{birth_year}-{random.randint(1, 12):02d}-{random.randint(1, 28):02d}'
            
            athlete, created = Athlete.objects.get_or_create(
                user=user,
                defaults={
                    'first_name': first_name,
                    'last_name': last_name,
                    'date_of_birth': date_of_birth,
                    'club': club,
                    'status': random.choice(['approved', 'approved', 'approved', 'pending']),
                    'mobile_number': f'+4072{random.randint(1000000, 9999999)}',
                }
            )
            athletes.append(athlete)
        
        return athletes

    def create_grade_history(self, athletes):
        grades = []
        grade_progression = [
            'white', 'yellow', 'blue', 'red', 'black1', 'black2', 'black3'
        ]
        
        for athlete in athletes:
            current_grade_index = grade_progression.index(athlete.current_grade)
            
            # Create history for previous grades
            for i in range(current_grade_index + 1):
                date_awarded = datetime.now().date() - timedelta(days=random.randint(180, 730) * (current_grade_index - i))
                
                grade, created = GradeHistory.objects.get_or_create(
                    athlete=athlete,
                    grade=grade_progression[i],
                    defaults={
                        'date_awarded': date_awarded,
                        'status': 'approved',
                        'reviewed_date': date_awarded,
                    }
                )
                grades.append(grade)
        
        return grades

    def create_events(self, cities):
        """Create Event objects (from landing app) for competitions, seminars, and examinations"""
        event_data = [
            {'title': 'Campionatul Național Vovinam 2025', 'type': 'competition', 'city': 'București'},
            {'title': 'Cupa României - Ediția de Primăvară', 'type': 'competition', 'city': 'Cluj-Napoca'},
            {'title': 'Open București - Turneu Internațional', 'type': 'competition', 'city': 'București'},
            {'title': 'Campionatul Regional Est', 'type': 'competition', 'city': 'Iași'},
            {'title': 'Memorial Patriarhul Vovinam', 'type': 'competition', 'city': 'Timișoara'},
            {'title': 'Seminar Tehnici de Bază', 'type': 'training_seminar', 'city': 'București'},
            {'title': 'Seminar Perfecționare Centuri Negre', 'type': 'training_seminar', 'city': 'Cluj-Napoca'},
            {'title': 'Curs Arbitraj Internațional', 'type': 'training_seminar', 'city': 'Timișoara'},
            {'title': 'Examen Centuri - Sesiunea de Vară', 'type': 'examination', 'city': 'București'},
            {'title': 'Examen Centuri Superioare', 'type': 'examination', 'city': 'Cluj-Napoca'},
        ]
        
        city_lookup = {city.name: city for city in cities}
        events = []
        
        for i, data in enumerate(event_data):
            start_date = timezone.now() - timedelta(days=random.randint(30, 365))
            end_date = start_date + timedelta(days=random.randint(1, 3))
            city = city_lookup[data['city']]
            
            # Generate slug from title
            slug = data['title'].lower().replace(' ', '-').replace('ă', 'a').replace('â', 'a').replace('î', 'i').replace('ș', 's').replace('ț', 't')
            slug = f"{slug}-{i}"  # Add index to ensure uniqueness
            
            event, created = Event.objects.get_or_create(
                slug=slug,
                defaults={
                    'title': data['title'],
                    'event_type': data['type'],
                    'start_date': start_date,
                    'end_date': end_date,
                    'city': city,
                    'description': f'Eveniment {data["type"]} organizat în {data["city"]}.',
                    'address': f'Sala de Sport, {data["city"]}',
                    'is_featured': random.choice([True, False]),
                }
            )
            events.append(event)
        
        return events

    def create_competitions(self, events):
        """Create Competition objects and link them to events"""
        comp_events = [e for e in events if e.event_type == 'competition']
        competitions = []
        
        for event in comp_events:
            comp, created = Competition.objects.get_or_create(
                name=event.title,
                defaults={
                    'place': event.city.name if event.city else 'Unknown',
                    'start_date': event.start_date.date(),
                    'end_date': event.end_date.date() if event.end_date else event.start_date.date(),
                }
            )
            competitions.append(comp)
        
        return competitions

    def create_groups(self, competitions):
        """Create groups for competitions"""
        groups = []
        
        for competition in competitions:
            # Create 2-4 groups per competition
            for i in range(random.randint(2, 4)):
                group_name = f'{competition.name} - Group {chr(65 + i)}'  # A, B, C, D
                group, created = Group.objects.get_or_create(
                    name=group_name,
                    defaults={'competition': competition}
                )
                groups.append(group)
        
        return groups

    def create_competition_categories(self, competitions, groups, athletes):
        categories = []
        
        for competition in competitions:
            comp_groups = [g for g in groups if g.competition == competition]
            
            # Create 4-6 categories per competition
            for i in range(random.randint(4, 6)):
                gender = random.choice(['male', 'female', 'mixt'])
                cat_type = random.choice(['solo', 'fight', 'teams'])
                group = random.choice(comp_groups) if comp_groups else None
                
                category, created = Category.objects.get_or_create(
                    competition=competition,
                    name=f'{gender.title()} {cat_type.title()} {i+1}',
                    defaults={
                        'gender': gender,
                        'type': cat_type,
                        'group': group,
                    }
                )
                
                # Add 3-8 athletes to this category via CategoryAthleteScore
                selected_athletes = random.sample(athletes, min(random.randint(3, 8), len(athletes)))
                
                placements = ['1st', '2nd', '3rd']
                for idx, athlete in enumerate(selected_athletes[:3]):  # Top 3 get medals
                    CategoryAthleteScore.objects.get_or_create(
                        category=category,
                        athlete=athlete,
                        defaults={
                            'type': cat_type,
                            'score': random.randint(50, 100),
                            'placement_claimed': placements[idx],
                            'status': 'approved',
                            'submitted_by_athlete': False,  # Submitted by referee/admin
                        }
                    )
                
                categories.append(category)
        
        return categories

    def create_matches(self, categories, athletes):
        """Create matches for fight categories"""
        matches = []
        fight_categories = [c for c in categories if c.type == 'fight']
        
        # Get referee athletes
        referees = list(athletes[:5])  # Use first 5 athletes as referees
        for ref in referees:
            ref.is_referee = True
            ref.save()
        
        for category in fight_categories:
            # Get athletes in this category
            category_athletes = list(category.athlete_scores.all().values_list('athlete', flat=True))
            category_athletes = list(Athlete.objects.filter(id__in=category_athletes))
            
            if len(category_athletes) < 2:
                continue
                
            # Create 2-4 matches per fight category
            for _ in range(min(random.randint(2, 4), len(category_athletes) // 2)):
                if len(category_athletes) < 2:
                    break
                    
                red_corner = random.choice(category_athletes)
                category_athletes.remove(red_corner)
                blue_corner = random.choice(category_athletes)
                category_athletes.remove(blue_corner)
                
                match_type = random.choice(['qualifications', 'semi-finals', 'finals'])
                winner = random.choice([red_corner, blue_corner])
                
                # Use create instead of get_or_create to avoid duplicates
                match = Match.objects.create(
                    category=category,
                    red_corner=red_corner,
                    blue_corner=blue_corner,
                    match_type=match_type,
                    winner=winner,
                    central_referee=random.choice(referees),
                )
                
                # Add referees to match
                match.referees.add(*random.sample(referees, min(3, len(referees))))
                
                matches.append(match)
        
        return matches

    def create_seminars(self, events):
        """Create TrainingSeminar objects and link them to events"""
        seminar_events = [e for e in events if e.event_type in ['training_seminar', 'examination']]
        seminars = []
        
        for event in seminar_events:
            seminar, created = TrainingSeminar.objects.get_or_create(
                name=event.title,
                defaults={
                    'place': event.city.name if event.city else 'Unknown',
                    'start_date': event.start_date.date(),
                    'end_date': event.end_date.date() if event.end_date else event.start_date.date(),
                }
            )
            seminars.append(seminar)
        
        return seminars

    def create_seminar_participations(self, seminars, athletes, events):
        """Create seminar participations and link to events"""
        participations = []
        
        # Create a mapping of seminar names to events
        event_map = {e.title: e for e in events if e.event_type in ['training_seminar', 'examination']}
        
        for seminar in seminars:
            # 10-20 athletes per seminar
            selected_athletes = random.sample(athletes, min(random.randint(10, 20), len(athletes)))
            event = event_map.get(seminar.name)
            
            for athlete in selected_athletes:
                participation, created = TrainingSeminarParticipation.objects.get_or_create(
                    seminar=seminar,
                    athlete=athlete,
                    defaults={
                        'status': random.choice(['approved', 'approved', 'pending']),
                        'submitted_by_athlete': False,  # Admin submission
                        'event': event,  # Link to the corresponding event
                    }
                )
                participations.append(participation)
        
        return participations
