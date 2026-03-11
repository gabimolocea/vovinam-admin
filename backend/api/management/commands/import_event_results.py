import json

from django.core.management.base import BaseCommand, CommandError

from api.sync.import_event_results import import_event_results


class Command(BaseCommand):
    help = 'Import event operational results JSON payload into the cloud database.'

    def add_arguments(self, parser):
        parser.add_argument('--input', dest='input_path', type=str, required=True, help='Source JSON file path.')

    def handle(self, *args, **options):
        input_path = options['input_path']

        try:
            with open(input_path, 'r', encoding='utf-8') as handle:
                payload = json.load(handle)
        except FileNotFoundError as exc:
            raise CommandError(f'Input file was not found: {input_path}') from exc
        except json.JSONDecodeError as exc:
            raise CommandError(f'Input file is not valid JSON: {exc}') from exc

        try:
            result = import_event_results(payload)
        except Exception as exc:
            if isinstance(exc, CommandError):
                raise
            raise CommandError(str(exc)) from exc

        self.stdout.write(self.style.SUCCESS(f"Imported event results for event {result['event_id']}"))
        for section, count in sorted(result.get('imported', {}).items()):
            self.stdout.write(f' - {section}: {count}')