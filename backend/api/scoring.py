from typing import Dict, Any, Iterable, Optional, Tuple
from collections import defaultdict

from .models import RefereePointEvent, RefereeScore, Match


def compute_match_results(match: Match, events: Optional[Iterable[RefereePointEvent]] = None) -> Dict[str, Any]:
    """
    Compute per-referee raw and adjusted totals and determine per-referee winners and match winner.

    Parameters
    - match: Match instance
    - events: optional iterable of RefereePointEvent; if None, will query all events for the match

    Returns a dict with keys:
    - per_ref: mapping referee_id -> {red, blue, adj_red, adj_blue, winner}
    - central_penalties: {'red': int, 'blue': int}
    - match_winner: Athlete instance or None
    """
    if events is None:
        events_qs = RefereePointEvent.objects.filter(match=match).order_by('timestamp')
    else:
        # If events provided as queryset or list, use as-is
        events_qs = events

    # Support per-round scoring. Round number can be stored in event.metadata['round']
    # If not present, default to round 1.
    per_ref = defaultdict(lambda: defaultdict(lambda: {'red': 0, 'blue': 0}))  # per_ref[referee_id][round] -> {red, blue}
    central_penalties_by_round = defaultdict(lambda: {'red': 0, 'blue': 0})
    central_id = getattr(match, 'central_referee_id', None)

    for e in events_qs:
        try:
            rd = 1
            if getattr(e, 'metadata', None):
                rd = int(e.metadata.get('round', 1)) if isinstance(e.metadata, dict) and e.metadata.get('round') is not None else 1
        except Exception:
            rd = 1
        rid = e.referee_id
        # Only treat 'score' events as raw referee contributions. Penalty events
        # should not be included in the raw totals used to proportionally
        # allocate central penalties.
        if getattr(e, 'event_type', None) == 'score':
            per_ref[rid][rd][e.side] = per_ref[rid][rd].get(e.side, 0) + (e.points or 0)
        # Treat an event as a central penalty if either:
        # - it was created by the match central_referee (existing behavior), OR
        # - it has explicit metadata flag metadata['central'] set truthy (admin convenience)
        is_central_pen = False
        try:
            meta = e.metadata if isinstance(e.metadata, dict) else {}
        except Exception:
            meta = {}
        if e.event_type == 'penalty':
            if central_id and e.referee_id == central_id:
                is_central_pen = True
            elif meta.get('central'):
                is_central_pen = True

        if is_central_pen:
            central_penalties_by_round[rd][e.side] = central_penalties_by_round[rd].get(e.side, 0) + (e.points or 0)

    # If there are existing RefereeScore rows (manually entered), include their
    # raw red/blue totals for referees that have no events yet. This ensures that
    # inline RefereeScore rows (entered directly in admin) are considered when
    # computing winners even if no RefereePointEvent rows exist for them.
    try:
        from .models import RefereeScore
        for rs in RefereeScore.objects.filter(match=match):
            rid = rs.referee_id
            if rid not in per_ref:
                # store as round 1 values
                per_ref[rid][1]['red'] = (rs.red_corner_score or 0)
                per_ref[rid][1]['blue'] = (rs.blue_corner_score or 0)
    except Exception:
        # If the RefereeScore model can't be imported for some reason, skip this step.
        pass

    # Now compute aggregated totals per referee taking rounds into account. For
    # each referee we compute raw totals per round and adjusted totals by
    # allocating the central referee penalties for the matching round across
    # referees. We use a proportional allocation: for each round and corner
    # (red/blue) we compute the total raw points across all referees and
    # subtract from each referee a share of the central penalty proportional
    # to their raw contribution. If everyone has zero raw points in a round
    # the penalty is split evenly across referees.
    per_ref_results = {}
    referee_scores_data = []

    # Pre-compute per-round totals across referees so we can allocate penalties
    rounds_totals = defaultdict(lambda: {'red': 0, 'blue': 0})
    for rid, rounds_map in per_ref.items():
        for rd, sums in rounds_map.items():
            rounds_totals[rd]['red'] += sums.get('red', 0) or 0
            rounds_totals[rd]['blue'] += sums.get('blue', 0) or 0
    for rid, rounds_map in per_ref.items():
        total_red = 0
        total_blue = 0
        total_adj_red = 0
        total_adj_blue = 0
        rounds_detail = {}
        for rd, sums in rounds_map.items():
            raw_red = sums.get('red', 0)
            raw_blue = sums.get('blue', 0)
            pen = central_penalties_by_round.get(rd, {'red': 0, 'blue': 0})

            # Apply the full central adjustment to each referee (not proportional allocation)
            # Negative values are penalties (subtracted), positive are additions
            allocated_red_pen = pen.get('red', 0) or 0
            allocated_blue_pen = pen.get('blue', 0) or 0

            adj_red = raw_red + allocated_red_pen
            adj_blue = raw_blue + allocated_blue_pen
            rounds_detail[rd] = {'red': raw_red, 'blue': raw_blue, 'adj_red': adj_red, 'adj_blue': adj_blue}
            total_red += raw_red
            total_blue += raw_blue
            total_adj_red += adj_red
            total_adj_blue += adj_blue

        if total_adj_red > total_adj_blue:
            winner = 'red'
        elif total_adj_blue > total_adj_red:
            winner = 'blue'
        else:
            winner = None

        per_ref_results[rid] = {
            'rounds': rounds_detail,
            'red': total_red,
            'blue': total_blue,
            'adj_red': total_adj_red,
            'adj_blue': total_adj_blue,
            'winner': winner,
        }
        referee_scores_data.append((rid, total_red, total_blue, winner))

    # Determine match winner by majority of per-ref winners (>=3), otherwise by total adjusted points
    votes_red = sum(1 for v in per_ref_results.values() if v.get('winner') == 'red')
    votes_blue = sum(1 for v in per_ref_results.values() if v.get('winner') == 'blue')

    match_winner = None
    if votes_red >= 3 and votes_red > votes_blue:
        match_winner = match.red_corner
    elif votes_blue >= 3 and votes_blue > votes_red:
        match_winner = match.blue_corner
    else:
        # tie-breaker: sum adjusted points across referees
        total_adj_red = sum(v.get('adj_red', 0) for v in per_ref_results.values())
        total_adj_blue = sum(v.get('adj_blue', 0) for v in per_ref_results.values())
        if total_adj_red > total_adj_blue:
            match_winner = match.red_corner
        elif total_adj_blue > total_adj_red:
            match_winner = match.blue_corner
        else:
            match_winner = None

    # Also provide an aggregated central_penalties total across all rounds for
    # backward compatibility with callers that expect central_penalties['red'].
    agg_central = {'red': 0, 'blue': 0}
    for rd, vals in central_penalties_by_round.items():
        agg_central['red'] += vals.get('red', 0) or 0
        agg_central['blue'] += vals.get('blue', 0) or 0

    return {
        'per_ref': per_ref_results,
        'referee_scores_data': referee_scores_data,
        'central_penalties': agg_central,
        'central_penalties_by_round': dict(central_penalties_by_round),
        'match_winner': match_winner,
        'votes': {'red': votes_red, 'blue': votes_blue},
    }
