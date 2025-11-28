"""
Management command to migrate Competition → Event relationships
This migrates:
1. Category.competition → Category.event
2. Group.competition → Group.event
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from datetime import datetime, time
from api.models import Category, Group, Competition
from landing.models import Event


class Command(BaseCommand):
    help = 'Migrate data from Competition to Event model for Categories and Groups'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be migrated without making changes',
        )

    def make_aware(self, date_obj):
        """Convert date to timezone-aware datetime"""
        if date_obj is None:
            return None
        if isinstance(date_obj, datetime):
            return timezone.make_aware(date_obj) if timezone.is_naive(date_obj) else date_obj
        # Convert date to datetime at midnight
        dt = datetime.combine(date_obj, time.min)
        return timezone.make_aware(dt)

    @transaction.atomic
    def handle(self, *args, **options):
        dry_run = options['dry_run']
        
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be made'))
        
        # Step 1: Find or create Event for each Competition
        comp_to_event = {}
        competitions = Competition.objects.all()
        
        self.stdout.write(f'\nFound {competitions.count()} competitions')
        
        for comp in competitions:
            # Convert dates to timezone-aware datetime
            start_dt = self.make_aware(comp.start_date)
            end_dt = self.make_aware(comp.end_date)
            
            # Try to find existing Event with matching name/date
            event = Event.objects.filter(
                title=comp.name,
                start_date=start_dt
            ).first()
            
            if not event:
                # Create new Event from Competition
                if not dry_run:
                    event = Event.objects.create(
                        title=comp.name,
                        slug=f"{comp.name.lower().replace(' ', '-')}-{comp.id}",
                        description=f'Migrated from Competition: {comp.name}',
                        start_date=start_dt,
                        end_date=end_dt or start_dt,  # Use start_date if end_date is None
                        address=comp.place or '',
                        event_type='competition',
                    )
                    self.stdout.write(
                        self.style.SUCCESS(f'Created Event: {event.title}')
                    )
                else:
                    self.stdout.write(
                        self.style.WARNING(f'Would create Event: {comp.name}')
                    )
            else:
                self.stdout.write(
                    self.style.SUCCESS(f'Found existing Event: {event.title}')
                )
            
            comp_to_event[comp.id] = event
        
        # Step 2: Migrate Categories
        categories = Category.objects.filter(competition__isnull=False, event__isnull=True)
        self.stdout.write(f'\nMigrating {categories.count()} categories from Competition to Event')
        
        migrated_categories = 0
        for category in categories:
            event = comp_to_event.get(category.competition_id)
            if event:
                if not dry_run:
                    category.event = event
                    category.save(update_fields=['event'])
                    migrated_categories += 1
                    self.stdout.write(f'  ✓ Category "{category.name}" → Event "{event.title}"')
                else:
                    self.stdout.write(
                        self.style.WARNING(f'  Would migrate Category "{category.name}" → Event "{comp_to_event.get(category.competition_id).title if not dry_run else category.competition.name}"')
                    )
        
        if not dry_run:
            self.stdout.write(
                self.style.SUCCESS(f'\nMigrated {migrated_categories} categories to Event model')
            )
        
        # Step 3: Migrate Groups
        groups = Group.objects.filter(competition__isnull=False, event__isnull=True)
        self.stdout.write(f'\nMigrating {groups.count()} groups from Competition to Event')
        
        migrated_groups = 0
        for group in groups:
            event = comp_to_event.get(group.competition_id)
            if event:
                if not dry_run:
                    group.event = event
                    group.save(update_fields=['event'])
                    migrated_groups += 1
                    self.stdout.write(f'  ✓ Group "{group.name}" → Event "{event.title}"')
                else:
                    self.stdout.write(
                        self.style.WARNING(f'  Would migrate Group "{group.name}" → Event "{comp_to_event.get(group.competition_id).title if not dry_run else group.competition.name}"')
                    )
        
        if not dry_run:
            self.stdout.write(
                self.style.SUCCESS(f'\nMigrated {migrated_groups} groups to Event model')
            )
        
        # Summary
        self.stdout.write('\n' + '='*60)
        if dry_run:
            self.stdout.write(
                self.style.WARNING('DRY RUN COMPLETE - No changes were made')
            )
            self.stdout.write('Run without --dry-run to apply changes')
        else:
            self.stdout.write(
                self.style.SUCCESS('MIGRATION COMPLETE')
            )
            self.stdout.write(f'  • {len(comp_to_event)} Events created/found')
            self.stdout.write(f'  • {migrated_categories} Categories migrated')
            self.stdout.write(f'  • {migrated_groups} Groups migrated')
        self.stdout.write('='*60 + '\n')
