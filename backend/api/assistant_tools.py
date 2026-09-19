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
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.db.models.functions import Length
from django.utils import timezone

from .models import (
    Athlete, Club, City, Category, CategoryAthlete, CategoryAthleteScore, Competition, Grade, Group,
    GradeHistory, Visa, TrainingSeminarParticipation,
)
from .serializers import ClubSerializer, AthleteSerializer, GroupSerializer
from .views._common import _get_effective_coach_registration_deadline, _event_operational_lock_response
from .views.enrollments import enroll_category_athlete, unenroll_category_athlete


class _FakeRequest:
    """A minimal stand-in for DRF's Request, just enough to reuse an
    existing ViewSet method's body (it only ever reads `.data`) without
    going through the real HTTP/permission-class dispatch. Only used for
    view methods confirmed to do nothing else request-shaped internally
    (no `self.check_object_permissions(request, ...)`, no `self.request`)
    - the AI tool calling it has already done its own is_admin check by
    this point, so skipping the DRF permission layer here is intentional,
    not a gap."""
    def __init__(self, data):
        self.data = data


def _require_admin(user):
    """Every tool in this module past this point is admin-only - unlike
    the club-scoped athlete/enrollment tools above, there's no coach-safe
    subset of "create a club" or "approve a result". Returns an error
    dict or None."""
    if not getattr(user, 'is_admin', False):
        return {'error': 'Doar administratorii pot folosi această unealtă.'}
    return None


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


def _diacritic_variants(text):
    """Romanian city names in this database inconsistently mix the two
    Unicode encodings of ș/ț - comma-below (ș U+0219, ț U+021B, the correct
    modern form) and cedilla (ş U+015F, ţ U+0163, a legacy artifact of old
    fonts/imports) - sometimes even within the same row (e.g. one real row
    is literally "Iaşi, Iași County": cedilla in the city name, comma-below
    in the county). A plain icontains search misses matches across that
    split, which surfaced as a real failure in tool_list_cities during
    development (the model correctly refused to guess an id when its
    search came up empty, but couldn't find the row at all either).
    Generates every combination for both letter pairs so a caller only
    needs to search once for whichever variant they typed."""
    variants = {text}
    for correct, legacy in (('ș', 'ş'), ('ț', 'ţ')):
        variants |= {v.replace(correct, legacy) for v in variants}
        variants |= {v.replace(legacy, correct) for v in variants}
    return variants


def tool_list_cities(user, query=None, **_kwargs):
    """Look up a real City id by name. Exists specifically so a write tool
    that needs a city_id (create_athlete, edit_athlete, create_club, ...)
    never has to guess one - a model that only ever sees a city NAME (e.g.
    in tool_list_clubs's output) has no way to know the matching primary
    key otherwise, and guessing produced a real bug during development:
    the model once guessed city_id=1 for "Iași" and silently attached a
    real athlete to a random, unrelated city instead.

    Ordered shortest-name-first rather than alphabetically when searching:
    a big city like "Iași" also substring-matches the "... Iași County"
    suffix of a thousand-plus small comunas in that county, which - sorted
    alphabetically - buried the actual city well past the result cap
    during development (another real failure this tool exists to prevent
    a bad guess from, but this time it failed *too* safely, finding
    nothing usable instead of the obvious match). The city itself is
    reliably one of the shortest matching names, since it doesn't carry
    that county suffix twice over with extra commune-name text."""
    qs = City.objects.all()
    if query:
        q_filter = Q()
        for variant in _diacritic_variants(query):
            q_filter |= Q(name__icontains=variant)
        qs = qs.filter(q_filter)
        qs = qs.annotate(_name_len=Length('name')).order_by('_name_len', 'name')
    else:
        qs = qs.order_by('name')
    qs = qs[:25]
    return {'cities': [{'id': c.id, 'name': c.name} for c in qs]}


def tool_list_grades(user, **_kwargs):
    """Same reasoning as tool_list_cities - resolves a real Grade id by
    name for current_grade_id, instead of a write tool's caller guessing."""
    grades = Grade.objects.order_by('rank_order').values('id', 'name')
    return {'grades': list(grades)}


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


# --- Admin-only write tools: clubs, athletes, competitions ------------
#
# Everything below this point is gated by _require_admin() - there is no
# coach-safe subset of "create a club" or "edit any athlete's data", so
# unlike the tools above these never check club ownership, only role.

CLUB_EDITABLE_FIELDS = {
    'name', 'description', 'address', 'mobile_number', 'website',
    'facebook_url', 'instagram_url', 'tiktok_url', 'youtube_url', 'city_id',
}

# Deliberately excludes: status/reviewed_date/reviewed_by/admin_notes
# (the approval workflow - use approve_request/reject_request instead),
# profile_image_status/pending_profile_image (its own photo-approval
# workflow), cnp (sensitive PII), is_coach/is_referee (these flip
# eligibility checks elsewhere in the app - a deliberate admin-console
# action, not a chat-tool field). See ATHLETE_EDITABLE_FIELDS's docstring
# in the research this was based on for the full reasoning.
ATHLETE_EDITABLE_FIELDS = {
    'first_name', 'last_name', 'date_of_birth', 'gender', 'address', 'mobile_number',
    'emergency_contact_name', 'emergency_contact_phone', 'previous_experience',
    'city_id', 'current_grade_id', 'club_id', 'federation_role_id', 'title_id',
}

# Same reasoning as ATHLETE_EDITABLE_FIELDS below, minus club_id (handled
# as its own required argument - see tool_create_athlete) and minus cnp:
# unlike the other fields here, a national ID is sensitive PII that
# shouldn't pass through a chat conversation (persisted in
# AssistantMessage, visible in the usage report) even when the caller is
# a legitimate admin - it goes through the normal edit form instead.
#
# date_of_birth and city_id are NOT actually optional despite the Athlete
# model itself allowing blank/null for both - AthleteSerializer (the same
# one AthleteViewSet.create() uses) forces date_of_birth via extra_kwargs
# and declares city without required=False, so both are required in
# practice. Discovered by this module's own tests failing against the
# real serializer rather than an assumption about the model - see
# tool_create_athlete, which requires them as named arguments like club_id.
ATHLETE_CREATE_OPTIONAL_FIELDS = {
    'gender', 'license_series', 'license_number',
    'address', 'mobile_number', 'emergency_contact_name', 'emergency_contact_phone',
    'previous_experience', 'current_grade_id',
}

GROUP_EDITABLE_FIELDS = {
    'name', 'birth_year_start', 'birth_year_end', 'birth_date_start',
    'birth_date_end', 'allow_younger', 'allowed_grade_type', 'display_order',
}

# domain -> (model, the field holding its approval status, a display label).
# All six ultimately use ApprovalWorkflowMixin's approve(admin_user, notes='')
# / reject(admin_user, notes='') - except Athlete's own two overrides for
# the 'account'/'photo' domains, which execute_confirmed_tool special-cases.
APPROVAL_DOMAINS = {
    'account': {'model': Athlete, 'status_field': 'status', 'label': 'cerere de cont'},
    'photo': {'model': Athlete, 'status_field': 'profile_image_status', 'label': 'poză de profil'},
    'grade': {'model': GradeHistory, 'status_field': 'status', 'label': 'examen de grad'},
    'result': {'model': CategoryAthleteScore, 'status_field': 'status', 'label': 'rezultat'},
    'seminar': {'model': TrainingSeminarParticipation, 'status_field': 'status', 'label': 'participare la stagiu'},
    'visa': {'model': Visa, 'status_field': 'status', 'label': 'viză'},
}


def _approval_display_name(domain, instance):
    athlete = instance if domain in ('account', 'photo') else getattr(instance, 'athlete', None)
    return f'{athlete.first_name} {athlete.last_name}' if athlete else '?'


def tool_create_club(user, name=None, city_id=None, description=None, address=None, mobile_number=None, website=None, **_kwargs):
    error = _require_admin(user)
    if error:
        return error
    if not name:
        return {'error': 'Numele clubului este obligatoriu.'}
    city_name = None
    if city_id:
        city = City.objects.filter(pk=city_id).first()
        if not city:
            return {'error': 'Orașul indicat nu a fost găsit.'}
        city_name = city.name
    summary = f'Creează clubul "{name}"' + (f' din {city_name}' if city_name else '') + '.'
    return {
        'requires_confirmation': True, 'status': 'pending', 'summary': summary,
        'tool': 'create_club',
        'args': {
            'name': name, 'city_id': city_id, 'description': description,
            'address': address, 'mobile_number': mobile_number, 'website': website,
        },
    }


def tool_edit_club(user, club_id=None, **fields):
    error = _require_admin(user)
    if error:
        return error
    if not club_id:
        return {'error': 'club_id este obligatoriu.'}
    try:
        club = Club.objects.get(pk=club_id)
    except Club.DoesNotExist:
        return {'error': 'Clubul nu a fost găsit.'}
    changed = {k: v for k, v in fields.items() if k in CLUB_EDITABLE_FIELDS and v is not None}
    if not changed:
        return {'error': 'Nu ai specificat niciun câmp valid de modificat.'}
    summary = f'Modifică clubul "{club.name}": ' + ', '.join(f'{k}={v}' for k, v in changed.items()) + '.'
    return {
        'requires_confirmation': True, 'status': 'pending', 'summary': summary,
        'tool': 'edit_club', 'args': {'club_id': club_id, **changed},
    }


def tool_edit_athlete(user, athlete_id=None, **fields):
    error = _require_admin(user)
    if error:
        return error
    if not athlete_id:
        return {'error': 'athlete_id este obligatoriu.'}
    try:
        athlete = Athlete.objects.get(pk=athlete_id)
    except Athlete.DoesNotExist:
        return {'error': 'Sportivul nu a fost găsit.'}
    changed = {k: v for k, v in fields.items() if k in ATHLETE_EDITABLE_FIELDS and v is not None}
    if not changed:
        return {
            'error': (
                'Nu ai specificat niciun câmp valid de modificat - starea de aprobare, poza de '
                'profil și CNP-ul nu pot fi schimbate prin această unealtă.'
            ),
        }
    summary = f'Modifică sportivul {athlete.first_name} {athlete.last_name}: ' + ', '.join(f'{k}={v}' for k, v in changed.items()) + '.'
    return {
        'requires_confirmation': True, 'status': 'pending', 'summary': summary,
        'tool': 'edit_athlete', 'args': {'athlete_id': athlete_id, **changed},
    }


def tool_create_athlete(user, first_name=None, last_name=None, club_id=None, date_of_birth=None, city_id=None, **fields):
    """Create a brand-new athlete profile. Mirrors AthleteViewSet.create()'s
    admin path (views/athletes.py) - which requires an explicit club_id for
    an admin caller specifically (a coach's club is implicit; an admin has
    none of their own). first_name/last_name/date_of_birth/city_id are all
    required here because AthleteSerializer - the same one that view calls
    - genuinely requires them (date_of_birth via an explicit extra_kwargs
    override, city via having no required=False despite allow_null=True),
    even though the Athlete model itself would allow both blank. Everything
    else in ATHLETE_CREATE_OPTIONAL_FIELDS really is optional."""
    error = _require_admin(user)
    if error:
        return error
    if not first_name or not last_name:
        return {'error': 'first_name și last_name sunt obligatorii.'}
    if not club_id:
        return {'error': 'club_id este obligatoriu - ca administrator, trebuie să indici explicit clubul noului sportiv.'}
    if not date_of_birth:
        return {'error': 'date_of_birth este obligatoriu.'}
    if not city_id:
        return {'error': 'city_id este obligatoriu.'}
    try:
        club = Club.objects.get(pk=club_id)
    except Club.DoesNotExist:
        return {'error': 'Clubul indicat nu a fost găsit.'}
    if not City.objects.filter(pk=city_id).exists():
        return {'error': 'Orașul indicat nu a fost găsit.'}

    changed = {k: v for k, v in fields.items() if k in ATHLETE_CREATE_OPTIONAL_FIELDS and v is not None}
    summary = f'Creează sportivul {first_name} {last_name} (născut {date_of_birth}) la clubul "{club.name}".'
    return {
        'requires_confirmation': True, 'status': 'pending', 'summary': summary,
        'tool': 'create_athlete',
        'args': {
            'first_name': first_name, 'last_name': last_name, 'club_id': club_id,
            'date_of_birth': date_of_birth, 'city_id': city_id, **changed,
        },
    }


def tool_create_competition(user, name=None, start_date=None, end_date=None, city_id=None, address=None, description=None, event_type='competition', coach_registration_deadline=None, **_kwargs):
    error = _require_admin(user)
    if error:
        return error
    if not name or not start_date:
        return {'error': 'name și start_date sunt obligatorii.'}
    summary = f'Creează competiția "{name}", cu începere la {start_date}.'
    return {
        'requires_confirmation': True, 'status': 'pending', 'summary': summary,
        'tool': 'create_competition',
        'args': {
            'name': name, 'start_date': start_date, 'end_date': end_date, 'city_id': city_id,
            'address': address, 'description': description, 'event_type': event_type or 'competition',
            'coach_registration_deadline': coach_registration_deadline,
        },
    }


def tool_create_category(user, event_id=None, name=None, category_type='solo', gender='mixt', group_id=None, **_kwargs):
    error = _require_admin(user)
    if error:
        return error
    if not event_id or not name:
        return {'error': 'event_id și name sunt obligatorii.'}
    try:
        event = Competition.objects.get(pk=event_id)
    except Competition.DoesNotExist:
        return {'error': 'Competiția nu a fost găsită.'}
    if category_type not in {'solo', 'team', 'fight'}:
        return {'error': 'category_type trebuie să fie solo, team sau fight.'}
    summary = f'Creează categoria "{name}" ({category_type}, {gender}) pentru competiția "{event.title}".'
    return {
        'requires_confirmation': True, 'status': 'pending', 'summary': summary,
        'tool': 'create_category',
        'args': {'event_id': event_id, 'name': name, 'category_type': category_type, 'gender': gender or 'mixt', 'group_id': group_id},
    }


def tool_edit_category(user, category_id=None, name=None, gender=None, display_order=None, **_kwargs):
    error = _require_admin(user)
    if error:
        return error
    if not category_id:
        return {'error': 'category_id este obligatoriu.'}
    try:
        category = Category.objects.get(pk=category_id)
    except Category.DoesNotExist:
        return {'error': 'Categoria nu a fost găsită.'}
    changed = {k: v for k, v in {'name': name, 'gender': gender, 'display_order': display_order}.items() if v is not None}
    if not changed:
        return {'error': 'Nu ai specificat niciun câmp valid de modificat (doar name, gender, display_order pot fi schimbate).'}
    summary = f'Modifică categoria "{category.name}": ' + ', '.join(f'{k}={v}' for k, v in changed.items()) + '.'
    return {
        'requires_confirmation': True, 'status': 'pending', 'summary': summary,
        'tool': 'edit_category', 'args': {'category_id': category_id, **changed},
    }


def tool_create_group(user, event_id=None, name=None, birth_year_start=None, birth_year_end=None, allow_younger=False, **_kwargs):
    error = _require_admin(user)
    if error:
        return error
    if not event_id or not name:
        return {'error': 'event_id și name sunt obligatorii.'}
    try:
        event = Competition.objects.get(pk=event_id)
    except Competition.DoesNotExist:
        return {'error': 'Competiția nu a fost găsită.'}
    summary = f'Creează grupa "{name}" pentru competiția "{event.title}".'
    return {
        'requires_confirmation': True, 'status': 'pending', 'summary': summary,
        'tool': 'create_group',
        'args': {
            'event_id': event_id, 'name': name, 'birth_year_start': birth_year_start,
            'birth_year_end': birth_year_end, 'allow_younger': bool(allow_younger),
        },
    }


def tool_edit_group(user, group_id=None, **fields):
    error = _require_admin(user)
    if error:
        return error
    if not group_id:
        return {'error': 'group_id este obligatoriu.'}
    try:
        group = Group.objects.get(pk=group_id)
    except Group.DoesNotExist:
        return {'error': 'Grupa nu a fost găsită.'}
    changed = {k: v for k, v in fields.items() if k in GROUP_EDITABLE_FIELDS and v is not None}
    if not changed:
        return {'error': 'Nu ai specificat niciun câmp valid de modificat.'}
    summary = f'Modifică grupa "{group.name}": ' + ', '.join(f'{k}={v}' for k, v in changed.items()) + '.'
    return {
        'requires_confirmation': True, 'status': 'pending', 'summary': summary,
        'tool': 'edit_group', 'args': {'group_id': group_id, **changed},
    }


def tool_list_pending_approvals(user, domain=None, **_kwargs):
    error = _require_admin(user)
    if error:
        return error
    if domain and domain not in APPROVAL_DOMAINS:
        return {'error': f'Domeniu necunoscut: {domain}. Domenii valide: {", ".join(APPROVAL_DOMAINS)}.'}
    domains = [domain] if domain else list(APPROVAL_DOMAINS.keys())
    result = []
    for d in domains:
        config = APPROVAL_DOMAINS[d]
        qs = config['model'].objects.filter(**{config['status_field']: 'pending'}).order_by('id')[:20]
        for instance in qs:
            result.append({
                'domain': d, 'item_id': instance.pk, 'label': config['label'],
                'athlete': _approval_display_name(d, instance),
            })
    return {'pending_approvals': result}


def _propose_approval_action(user, domain, item_id, notes, action):
    error = _require_admin(user)
    if error:
        return error
    if domain not in APPROVAL_DOMAINS:
        return {'error': f'Domeniu necunoscut: {domain}. Domenii valide: {", ".join(APPROVAL_DOMAINS)}.'}
    if not item_id:
        return {'error': 'item_id este obligatoriu.'}
    config = APPROVAL_DOMAINS[domain]
    try:
        instance = config['model'].objects.get(pk=item_id)
    except config['model'].DoesNotExist:
        return {'error': f'{config["label"]} nu a fost găsit(ă).'}
    current_status = getattr(instance, config['status_field'])
    if current_status != 'pending':
        return {'error': f'Această {config["label"]} nu mai este în așteptare (stare curentă: {current_status}).'}
    verb = 'Aprobă' if action == 'approve' else 'Respinge'
    summary = f'{verb} {config["label"]} #{item_id} pentru {_approval_display_name(domain, instance)}.'
    if notes:
        summary += f' Notă: {notes}'
    return {
        'requires_confirmation': True, 'status': 'pending', 'summary': summary,
        'tool': 'approve_request' if action == 'approve' else 'reject_request',
        'args': {'domain': domain, 'item_id': item_id, 'notes': notes},
    }


def tool_approve_request(user, domain=None, item_id=None, notes=None, **_kwargs):
    return _propose_approval_action(user, domain, item_id, notes, action='approve')


def tool_reject_request(user, domain=None, item_id=None, notes=None, **_kwargs):
    return _propose_approval_action(user, domain, item_id, notes, action='reject')


def _format_serializer_errors(errors):
    return '; '.join(f'{field}: {", ".join(str(m) for m in msgs)}' for field, msgs in errors.items())


def execute_confirmed_tool(user, tool_name, args):
    """Actually perform a write tool call the user has confirmed (see
    views/assistant.py's AssistantConfirmView). Re-validates from scratch
    - state may have changed since the proposal was made - by going
    straight through the same enroll/unenroll helpers the REST endpoint
    itself uses (backend/api/views/enrollments.py) or the same
    serializer/ViewSet-method the corresponding REST endpoint uses for
    everything below, so there is exactly one enforcement path for each
    actual write. Re-checks is_admin here too (not just in the tool_*
    proposal function) since this is the function that actually mutates
    data - never trust that a caller only reaches this after a legitimate
    propose step."""
    if tool_name in WRITE_TOOL_NAMES - {'enroll_athlete', 'unenroll_athlete'}:
        error = _require_admin(user)
        if error:
            return {'success': False, 'error': error['error']}

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

    if tool_name == 'create_club':
        payload = {k: v for k, v in {
            'name': args.get('name'), 'description': args.get('description'), 'address': args.get('address'),
            'mobile_number': args.get('mobile_number'), 'website': args.get('website'), 'city': args.get('city_id'),
        }.items() if v is not None}
        serializer = ClubSerializer(data=payload)
        if not serializer.is_valid():
            return {'success': False, 'error': _format_serializer_errors(serializer.errors)}
        serializer.save()
        return {'success': True, 'data': {'id': serializer.instance.id, 'name': serializer.instance.name}}

    if tool_name == 'edit_club':
        try:
            club = Club.objects.get(pk=args.get('club_id'))
        except Club.DoesNotExist:
            return {'success': False, 'error': 'Clubul nu a fost găsit.'}
        payload = {k: v for k, v in args.items() if k in CLUB_EDITABLE_FIELDS}
        if 'city_id' in payload:
            payload['city'] = payload.pop('city_id')
        serializer = ClubSerializer(club, data=payload, partial=True)
        if not serializer.is_valid():
            return {'success': False, 'error': _format_serializer_errors(serializer.errors)}
        serializer.save()
        return {'success': True, 'data': {'id': club.id, 'name': club.name}}

    if tool_name == 'edit_athlete':
        try:
            athlete = Athlete.objects.get(pk=args.get('athlete_id'))
        except Athlete.DoesNotExist:
            return {'success': False, 'error': 'Sportivul nu a fost găsit.'}
        payload = {k: v for k, v in args.items() if k in ATHLETE_EDITABLE_FIELDS}
        field_map = {'city_id': 'city', 'current_grade_id': 'current_grade', 'club_id': 'club', 'federation_role_id': 'federation_role', 'title_id': 'title'}
        for src, dest in field_map.items():
            if src in payload:
                payload[dest] = payload.pop(src)
        serializer = AthleteSerializer(athlete, data=payload, partial=True)
        if not serializer.is_valid():
            return {'success': False, 'error': _format_serializer_errors(serializer.errors)}
        serializer.save()
        return {'success': True, 'data': {'id': athlete.id, 'name': f'{athlete.first_name} {athlete.last_name}'}}

    if tool_name == 'create_athlete':
        try:
            club = Club.objects.get(pk=args.get('club_id'))
        except Club.DoesNotExist:
            return {'success': False, 'error': 'Clubul nu a fost găsit.'}
        payload = {k: v for k, v in args.items() if k in {'first_name', 'last_name', 'date_of_birth', 'city_id'} | ATHLETE_CREATE_OPTIONAL_FIELDS}
        field_map = {'city_id': 'city', 'current_grade_id': 'current_grade'}
        for src, dest in field_map.items():
            if src in payload:
                payload[dest] = payload.pop(src)
        serializer = AthleteSerializer(data=payload)
        if not serializer.is_valid():
            return {'success': False, 'error': _format_serializer_errors(serializer.errors)}
        # club/status forced explicitly rather than trusted from payload,
        # matching AthleteViewSet.create()'s admin path exactly - an
        # admin-created athlete is auto-approved (no separate review step
        # for something the admin themselves just added).
        athlete = serializer.save(club=club, status='approved')
        return {'success': True, 'data': {'id': athlete.id, 'name': f'{athlete.first_name} {athlete.last_name}'}}

    if tool_name == 'create_competition':
        from .views.competitions import CompetitionViewSet
        payload = {
            'name': args.get('name'), 'start_date': args.get('start_date'), 'end_date': args.get('end_date'),
            'city': args.get('city_id'), 'address': args.get('address'), 'description': args.get('description'),
            'event_type': args.get('event_type') or 'competition',
            'coach_registration_deadline': args.get('coach_registration_deadline'),
        }
        response = CompetitionViewSet().create(_FakeRequest(payload))
        if response.status_code >= 400:
            return {'success': False, 'error': str(response.data)}
        return {'success': True, 'data': {'id': response.data.get('id'), 'name': response.data.get('name')}}

    if tool_name == 'create_category':
        from .views.competitions import CategoryViewSet
        event = Competition.objects.filter(pk=args.get('event_id')).first()
        locked = _event_operational_lock_response(event)
        if locked is not None:
            return {'success': False, 'error': 'Competiția este blocată pentru operare locală - modificările nu sunt permise acum.'}
        create_data = {
            'name': args.get('name'), 'event_id': args.get('event_id'),
            'gender': args.get('gender') or 'mixt', 'category_type': args.get('category_type') or 'solo',
        }
        if args.get('group_id'):
            create_data['group_id'] = args['group_id']
        cat = CategoryViewSet()._create_category(create_data)
        return {'success': True, 'data': {'id': cat.id, 'name': cat.name}}

    if tool_name == 'edit_category':
        from .views.competitions import CategoryViewSet
        payload = {k: v for k, v in args.items() if k in {'name', 'gender', 'display_order'}}
        response = CategoryViewSet().update(_FakeRequest(payload), pk=args.get('category_id'))
        if response.status_code >= 400:
            return {'success': False, 'error': str(response.data)}
        return {'success': True, 'data': {'id': response.data.get('id'), 'name': response.data.get('name')}}

    if tool_name == 'create_group':
        from .views.competitions import GroupViewSet
        payload = {'name': args.get('name'), 'event': args.get('event_id')}
        for field in ('birth_year_start', 'birth_year_end', 'allow_younger'):
            if args.get(field) is not None:
                payload[field] = args[field]
        response = GroupViewSet().create(_FakeRequest(payload))
        if response.status_code >= 400:
            return {'success': False, 'error': str(response.data)}
        return {'success': True, 'data': {'id': response.data.get('id'), 'name': response.data.get('name')}}

    if tool_name == 'edit_group':
        from .views.competitions import GroupViewSet
        try:
            group = Group.objects.get(pk=args.get('group_id'))
        except Group.DoesNotExist:
            return {'success': False, 'error': 'Grupa nu a fost găsită.'}
        # GroupViewSet.update() uses a non-partial serializer (the REST
        # endpoint always PUTs the whole object) - merge the requested
        # changes onto the group's current values instead of sending only
        # the changed fields, so fields the AI didn't mention keep their
        # existing value rather than failing "this field is required".
        base_payload = dict(GroupSerializer(group).data)
        base_payload.update({k: v for k, v in args.items() if k in GROUP_EDITABLE_FIELDS})
        response = GroupViewSet().update(_FakeRequest(base_payload), pk=group.id)
        if response.status_code >= 400:
            return {'success': False, 'error': str(response.data)}
        return {'success': True, 'data': {'id': response.data.get('id'), 'name': response.data.get('name')}}

    if tool_name in ('approve_request', 'reject_request'):
        domain = args.get('domain')
        config = APPROVAL_DOMAINS.get(domain)
        if not config:
            return {'success': False, 'error': f'Domeniu necunoscut: {domain}.'}
        try:
            instance = config['model'].objects.get(pk=args.get('item_id'))
        except config['model'].DoesNotExist:
            return {'success': False, 'error': f'{config["label"]} nu a fost găsit(ă).'}
        if getattr(instance, config['status_field']) != 'pending':
            return {'success': False, 'error': f'Această {config["label"]} nu mai este în așteptare.'}
        notes = args.get('notes') or ''
        try:
            if tool_name == 'approve_request':
                if domain == 'account':
                    instance.approve(user)
                elif domain == 'photo':
                    instance.approve_profile_image(user, notes)
                else:
                    instance.approve(user, notes)
            else:
                if domain == 'account':
                    instance.reject(user, notes or None)
                elif domain == 'photo':
                    instance.reject_profile_image(user, notes)
                else:
                    instance.reject(user, notes)
        except DjangoValidationError as exc:
            return {'success': False, 'error': '; '.join(exc.messages)}
        return {'success': True, 'data': {'domain': domain, 'item_id': instance.pk, 'status': getattr(instance, config['status_field'])}}

    return {'success': False, 'error': f'Unealtă necunoscută: {tool_name}'}


TOOL_FUNCTIONS = {
    'list_clubs': tool_list_clubs,
    'list_cities': tool_list_cities,
    'list_grades': tool_list_grades,
    'search_athletes': tool_search_athletes,
    'get_athlete': tool_get_athlete,
    'list_competitions': tool_list_competitions,
    'list_categories': tool_list_categories,
    'get_enrollment_status': tool_get_enrollment_status,
    'enroll_athlete': tool_enroll_athlete,
    'unenroll_athlete': tool_unenroll_athlete,
    'create_club': tool_create_club,
    'edit_club': tool_edit_club,
    'edit_athlete': tool_edit_athlete,
    'create_athlete': tool_create_athlete,
    'create_competition': tool_create_competition,
    'create_category': tool_create_category,
    'edit_category': tool_edit_category,
    'create_group': tool_create_group,
    'edit_group': tool_edit_group,
    'list_pending_approvals': tool_list_pending_approvals,
    'approve_request': tool_approve_request,
    'reject_request': tool_reject_request,
}

WRITE_TOOL_NAMES = {
    'enroll_athlete', 'unenroll_athlete',
    'create_club', 'edit_club', 'edit_athlete', 'create_athlete',
    'create_competition', 'create_category', 'edit_category',
    'create_group', 'edit_group',
    'approve_request', 'reject_request',
}
