"""
Management command to populate database with dummy data for testing
Usage: python manage.py populate_dummy_data
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from api.models import (
    Club, Athlete, GradeHistory, Competition, Category,
    CategoryAthleteScore, TrainingSeminar, TrainingSeminarParticipation, Grade, City
)
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
            CategoryAthleteScore.objects.all().delete()
            TrainingSeminarParticipation.objects.all().delete()
            Athlete.objects.all().delete()
            Category.objects.all().delete()
            Competition.objects.all().delete()
            TrainingSeminar.objects.all().delete()
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

        # Create competitions
        competitions = self.create_competitions()
        self.stdout.write(self.style.SUCCESS(f'✓ Created {len(competitions)} competitions'))

        # Create competition categories and scores
        categories = self.create_competition_categories(competitions, athletes)
        self.stdout.write(self.style.SUCCESS(f'✓ Created {len(categories)} competition categories with scores'))

        # Create training seminars
        seminars = self.create_seminars()
        self.stdout.write(self.style.SUCCESS(f'✓ Created {len(seminars)} training seminars'))

        # Create seminar participations
        participations = self.create_seminar_participations(seminars, athletes)
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

    def create_competitions(self):
        comp_names = [
            'Campionatul Național Vovinam',
            'Cupa României',
            'Open București',
            'Campionatul Regional Est',
            'Memorial Patriarhul Vovinam',
        ]
        
        competitions = []
        for i, name in enumerate(comp_names):
            start_date = datetime.now().date() - timedelta(days=random.randint(30, 365))
            end_date = start_date + timedelta(days=random.randint(1, 3))
            
            comp, created = Competition.objects.get_or_create(
                name=name,
                defaults={
                    'place': random.choice(['București', 'Cluj-Napoca', 'Timișoara', 'Iași']),
                    'start_date': start_date,
                    'end_date': end_date,
                }
            )
            competitions.append(comp)
        
        return competitions

    def create_competition_categories(self, competitions, athletes):
        categories = []
        
        for competition in competitions:
            # Create 4-6 categories per competition
            for i in range(random.randint(4, 6)):
                gender = random.choice(['male', 'female', 'mixt'])
                cat_type = random.choice(['solo', 'fight'])
                
                category, created = Category.objects.get_or_create(
                    competition=competition,
                    name=f'{gender.title()} {cat_type.title()} {i+1}',
                    defaults={
                        'gender': gender,
                        'type': cat_type,
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

    def create_seminars(self):
        seminar_topics = [
            'Tehnici de bază Vovinam',
            'Perfecționare centuri negre',
            'Arbitraj internațional',
            'Metodica predării',
            'Don Chan - tehnici avansate',
        ]
        
        seminars = []
        for topic in seminar_topics:
            start_date = datetime.now().date() - timedelta(days=random.randint(30, 200))
            end_date = start_date + timedelta(days=random.randint(1, 2))
            
            seminar, created = TrainingSeminar.objects.get_or_create(
                name=topic,
                defaults={
                    'place': random.choice(['București', 'Cluj-Napoca', 'Timișoara']),
                    'start_date': start_date,
                    'end_date': end_date,
                }
            )
            seminars.append(seminar)
        
        return seminars

    def create_seminar_participations(self, seminars, athletes):
        participations = []
        
        for seminar in seminars:
            # 10-20 athletes per seminar
            selected_athletes = random.sample(athletes, min(random.randint(10, 20), len(athletes)))
            
            for athlete in selected_athletes:
                participation, created = TrainingSeminarParticipation.objects.get_or_create(
                    seminar=seminar,
                    athlete=athlete,
                    defaults={
                        'status': random.choice(['approved', 'approved', 'pending']),
                        'certificate_issued': random.choice([True, False]),
                    }
                )
                participations.append(participation)
        
        return participations
