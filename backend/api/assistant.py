"""AI chat assistant: a small, curated set of Claude tool-use functions
(api/assistant_tools.py) let admin and coach users ask questions and
request changes using real app data, from a chat widget in apps/app.

Mirrors diploma_ocr.py's plain, synchronous style - there is no
background job queue in this codebase, so the Claude call blocks the
request like every other AI call here already does.

The tool functions in assistant_tools.py are the real security boundary:
SYSTEM_PROMPT tells Claude the caller's role for a coherent conversation,
but every tool independently re-derives the caller's actual role/club
from the Django user and enforces it - never trust the model itself."""
import json
import logging

from django.conf import settings

from . import assistant_tools as tools

logger = logging.getLogger(__name__)

MODEL = 'claude-sonnet-4-5-20250929'
MAX_TOOL_ITERATIONS = 4

SYSTEM_PROMPT = """Ești asistentul AI al panoului de administrare al Federației Române de Vovinam Việt Võ Đạo. Răspunzi întotdeauna în română.

Poți explica cum funcționează aplicația (de exemplu cum se înscrie un sportiv la o competiție, cum se creează un cont, ce înseamnă diversele stări) și poți folosi uneltele disponibile pentru a răspunde cu date reale din sistem sau pentru a propune modificări.

Rolul utilizatorului curent: {role_description}

Reguli importante:
- Nu poți vedea sau modifica date din alte cluburi decât dacă utilizatorul este administrator sau termenul-limită de înscriere al competiției a trecut deja - uneltele impun deja această restricție; nu încerca să o ocolești și nu presupune că ai acces la ceva ce o unealtă refuză.
- Orice acțiune care modifică date (înscriere, dezînscriere) este doar PROPUSĂ de tine - execuția reală se întâmplă doar după ce utilizatorul apasă explicit "Confirmă" în interfață. Nu spune niciodată că ai "făcut deja" o modificare pe baza unui apel de unealtă de scriere - spune că ai pregătit-o și aștepți confirmarea.
- Dacă o unealtă întoarce o eroare (de exemplu lipsă de permisiune sau ceva negăsit), explică politicos utilizatorului de ce, fără să sugerezi ocolirea restricției.
- Fii concis și concret."""

TOOLS = [
    {
        'name': 'list_clubs',
        'description': 'Listează toate cluburile din federație (nume, oraș). Nu are restricții de rol.',
        'input_schema': {'type': 'object', 'properties': {}},
    },
    {
        'name': 'search_athletes',
        'description': 'Caută sportivi după nume. Un antrenor vede doar sportivii propriului club, indiferent de textul căutat.',
        'input_schema': {
            'type': 'object',
            'properties': {
                'query': {'type': 'string', 'description': 'Text de căutare în nume/prenume (opțional - dacă lipsește, întoarce toți sportivii vizibili).'},
            },
        },
    },
    {
        'name': 'get_athlete',
        'description': 'Detalii despre un sportiv anume, după id.',
        'input_schema': {
            'type': 'object',
            'properties': {'athlete_id': {'type': 'integer'}},
            'required': ['athlete_id'],
        },
    },
    {
        'name': 'list_competitions',
        'description': 'Listează competițiile/evenimentele federației.',
        'input_schema': {
            'type': 'object',
            'properties': {
                'upcoming_only': {'type': 'boolean', 'description': 'Doar competiții viitoare (implicit true).'},
            },
        },
    },
    {
        'name': 'list_categories',
        'description': (
            'Listează categoriile unei competiții, cu sportivii înscriși vizibili pentru utilizatorul curent '
            '(pentru un antrenor, doar propriul club, până trece deadline-ul de înscriere al competiției).'
        ),
        'input_schema': {
            'type': 'object',
            'properties': {'event_id': {'type': 'integer'}},
            'required': ['event_id'],
        },
    },
    {
        'name': 'get_enrollment_status',
        'description': 'Verifică la ce categorii este înscris un sportiv anume, pentru o competiție anume.',
        'input_schema': {
            'type': 'object',
            'properties': {
                'athlete_id': {'type': 'integer'},
                'event_id': {'type': 'integer'},
            },
            'required': ['athlete_id', 'event_id'],
        },
    },
    {
        'name': 'enroll_athlete',
        'description': (
            'Propune înscrierea unui sportiv într-o categorie. NU execută imediat - '
            'utilizatorul trebuie să confirme explicit în interfață înainte ca înscrierea să se salveze.'
        ),
        'input_schema': {
            'type': 'object',
            'properties': {
                'athlete_id': {'type': 'integer'},
                'category_id': {'type': 'integer'},
                'weight': {'type': 'number', 'description': 'Greutatea în kg, pentru categorii de luptă.'},
            },
            'required': ['athlete_id', 'category_id'],
        },
    },
    {
        'name': 'unenroll_athlete',
        'description': (
            'Propune scoaterea unui sportiv dintr-o categorie. NU execută imediat - '
            'utilizatorul trebuie să confirme explicit în interfață.'
        ),
        'input_schema': {
            'type': 'object',
            'properties': {'category_athlete_id': {'type': 'integer'}},
            'required': ['category_athlete_id'],
        },
    },
]


def _role_description(user):
    if getattr(user, 'is_admin', False):
        return 'administrator federație (vede și poate modifica toate cluburile).'
    athlete = getattr(user, 'athlete', None)
    if athlete and athlete.is_coach and athlete.club_id:
        club_name = athlete.club.name if athlete.club else ''
        return f'antrenor al clubului "{club_name}" (vede și poate modifica doar sportivii propriului club).'
    return 'utilizator fără drepturi de antrenor sau administrator.'


def _client():
    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError('Asistentul AI nu este configurat (lipsește ANTHROPIC_API_KEY).')
    import anthropic
    return anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


def run_assistant_turn(user, history, message_text):
    """Run one user turn against Claude, handling any tool calls along the
    way. `history` is a list of {'role': 'user'|'assistant', 'content':
    str} dicts from prior turns in this conversation (see
    views/assistant.py's _history_for). Returns {'reply': str,
    'tool_calls': [...], 'pending_confirmation': dict | None} -
    `tool_calls` is the audit trail of every tool actually invoked this
    turn (read tools run for real; a write tool's entry is a proposal,
    never an executed write - see assistant_tools.py)."""
    client = _client()
    messages = list(history) + [{'role': 'user', 'content': message_text}]
    system_prompt = SYSTEM_PROMPT.format(role_description=_role_description(user))

    tool_calls_log = []

    for _ in range(MAX_TOOL_ITERATIONS):
        response = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=system_prompt,
            tools=TOOLS,
            messages=messages,
        )
        messages.append({'role': 'assistant', 'content': response.content})

        if response.stop_reason != 'tool_use':
            reply_text = ''.join(block.text for block in response.content if block.type == 'text')
            return {'reply': reply_text, 'tool_calls': tool_calls_log, 'pending_confirmation': None}

        tool_results = []
        pending_confirmation = None
        for block in response.content:
            if block.type != 'tool_use':
                continue
            tool_fn = tools.TOOL_FUNCTIONS.get(block.name)
            args = block.input or {}
            result = tool_fn(user, **args) if tool_fn else {'error': f'Unealtă necunoscută: {block.name}'}
            tool_calls_log.append({'tool': block.name, 'args': args, 'result': result})
            if block.name in tools.WRITE_TOOL_NAMES and result.get('requires_confirmation'):
                pending_confirmation = result
            tool_results.append({
                'type': 'tool_result',
                'tool_use_id': block.id,
                'content': json.dumps(result, default=str),
                'is_error': bool(result.get('error')),
            })

        if pending_confirmation is not None:
            # A write tool was proposed - stop here and let the user
            # confirm in the UI instead of looping Claude further this
            # turn. AssistantConfirmView feeds the real outcome back as
            # its own follow-up message once the user decides.
            return {
                'reply': 'Am pregătit acțiunea de mai jos - confirmă dacă vrei să o aplic.',
                'tool_calls': tool_calls_log,
                'pending_confirmation': pending_confirmation,
            }

        messages.append({'role': 'user', 'content': tool_results})

    logger.warning('Assistant tool loop hit MAX_TOOL_ITERATIONS for user %s', getattr(user, 'id', None))
    return {
        'reply': 'Nu am putut finaliza cererea - încearcă să reformulezi mai simplu.',
        'tool_calls': tool_calls_log,
        'pending_confirmation': None,
    }
