import json

from django.core.management.base import BaseCommand, CommandError
from django.core.serializers.json import DjangoJSONEncoder

from api.sync.export_event_results import build_event_results_pack


class Command(BaseCommand):
    help = 'Export event operational results JSON payload from a local event server.'

    def add_arguments(self, parser):
        parser.add_argument('--event-id', type=int, required=True, help='Event ID to export.')
        parser.add_argument('--output', dest='output_path', type=str, help='Destination JSON file path.')
        parser.add_argument('--indent', type=int, default=2, help='JSON indentation. Defaults to 2.')

    def handle(self, *args, **options):
        event_id = options['event_id']
        output_path = options.get('output_path')
        indent = options['indent']

        try:
            payload = build_event_results_pack(event_id=event_id)
        except ValueError as exc:
            raise CommandError(str(exc)) from exc

        serialized = json.dumps(payload, cls=DjangoJSONEncoder, indent=indent, ensure_ascii=False)

        if output_path:
            with open(output_path, 'w', encoding='utf-8') as handle:
                handle.write(serialized)
                handle.write('\n')
            self.stdout.write(self.style.SUCCESS(f'Event results exported to {output_path}'))
            return

        self.stdout.write(serialized)