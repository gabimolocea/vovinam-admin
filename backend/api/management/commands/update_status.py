"""
Management command to update category and match statuses and numbers.

Usage:
    python manage.py update_status --help
    python manage.py update_status category 16 --status in_progress
    python manage.py update_status match 2 --status completed
    python manage.py update_status category 15 --number F-MALE-1
"""

from django.core.management.base import BaseCommand, CommandError
from api.models import Category, Match


class Command(BaseCommand):
    help = 'Update status and number for categories and matches'

    def add_arguments(self, parser):
        parser.add_argument(
            'model',
            type=str,
            choices=['category', 'match'],
            help='Type of object to update (category or match)'
        )
        parser.add_argument(
            'id',
            type=int,
            nargs='?',  # Make ID optional
            help='ID of the category or match'
        )
        parser.add_argument(
            '--status',
            type=str,
            choices=['not_started', 'in_progress', 'completed'],
            help='New status to set'
        )
        parser.add_argument(
            '--number',
            type=str,
            help='New identifier number to set'
        )
        parser.add_argument(
            '--list',
            action='store_true',
            help='List all objects with their current status and numbers'
        )

    def handle(self, *args, **options):
        if options['list']:
            self.list_objects(options['model'])
            return

        if not options['id']:
            raise CommandError('ID is required when not using --list')

        model_class = Category if options['model'] == 'category' else Match
        obj_id = options['id']
        
        try:
            obj = model_class.objects.get(id=obj_id)
        except model_class.DoesNotExist:
            raise CommandError(f'{options["model"].capitalize()} with ID {obj_id} does not exist')

        updated_fields = []
        
        if options['status']:
            old_status = obj.status
            obj.status = options['status']
            updated_fields.append('status')
            self.stdout.write(
                self.style.SUCCESS(f'Status: {old_status} → {options["status"]}')
            )
        
        if options['number']:
            field_name = 'category_number' if options['model'] == 'category' else 'match_number'
            old_number = getattr(obj, field_name)
            setattr(obj, field_name, options['number'])
            updated_fields.append(field_name)
            self.stdout.write(
                self.style.SUCCESS(f'Number: {old_number} → {options["number"]}')
            )
        
        if updated_fields:
            obj.save(update_fields=updated_fields)
            self.stdout.write(
                self.style.SUCCESS(f'Successfully updated {options["model"]} #{obj_id}: {obj}')
            )
        else:
            self.stdout.write(
                self.style.WARNING('No updates specified. Use --status or --number')
            )

    def list_objects(self, model_type):
        """List all objects with their status and numbers"""
        if model_type == 'category':
            categories = Category.objects.all().order_by('id')
            self.stdout.write(self.style.SUCCESS('\nCategories:'))
            self.stdout.write('-' * 80)
            for cat in categories:
                status_color = {
                    'not_started': self.style.WARNING,
                    'in_progress': self.style.HTTP_INFO,
                    'completed': self.style.SUCCESS,
                }.get(cat.status, self.style.NOTICE)
                
                self.stdout.write(
                    f'ID: {cat.id:3d} | {cat.category_number:10s} | '
                    f'{status_color(cat.status.ljust(12))} | {cat.name}'
                )
        else:
            matches = Match.objects.all().order_by('id')
            self.stdout.write(self.style.SUCCESS('\nMatches:'))
            self.stdout.write('-' * 80)
            for match in matches:
                status_color = {
                    'not_started': self.style.WARNING,
                    'in_progress': self.style.HTTP_INFO,
                    'completed': self.style.SUCCESS,
                }.get(match.status, self.style.NOTICE)
                
                self.stdout.write(
                    f'ID: {match.id:3d} | {match.match_number:15s} | '
                    f'{status_color(match.status.ljust(12))} | {match.name}'
                )
