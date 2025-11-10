from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from api.models import Match, RefereePointEvent, RefereeScore
from api.scoring import compute_match_results

class Command(BaseCommand):
    help = 'Aggregate unprocessed RefereePointEvent rows into RefereeScore and update Match winner.'

    def add_arguments(self, parser):
        parser.add_argument('--match', type=int, help='Match ID to aggregate (optional). If omitted, aggregates all matches with pending events.')

    def handle(self, *args, **options):
        match_id = options.get('match')
        qs = Match.objects.all()
        if match_id:
            qs = qs.filter(pk=match_id)

        matches = qs
        total = 0
        for match in matches:
            events = list(RefereePointEvent.objects.filter(match=match, processed=False).order_by('timestamp'))
            if not events:
                continue
            total += 1
            self.stdout.write(f'Aggregating match {match.pk} - {len(events)} events')
            with transaction.atomic():
                # Use centralized scoring logic to compute per-referee and match results
                results = compute_match_results(match, events)

                referee_scores = []
                for (rid, red, blue, winner) in results.get('referee_scores_data', []):
                    rs, created = RefereeScore.objects.update_or_create(
                        match=match,
                        referee_id=rid,
                        defaults={'red_corner_score': red, 'blue_corner_score': blue, 'winner': winner}
                    )
                    referee_scores.append(rs)

                match_winner = results.get('match_winner')
                if match.winner != match_winner:
                    match.winner = match_winner
                    match.save()

                # mark events processed
                RefereePointEvent.objects.filter(pk__in=[e.pk for e in events]).update(processed=True)

                self.stdout.write(self.style.SUCCESS(f'Aggregated match {match.pk}: winner={match.winner}'))

        self.stdout.write(self.style.SUCCESS(f'Processed {total} matches'))
