from django.core.management.base import BaseCommand
from django.utils import timezone

from api.participations import record_participations
from landing.models import Event


class Command(BaseCommand):
    help = 'Gives a "Participare" result to every athlete enrolled in a competition category who did not place.'

    def add_arguments(self, parser):
        parser.add_argument('--event', type=int, help='Only this event id. Default: every competition that has ended.')

    def handle(self, *args, **options):
        if options['event']:
            events = Event.objects.filter(pk=options['event'])
        else:
            events = Event.objects.filter(
                event_types__icontains=Event.type_query_value('competition'),
                end_date__lt=timezone.now(),
            )
        total = 0
        for event in events:
            recorded = record_participations(event)
            total += recorded
            if recorded:
                self.stdout.write(f'{event.title}: {recorded}')
        self.stdout.write(self.style.SUCCESS(f'Participări înregistrate: {total}'))
