"""
Management command to populate database with dummy data for testing
Usage: python manage.py populate_dummy_data
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from api.models import (
    Club, Athlete, GradeHistory, Competition, Category,
    CategoryAthleteScore, TrainingSeminar, TrainingSeminarParticipation
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
            GradeHistory.objects.all().delete()
            Athlete.objects.all().delete()
            Category.objects.all().delete()
            Competition.objects.all().delete()
            TrainingSeminar.objects.all().delete()
            Club.objects.all().delete()
            User.objects.filter(is_superuser=False).delete()
            self.stdout.write(self.style.SUCCESS('✓ Data cleared'))

        self.stdout.write(self.style.SUCCESS('Populating database with dummy data...'))

        # Create clubs
        clubs = self.create_clubs()
        self.stdout.write(self.style.SUCCESS(f'✓ Created {len(clubs)} clubs'))

        # Create users and athletes
        athletes = self.create_athletes(clubs)
        self.stdout.write(self.style.SUCCESS(f'✓ Created {len(athletes)} athletes'))

        # Create grade history
        grades = self.create_grade_history(athletes)
        self.stdout.write(self.style.SUCCESS(f'✓ Created {len(grades)} grade records'))

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

    def create_clubs(self):
        club_data = [
            {'name': 'CS Vovinam București', 'city': 'București', 'contact_email': 'contact@vovinam-bucuresti.ro'},
            {'name': 'Vovinam Cluj-Napoca', 'city': 'Cluj-Napoca', 'contact_email': 'info@vovinam-cluj.ro'},
            {'name': 'CS Dragon Timișoara', 'city': 'Timișoara', 'contact_email': 'dragon@vovinam-tm.ro'},
            {'name': 'Vovinam Iași', 'city': 'Iași', 'contact_email': 'contact@vovinam-iasi.ro'},
            {'name': 'CS Phoenix Brașov', 'city': 'Brașov', 'contact_email': 'phoenix@vovinam-brasov.ro'},
            {'name': 'Vovinam Constanța', 'city': 'Constanța', 'contact_email': 'info@vovinam-constanta.ro'},
        ]
        
        clubs = []
        for data in club_data:
            club, created = Club.objects.get_or_create(**data)
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
            athlete, created = Athlete.objects.get_or_create(
                user=user,
                defaults={
                    'first_name': first_name,
                    'last_name': last_name,
                    'birth_date': f'{birth_year}-{random.randint(1, 12):02d}-{random.randint(1, 28):02d}',
                    'gender': random.choice(['M', 'F']),
                    'club': club,
                    'current_grade': random.choice(['white', 'yellow', 'blue', 'red', 'black1']),
                    'weight_category': random.choice(['under_50', 'under_60', 'under_70', 'over_70']),
                    'status': random.choice(['approved', 'approved', 'approved', 'pending']),
                    'phone': f'+4072{random.randint(1000000, 9999999)}',
                    'email': email,
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
            date = datetime.now().date() - timedelta(days=random.randint(30, 365))
            comp, created = Competition.objects.get_or_create(
                name=name,
                defaults={
                    'date': date,
                    'location': random.choice(['București', 'Cluj', 'Timișoara', 'Iași']),
                    'type': random.choice(['national', 'international', 'regional']),
                    'status': 'completed',
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
                
                for rank, athlete in enumerate(selected_athletes[:3], start=1):  # Top 3 get medals
                    CategoryAthleteScore.objects.get_or_create(
                        category=category,
                        athlete=athlete,
                        defaults={
                            'rank': rank,
                            'points': random.randint(50, 100),
                            'status': 'approved',
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
            date = datetime.now().date() - timedelta(days=random.randint(30, 200))
            seminar, created = TrainingSeminar.objects.get_or_create(
                title=topic,
                defaults={
                    'date': date,
                    'location': random.choice(['București', 'Cluj', 'Timișoara']),
                    'duration_hours': random.choice([4, 8, 16]),
                    'instructor_name': random.choice(['Master Nguyen', 'Master Lee', 'Master Ion']),
                    'description': f'Seminar intensiv de {topic.lower()}',
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
