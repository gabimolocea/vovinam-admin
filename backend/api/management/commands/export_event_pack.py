import json

from django.core.management.base import BaseCommand, CommandError
from django.core.serializers.json import DjangoJSONEncoder

from api.sync.export_event_pack import build_event_pack
from landing.models import Event


class Command(BaseCommand):
    help = 'Export an event pack JSON payload for local event bootstrap.'

    def add_arguments(self, parser):
        parser.add_argument('--event-id', type=int, required=True, help='Event ID to export.')
        parser.add_argument('--output', dest='output_path', type=str, help='Destination JSON file path.')
        parser.add_argument('--indent', type=int, default=2, help='JSON indentation. Defaults to 2.')

    def handle(self, *args, **options):
        event_id = options['event_id']
        output_path = options.get('output_path')
        indent = options['indent']

        try:
            payload = build_event_pack(event_id=event_id)
        except ValueError as exc:
            raise CommandError(str(exc)) from exc

        serialized = json.dumps(payload, cls=DjangoJSONEncoder, indent=indent, ensure_ascii=False)

        if output_path:
            with open(output_path, 'w', encoding='utf-8') as handle:
                handle.write(serialized)
                handle.write('\n')

            event = Event.objects.get(pk=payload['event']['id'])
            event.mark_exported_to_local(exported_at=payload['manifest']['exported_at'])
            event.save(update_fields=['sync_mode', 'sync_locked', 'local_sync_status', 'exported_to_local_at'])

            self.stdout.write(self.style.SUCCESS(f'Event pack exported to {output_path}'))
            return

        event = Event.objects.get(pk=payload['event']['id'])
        event.mark_exported_to_local(exported_at=payload['manifest']['exported_at'])
        event.save(update_fields=['sync_mode', 'sync_locked', 'local_sync_status', 'exported_to_local_at'])

        self.stdout.write(serialized)