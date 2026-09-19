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
- Scrie în text simplu, fără formatare Markdown (fără **bold**, fără # titluri, fără liste cu `-`/`*`) - interfața de chat afișează textul brut, așa că orice simbol de formatare ar apărea literal. Pentru liste, scrie fiecare element pe rândul lui, numerotat simplu ("1. ...").
- Nu poți vedea sau modifica date din alte cluburi decât dacă utilizatorul este administrator sau termenul-limită de înscriere al competiției a trecut deja - uneltele impun deja această restricție; nu încerca să o ocolești și nu presupune că ai acces la ceva ce o unealtă refuză.
- Când utilizatorul cere o acțiune (înscriere, dezînscriere, creare/editare club sau sportiv, creare/editare competiție/categorie/grupă, aprobare/respingere), TREBUIE să apelezi unealta corespunzătoare - nu descrie în text ce "ai pregătit" sau ce "urmează să faci" fără să fi apelat efectiv unealta, pentru că altfel nu apare niciun buton de confirmare și utilizatorul rămâne fără nicio acțiune reală de confirmat. Dacă îți lipsește un id exact (de exemplu categoria potrivită), folosește mai întâi o unealtă de citire (list_categories, search_athletes, list_pending_approvals) ca să-l găsești, apoi apelează unealta de scriere - nu cere utilizatorului să reformuleze doar pentru că tu nu ai apelat unealta.
- Uneltele marcate ADMIN funcționează doar pentru administratori - dacă un antrenor le cere, unealta va întoarce o eroare de permisiune; explică-i politicos că acea acțiune e disponibilă doar pentru administratori, nu încerca alt mod de a o face.
- Execuția reală a unei unelte de scriere se întâmplă doar după ce utilizatorul apasă explicit "Confirmă" în interfață (asta se întâmplă automat, nu e treaba ta) - dar TU trebuie mereu să apelezi unealta pentru ca acel buton de confirmare să existe. Nu spune niciodată că ai "făcut deja" o modificare - dacă ai apelat unealta și a întors o propunere, spune că ai pregătit-o și aștepți confirmarea; dacă nu ai apelat nicio unealtă, nu vorbi despre "pregătire" deloc.
- Dacă o unealtă întoarce o eroare (de exemplu lipsă de permisiune sau ceva negăsit), explică politicos utilizatorului de ce, fără să sugerezi ocolirea restricției.
- NU ghici NICIODATĂ un id numeric (city_id, current_grade_id, category_id etc.) pornind de la un nume pe care l-ai văzut afișat ca text în alt răspuns (de exemplu numele unui oraș apărut lângă un club). Un nume afișat nu-ți spune id-ul lui real. Dacă ai nevoie de un city_id, apelează list_cities; pentru current_grade_id, apelează list_grades; pentru orice alt id, folosește unealta de listare/căutare corespunzătoare. Dacă utilizatorul nu ți-a dat un id exact și nu găsești unul potrivit prin căutare, întreabă-l, nu inventa unul.
- Când îți lipsesc mai multe informații obligatorii pentru o acțiune (de exemplu la crearea unui sportiv nou), NU cere totul deodată într-o listă lungă - întreabă pe rând, conversațional, un lucru sau două per mesaj, ca într-un dialog natural. Continuă să întrebi până ai tot ce-ți trebuie, apoi apelează unealta.
- Fii concis și concret."""

TOOLS = [
    {
        'name': 'list_clubs',
        'description': 'Listează toate cluburile din federație (nume, oraș). Nu are restricții de rol.',
        'input_schema': {'type': 'object', 'properties': {}},
    },
    {
        'name': 'list_cities',
        'description': (
            'Caută id-ul real al unui oraș după nume - folosește OBLIGATORIU această unealtă înainte de a '
            'trimite un city_id către orice altă unealtă. NU ghici niciodată un city_id dintr-un nume de '
            'oraș văzut în alt răspuns (de exemplu în lista de cluburi) - acolo apare doar ca text, nu ca id.'
        ),
        'input_schema': {
            'type': 'object',
            'properties': {'query': {'type': 'string', 'description': 'Text de căutare (opțional).'}},
        },
    },
    {
        'name': 'list_grades',
        'description': 'Listează gradele existente cu id-urile lor reale - folosește-o înainte de a trimite un current_grade_id, din același motiv ca list_cities.',
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
    # --- Admin-only tools below - disponibile doar pentru administrator,
    # nu pentru antrenori (uneltele refuză cu eroare dacă apelantul nu e
    # admin, indiferent de ce spune promptul de sistem).
    {
        'name': 'create_club',
        'description': 'ADMIN. Propune crearea unui club nou. Necesită confirmare.',
        'input_schema': {
            'type': 'object',
            'properties': {
                'name': {'type': 'string'},
                'city_id': {'type': 'integer'},
                'description': {'type': 'string'},
                'address': {'type': 'string'},
                'mobile_number': {'type': 'string'},
                'website': {'type': 'string'},
            },
            'required': ['name'],
        },
    },
    {
        'name': 'edit_club',
        'description': (
            'ADMIN. Propune modificarea unui club existent (nume, oraș, descriere, adresă, telefon, website). '
            'Necesită confirmare. Trimite doar câmpurile pe care vrei să le schimbi.'
        ),
        'input_schema': {
            'type': 'object',
            'properties': {
                'club_id': {'type': 'integer'},
                'name': {'type': 'string'},
                'city_id': {'type': 'integer'},
                'description': {'type': 'string'},
                'address': {'type': 'string'},
                'mobile_number': {'type': 'string'},
                'website': {'type': 'string'},
            },
            'required': ['club_id'],
        },
    },
    {
        'name': 'edit_athlete',
        'description': (
            'ADMIN. Propune modificarea datelor unui sportiv existent (nume, data nașterii, gen, adresă, '
            'telefon, contact de urgență, club, grad, rol federație, titlu). NU poate schimba starea de '
            'aprobare, poza de profil sau CNP-ul - acelea au propriile fluxuri (vezi approve_request/reject_request). '
            'Necesită confirmare.'
        ),
        'input_schema': {
            'type': 'object',
            'properties': {
                'athlete_id': {'type': 'integer'},
                'first_name': {'type': 'string'},
                'last_name': {'type': 'string'},
                'date_of_birth': {'type': 'string', 'description': 'Format YYYY-MM-DD.'},
                'gender': {'type': 'string'},
                'address': {'type': 'string'},
                'mobile_number': {'type': 'string'},
                'emergency_contact_name': {'type': 'string'},
                'emergency_contact_phone': {'type': 'string'},
                'previous_experience': {'type': 'string'},
                'city_id': {'type': 'integer'},
                'current_grade_id': {'type': 'integer'},
                'club_id': {'type': 'integer'},
                'federation_role_id': {'type': 'integer'},
                'title_id': {'type': 'integer'},
            },
            'required': ['athlete_id'],
        },
    },
    {
        'name': 'create_athlete',
        'description': (
            'ADMIN. Propune crearea unui sportiv nou. club_id, date_of_birth și city_id sunt obligatorii '
            '(un administrator, spre deosebire de un antrenor, nu are un club implicit; data nașterii și '
            'orașul sunt cerute de validarea din spate, chiar dacă par opționale). CNP-ul nu se poate seta '
            'prin această unealtă - se completează separat, din profilul sportivului. Necesită confirmare.'
        ),
        'input_schema': {
            'type': 'object',
            'properties': {
                'first_name': {'type': 'string'},
                'last_name': {'type': 'string'},
                'club_id': {'type': 'integer'},
                'date_of_birth': {'type': 'string', 'description': 'Format YYYY-MM-DD.'},
                'city_id': {'type': 'integer'},
                'gender': {'type': 'string'},
                'license_series': {'type': 'string'},
                'license_number': {'type': 'string'},
                'address': {'type': 'string'},
                'mobile_number': {'type': 'string'},
                'emergency_contact_name': {'type': 'string'},
                'emergency_contact_phone': {'type': 'string'},
                'previous_experience': {'type': 'string'},
                'current_grade_id': {'type': 'integer'},
            },
            'required': ['first_name', 'last_name', 'club_id', 'date_of_birth', 'city_id'],
        },
    },
    {
        'name': 'create_competition',
        'description': 'ADMIN. Propune crearea unei competiții/eveniment noi. Necesită confirmare.',
        'input_schema': {
            'type': 'object',
            'properties': {
                'name': {'type': 'string'},
                'start_date': {'type': 'string', 'description': 'Dată/oră ISO sau YYYY-MM-DD.'},
                'end_date': {'type': 'string'},
                'city_id': {'type': 'integer'},
                'address': {'type': 'string'},
                'description': {'type': 'string'},
                'event_type': {'type': 'string', 'description': "competition, examination sau training_seminar (implicit competition)."},
                'coach_registration_deadline': {'type': 'string'},
            },
            'required': ['name', 'start_date'],
        },
    },
    {
        'name': 'create_category',
        'description': 'ADMIN. Propune crearea unei categorii noi pentru o competiție. Necesită confirmare.',
        'input_schema': {
            'type': 'object',
            'properties': {
                'event_id': {'type': 'integer'},
                'name': {'type': 'string'},
                'category_type': {'type': 'string', 'description': 'solo, team sau fight (implicit solo).'},
                'gender': {'type': 'string', 'description': 'male, female sau mixt (implicit mixt).'},
                'group_id': {'type': 'integer'},
            },
            'required': ['event_id', 'name'],
        },
    },
    {
        'name': 'edit_category',
        'description': 'ADMIN. Propune modificarea unei categorii existente - doar nume, gen și ordinea de afișare pot fi schimbate. Necesită confirmare.',
        'input_schema': {
            'type': 'object',
            'properties': {
                'category_id': {'type': 'integer'},
                'name': {'type': 'string'},
                'gender': {'type': 'string'},
                'display_order': {'type': 'integer'},
            },
            'required': ['category_id'],
        },
    },
    {
        'name': 'create_group',
        'description': 'ADMIN. Propune crearea unei grupe de vârstă noi pentru o competiție. Necesită confirmare.',
        'input_schema': {
            'type': 'object',
            'properties': {
                'event_id': {'type': 'integer'},
                'name': {'type': 'string'},
                'birth_year_start': {'type': 'integer'},
                'birth_year_end': {'type': 'integer'},
                'allow_younger': {'type': 'boolean'},
            },
            'required': ['event_id', 'name'],
        },
    },
    {
        'name': 'edit_group',
        'description': 'ADMIN. Propune modificarea unei grupe existente. Trimite doar câmpurile pe care vrei să le schimbi. Necesită confirmare.',
        'input_schema': {
            'type': 'object',
            'properties': {
                'group_id': {'type': 'integer'},
                'name': {'type': 'string'},
                'birth_year_start': {'type': 'integer'},
                'birth_year_end': {'type': 'integer'},
                'allow_younger': {'type': 'boolean'},
                'display_order': {'type': 'integer'},
            },
            'required': ['group_id'],
        },
    },
    {
        'name': 'list_pending_approvals',
        'description': (
            'ADMIN. Listează cererile în așteptare de aprobare - conturi, poze de profil, examene de grad, '
            'rezultate, stagii, vize. Nu necesită confirmare (doar citește).'
        ),
        'input_schema': {
            'type': 'object',
            'properties': {
                'domain': {'type': 'string', 'description': 'Opțional: account, photo, grade, result, seminar sau visa. Dacă lipsește, le arată pe toate.'},
            },
        },
    },
    {
        'name': 'approve_request',
        'description': 'ADMIN. Propune aprobarea unei cereri din coada de aprobări. Necesită confirmare.',
        'input_schema': {
            'type': 'object',
            'properties': {
                'domain': {'type': 'string', 'description': 'account, photo, grade, result, seminar sau visa.'},
                'item_id': {'type': 'integer'},
                'notes': {'type': 'string'},
            },
            'required': ['domain', 'item_id'],
        },
    },
    {
        'name': 'reject_request',
        'description': 'ADMIN. Propune respingerea unei cereri din coada de aprobări. Necesită confirmare.',
        'input_schema': {
            'type': 'object',
            'properties': {
                'domain': {'type': 'string', 'description': 'account, photo, grade, result, seminar sau visa.'},
                'item_id': {'type': 'integer'},
                'notes': {'type': 'string'},
            },
            'required': ['domain', 'item_id'],
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


def build_usage_report(since, until):
    """Aggregate real assistant usage between `since` and `until`
    (datetimes) for an admin to review periodically - which questions get
    asked, which tools get used, where a tool call actually failed. This
    is how the assistant is meant to get "smarter" over time: not by
    retraining anything, but by an admin reading real conversations here
    and refining SYSTEM_PROMPT/the tool set in assistant_tools.py based on
    what shows up (see the fix in this same file for a case exactly like
    that - the model claiming to have "prepared" a write it never
    actually called)."""
    from .models import AssistantMessage

    messages = AssistantMessage.objects.filter(
        created_at__gte=since, created_at__lt=until,
    ).select_related('conversation__user', 'conversation__user__athlete')

    user_messages = [m for m in messages if m.role == 'user']
    assistant_messages = [m for m in messages if m.role == 'assistant']

    tool_usage = {}
    write_action_counts = {'proposed': 0, 'confirmed': 0, 'cancelled': 0, 'failed': 0, 'pending': 0}
    recent_errors = []

    for m in assistant_messages:
        for call in (m.tool_calls or []):
            tool_name = call.get('tool', '?')
            result = call.get('result') or {}
            stats = tool_usage.setdefault(tool_name, {'tool': tool_name, 'count': 0, 'errors': 0})
            stats['count'] += 1
            has_error = bool(result.get('error'))
            if has_error:
                stats['errors'] += 1
                recent_errors.append({
                    'tool': tool_name,
                    'args': call.get('args'),
                    'error': result.get('error'),
                    'created_at': m.created_at,
                    'user': m.conversation.user.get_full_name() or m.conversation.user.email,
                })
            if result.get('requires_confirmation'):
                write_action_counts['proposed'] += 1
                status = result.get('status', 'pending')
                write_action_counts[status] = write_action_counts.get(status, 0) + 1

    recent_errors.sort(key=lambda e: e['created_at'], reverse=True)

    recent_questions = [
        {
            'content': m.content,
            'created_at': m.created_at,
            'user': m.conversation.user.get_full_name() or m.conversation.user.email,
        }
        for m in sorted(user_messages, key=lambda m: m.created_at, reverse=True)
    ]

    return {
        'period': {'since': since, 'until': until},
        'totals': {
            'conversations': len({m.conversation_id for m in messages}),
            'user_messages': len(user_messages),
            'assistant_messages': len(assistant_messages),
        },
        'tool_usage': sorted(tool_usage.values(), key=lambda t: t['count'], reverse=True),
        'write_actions': write_action_counts,
        'recent_questions': recent_questions[:50],
        'recent_errors': recent_errors[:50],
    }
