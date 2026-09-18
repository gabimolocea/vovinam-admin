"""Server-side tool functions the AI assistant (api/assistant.py) can call
on Claude's behalf.

This module is the *real* security boundary for the assistant: every
function derives the caller's role/club from `user` (an actual Django
User, never an id the model supplies as an argument) and re-applies the
same checks the REST endpoints already use. api/assistant.py's system
prompt tells Claude about the caller's role for a coherent conversation,
but that's context, not enforcement - it must never be the only thing
standing between a coach and another club's data.

Write tools (enroll_athlete/unenroll_athlete) never touch the database
directly - they validate and return a `requires_confirmation` proposal;
the actual write happens only via execute_confirmed_tool(), called from
views/assistant.py's AssistantConfirmView after the user confirms in the
chat UI (see the plan's "write actions require an explicit confirm step"
decision).
"""
from django.db.models import Q
from django.utils import timezone

from .models import Athlete, Club, Category, CategoryAthlete, Competition
from .views._common import _get_effective_coach_registration_deadline
from .views.enrollments import enroll_category_athlete, unenroll_category_athlete


def _own_club_id(user):
    athlete = getattr(user, 'athlete', None)
    return getattr(athlete, 'club_id', None)


def _visible_club_ids(user, event):
    """Which clubs' enrollment data `user` may see for `event` right now.

    `None` means no restriction (admin, or the coach registration
    deadline has already passed - the same moment the rest of the app
    opens visibility to everyone, see AdminCentralizatorMatrix.jsx's
    canSeeAllClubs). A set means "only these clubs" - a coach before the
    deadline sees only their own club, matching visibleClubs in the same
    frontend file. This is the fix for a gap that otherwise exists only
    in the frontend: the REST endpoints the matrix UI calls return every
    club's data unfiltered, so a naive tool wrapping them directly would
    leak other clubs' rosters/counts to a coach before the deadline."""
    if getattr(user, 'is_admin', False):
        return None
    deadline = _get_effective_coach_registration_deadline(event)
    if deadline and timezone.now() > deadline:
        return None
    club_id = _own_club_id(user)
    return {club_id} if club_id else set()


def _serialize_athlete(athlete):
    return {
        'id': athlete.id,
        'first_name': athlete.first_name,
        'last_name': athlete.last_name,
        'club_id': athlete.club_id,
        'club_name': athlete.club.name if athlete.club_id else None,
        'gender': athlete.gender,
        'date_of_birth': athlete.date_of_birth.isoformat() if athlete.date_of_birth else None,
    }


# --- Read tools ------------------------------------------------------

def tool_list_clubs(user, **_kwargs):
    clubs = Club.objects.select_related('city').order_by('name').values('id', 'name', 'city__name')
    return {'clubs': [{'id': c['id'], 'name': c['name'], 'city': c['city__name']} for c in clubs]}


def tool_search_athletes(user, query=None, **_kwargs):
    """Search athletes by name. A coach only ever sees their own club's
    roster here, regardless of what the search text is - silently
    constrained rather than an error, since this is informational."""
    qs = Athlete.objects.select_related('club').filter(status='approved')
    if not getattr(user, 'is_admin', False):
        own_club_id = _own_club_id(user)
        if not own_club_id:
            return {'athletes': []}
        qs = qs.filter(club_id=own_club_id)
    if query:
        qs = qs.filter(Q(first_name__icontains=query) | Q(last_name__icontains=query))
    qs = qs.order_by('last_name', 'first_name')[:25]
    return {'athletes': [_serialize_athlete(a) for a in qs]}


def tool_get_athlete(user, athlete_id=None, **_kwargs):
    if not athlete_id:
        return {'error': 'athlete_id este obligatoriu.'}
    try:
        athlete = Athlete.objects.select_related('club').get(pk=athlete_id)
    except Athlete.DoesNotExist:
        return {'error': 'Sportivul nu a fost găsit.'}
    if not getattr(user, 'is_admin', False) and athlete.club_id != _own_club_id(user):
        return {'error': 'Poți vedea doar sportivi din clubul tău.'}
    data = _serialize_athlete(athlete)
    data['status'] = athlete.status
    return data


def tool_list_competitions(user, upcoming_only=True, **_kwargs):
    qs = Competition.objects.all()
    if upcoming_only:
        qs = qs.filter(start_date__gte=timezone.now())
    qs = qs.order_by('start_date')[:15]
    result = []
    for ev in qs:
        deadline = _get_effective_coach_registration_deadline(ev)
        result.append({
            'id': ev.id,
            'name': ev.title,
            'start_date': ev.start_date.isoformat() if ev.start_date else None,
            'coach_registration_deadline': deadline.isoformat() if deadline else None,
        })
    return {'competitions': result}


def tool_list_categories(user, event_id=None, **_kwargs):
    """Categories for a competition, with per-category enrollment counts
    and rosters scoped to what `user` is currently allowed to see (see
    _visible_club_ids) - for a coach before the deadline this deliberately
    omits both the names AND the count for other clubs, matching what the
    Centralizator UI already shows them."""
    if not event_id:
        return {'error': 'event_id este obligatoriu.'}
    try:
        event = Competition.objects.get(pk=event_id)
    except Competition.DoesNotExist:
        return {'error': 'Competiția nu a fost găsită.'}

    visible_club_ids = _visible_club_ids(user, event)
    categories = Category.objects.filter(event_id=event_id).select_related('group').prefetch_related(
        'enrolled_athletes__athlete__club',
    ).order_by('display_order', 'id')

    result = []
    for cat in categories:
        all_entries = list(cat.enrolled_athletes.all())
        if visible_club_ids is None:
            visible_entries = all_entries
        else:
            visible_entries = [e for e in all_entries if e.athlete.club_id in visible_club_ids]
        result.append({
            'id': cat.id,
            'name': cat.name,
            'type': cat.type,
            'gender': cat.gender,
            'group': cat.group.name if cat.group_id else None,
            'enrolled_count': len(visible_entries),
            'enrolled_athletes': [
                {
                    'category_athlete_id': e.id,
                    'athlete_id': e.athlete_id,
                    'name': f'{e.athlete.first_name} {e.athlete.last_name}',
                    'club_id': e.athlete.club_id,
                    'club_name': e.athlete.club.name if e.athlete.club_id else None,
                    'weight': str(e.weight) if e.weight is not None else None,
                }
                for e in visible_entries
            ],
        })
    return {'categories': result}


def tool_get_enrollment_status(user, athlete_id=None, event_id=None, **_kwargs):
    """Where (if anywhere) `athlete_id` is enrolled for `event_id`. A coach
    may only query their own club's athletes here - use list_categories
    for aggregate visibility into what's allowed to be seen."""
    if not athlete_id or not event_id:
        return {'error': 'athlete_id și event_id sunt obligatorii.'}
    try:
        athlete = Athlete.objects.get(pk=athlete_id)
    except Athlete.DoesNotExist:
        return {'error': 'Sportivul nu a fost găsit.'}
    if not getattr(user, 'is_admin', False) and athlete.club_id != _own_club_id(user):
        return {'error': 'Poți verifica doar sportivi din clubul tău.'}
    entries = CategoryAthlete.objects.filter(athlete_id=athlete_id, category__event_id=event_id).select_related('category')
    return {
        'athlete_id': athlete_id,
        'enrollments': [
            {
                'category_athlete_id': e.id,
                'category_id': e.category_id,
                'category_name': e.category.name,
                'weight': str(e.weight) if e.weight is not None else None,
            }
            for e in entries
        ],
    }


# --- Write tools (propose only - see execute_confirmed_tool) ---------

def tool_enroll_athlete(user, athlete_id=None, category_id=None, weight=None, **_kwargs):
    """Propose enrolling `athlete_id` into `category_id`. Does NOT write
    to the database - validates eagerly (so an obviously-invalid request
    is caught here, before the user is asked to confirm) and returns a
    human-readable proposal for the chat UI to render with confirm/cancel
    buttons."""
    if not athlete_id or not category_id:
        return {'error': 'athlete_id și category_id sunt obligatorii.'}
    try:
        athlete = Athlete.objects.select_related('club').get(pk=athlete_id)
    except Athlete.DoesNotExist:
        return {'error': 'Sportivul nu a fost găsit.'}
    try:
        category = Category.objects.get(pk=category_id)
    except Category.DoesNotExist:
        return {'error': 'Categoria nu a fost găsită.'}
    if not getattr(user, 'is_admin', False) and athlete.club_id != _own_club_id(user):
        return {'error': 'Poți înscrie doar sportivi din clubul tău.'}

    summary = f'Înscrie pe {athlete.first_name} {athlete.last_name} la categoria "{category.name}"'
    if weight is not None:
        summary += f' cu greutatea {weight}kg'
    summary += '.'
    return {
        'requires_confirmation': True,
        'status': 'pending',
        'summary': summary,
        'tool': 'enroll_athlete',
        'args': {'athlete_id': athlete_id, 'category_id': category_id, 'weight': weight},
    }


def tool_unenroll_athlete(user, category_athlete_id=None, **_kwargs):
    """Propose removing an existing enrollment. Does NOT write to the
    database - see tool_enroll_athlete's docstring, same reasoning."""
    if not category_athlete_id:
        return {'error': 'category_athlete_id este obligatoriu.'}
    try:
        entry = CategoryAthlete.objects.select_related('athlete', 'category').get(pk=category_athlete_id)
    except CategoryAthlete.DoesNotExist:
        return {'error': 'Înscrierea nu a fost găsită.'}
    if not getattr(user, 'is_admin', False) and entry.athlete.club_id != _own_club_id(user):
        return {'error': 'Poți scoate doar sportivi din clubul tău.'}

    summary = f'Scoate pe {entry.athlete.first_name} {entry.athlete.last_name} din categoria "{entry.category.name}".'
    return {
        'requires_confirmation': True,
        'status': 'pending',
        'summary': summary,
        'tool': 'unenroll_athlete',
        'args': {'category_athlete_id': category_athlete_id},
    }


def execute_confirmed_tool(user, tool_name, args):
    """Actually perform a write tool call the user has confirmed (see
    views/assistant.py's AssistantConfirmView). Re-validates from scratch
    - state may have changed since the proposal was made - by going
    straight through the same enroll/unenroll helpers the REST endpoint
    itself uses (backend/api/views/enrollments.py), so there is exactly
    one enforcement path for the actual write, shared with the ordinary
    Centralizator UI."""
    if tool_name == 'enroll_athlete':
        payload = {'athlete': args.get('athlete_id'), 'category': args.get('category_id')}
        if args.get('weight') is not None:
            payload['weight'] = args['weight']
        data, error = enroll_category_athlete(user, payload)
        if error:
            return {'success': False, 'error': error.data.get('error', 'Nu am putut finaliza înscrierea.')}
        return {'success': True, 'data': data}
    if tool_name == 'unenroll_athlete':
        data, error = unenroll_category_athlete(user, args.get('category_athlete_id'))
        if error:
            return {'success': False, 'error': error.data.get('error', 'Nu am putut anula înscrierea.')}
        return {'success': True, 'data': data}
    return {'success': False, 'error': f'Unealtă necunoscută: {tool_name}'}


TOOL_FUNCTIONS = {
    'list_clubs': tool_list_clubs,
    'search_athletes': tool_search_athletes,
    'get_athlete': tool_get_athlete,
    'list_competitions': tool_list_competitions,
    'list_categories': tool_list_categories,
    'get_enrollment_status': tool_get_enrollment_status,
    'enroll_athlete': tool_enroll_athlete,
    'unenroll_athlete': tool_unenroll_athlete,
}

WRITE_TOOL_NAMES = {'enroll_athlete', 'unenroll_athlete'}
