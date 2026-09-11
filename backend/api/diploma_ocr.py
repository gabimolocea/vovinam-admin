"""
AI-assisted certificate reading for athlete self-submission forms (results,
grade exams, seminar participation).

Given a photo of a diploma/certificate, asks Claude (vision) to read the
relevant fields off it, then fuzzy-matches those free-text guesses against
the actual Event/Category/Grade records in the database so the frontend can
prefill the submission form. This is a best-effort convenience feature: the
athlete always reviews/edits the suggested fields before submitting, and the
certificate photo itself is always stored and reviewed by a coach/admin
regardless of what the AI read.
"""
import base64
import difflib
import json
import logging

from django.conf import settings

logger = logging.getLogger(__name__)

PLACEMENT_MAP = {
    '1': '1st', 'i': '1st', 'primul': '1st', 'locul 1': '1st', 'locul i': '1st', 'gold': '1st', 'aur': '1st',
    '2': '2nd', 'ii': '2nd', 'locul 2': '2nd', 'locul ii': '2nd', 'silver': '2nd', 'argint': '2nd',
    '3': '3rd', 'iii': '3rd', 'locul 3': '3rd', 'locul iii': '3rd', 'bronze': '3rd', 'bronz': '3rd',
}

RESULT_EXTRACTION_PROMPT = """Această imagine este o diplomă sau un certificat de la o competiție de Vovinam. \
Extrage următoarele informații și răspunde STRICT cu un obiect JSON valid, fără alt text, cu exact aceste chei:
{
  "competition_name": string sau null (numele competiției/evenimentului),
  "category_name": string sau null (numele categoriei, de exemplu "Solo masculin", "Lupta -60kg"),
  "group_name": string sau null (grupa de vârstă, dacă apare),
  "placement": string sau null (locul obținut, ca text: ex "1", "locul 2", "III"),
  "athlete_name": string sau null (numele sportivului de pe diplomă, dacă apare)
}
Dacă un câmp nu apare clar pe imagine, folosește null pentru acel câmp."""

GRADE_EXTRACTION_PROMPT = """Această imagine este un certificat de grad (centură/dan) de Vovinam. \
Extrage următoarele informații și răspunde STRICT cu un obiect JSON valid, fără alt text, cu exact aceste chei:
{
  "grade_name": string sau null (gradul obținut, de exemplu "Centura Galbenă" sau "1 Dang"),
  "exam_event_name": string sau null (numele examenului/evenimentului la care a fost obținut gradul, dacă apare),
  "obtained_date": string sau null (data obținerii gradului, așa cum apare pe certificat),
  "athlete_name": string sau null (numele sportivului de pe certificat, dacă apare)
}
Dacă un câmp nu apare clar pe imagine, folosește null pentru acel câmp."""

SEMINAR_EXTRACTION_PROMPT = """Această imagine este un certificat de participare la un stagiu/seminar de Vovinam. \
Extrage următoarele informații și răspunde STRICT cu un obiect JSON valid, fără alt text, cu exact aceste chei:
{
  "seminar_name": string sau null (numele stagiului/seminarului),
  "start_date": string sau null (data de început, așa cum apare pe certificat),
  "end_date": string sau null (data de sfârșit, așa cum apare pe certificat),
  "athlete_name": string sau null (numele sportivului de pe certificat, dacă apare)
}
Dacă un câmp nu apare clar pe imagine, folosește null pentru acel câmp."""

VISA_EXTRACTION_PROMPT = """Această imagine este o legitimație sau o dovadă a unui control medical pentru un \
sportiv de Vovinam. Extrage următoarele informații și răspunde STRICT cu un obiect JSON valid, fără alt text, \
cu exact aceste chei:
{
  "issued_date": string sau null (data la care a fost făcut controlul/emisă legitimația, așa cum apare pe imagine),
  "athlete_name": string sau null (numele sportivului, dacă apare)
}
Dacă un câmp nu apare clar pe imagine, folosește null pentru acel câmp."""


def _best_match(text, candidates, cutoff=0.5):
    """Return (id, name) of the closest candidate name to `text`, or (None, None)."""
    if not text:
        return None, None
    names = {c[1]: c[0] for c in candidates}
    matches = difflib.get_close_matches(text.lower(), [n.lower() for n in names], n=1, cutoff=cutoff)
    if not matches:
        return None, None
    for name, obj_id in names.items():
        if name.lower() == matches[0]:
            return obj_id, name
    return None, None


def normalize_placement(raw):
    if not raw:
        return None
    key = str(raw).strip().lower()
    return PLACEMENT_MAP.get(key)


def normalize_date(raw):
    """Best-effort parse of a free-text date read off a certificate into
    'YYYY-MM-DD'. Returns None if it can't confidently parse it - the
    athlete fills the date in manually in that case."""
    if not raw:
        return None
    from dateutil import parser as date_parser
    try:
        return date_parser.parse(str(raw), dayfirst=True, fuzzy=True).date().isoformat()
    except (ValueError, OverflowError):
        return None


def _call_claude_vision(image_file, prompt):
    """Send `image_file` to Claude vision with `prompt` and return the
    parsed JSON dict (or {} if the response wasn't valid JSON). Raises
    RuntimeError if the AI call itself fails (missing key, network, etc.)."""
    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError('AI diploma reading is not configured (missing ANTHROPIC_API_KEY).')

    import anthropic

    image_file.seek(0)
    data = image_file.read()
    media_type = getattr(image_file, 'content_type', None) or 'image/jpeg'
    if media_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif'):
        media_type = 'image/jpeg'
    b64 = base64.b64encode(data).decode('ascii')

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    response = client.messages.create(
        model='claude-sonnet-4-5-20250929',
        max_tokens=400,
        messages=[{
            'role': 'user',
            'content': [
                {'type': 'image', 'source': {'type': 'base64', 'media_type': media_type, 'data': b64}},
                {'type': 'text', 'text': prompt},
            ],
        }],
    )
    raw_text = response.content[0].text.strip()
    # Models sometimes wrap JSON in a ```json fence despite instructions — strip it defensively.
    if raw_text.startswith('```'):
        raw_text = raw_text.strip('`')
        if raw_text.lower().startswith('json'):
            raw_text = raw_text[4:]
    try:
        return json.loads(raw_text)
    except (ValueError, json.JSONDecodeError):
        logger.warning('Certificate OCR: could not parse AI response as JSON: %r', raw_text)
        return {}


def extract_diploma_fields(image_file):
    """Call Claude vision on an uploaded competition diploma image and
    return a dict with raw AI guesses plus DB-matched suggestions."""
    parsed = _call_claude_vision(image_file, RESULT_EXTRACTION_PROMPT)

    from .models import Category
    from landing.models import Event

    events = list(Event.objects.values_list('id', 'title'))
    event_id, event_title = _best_match(parsed.get('competition_name'), events)

    categories_qs = Category.objects.filter(event_id=event_id) if event_id else Category.objects.all()
    categories = list(categories_qs.values_list('id', 'name'))
    category_id, category_name = _best_match(parsed.get('category_name'), categories)

    group_id = None
    if category_id:
        cat = Category.objects.filter(id=category_id).select_related('group').first()
        if cat and cat.group_id:
            group_id = cat.group_id

    return {
        'raw': {
            'competition_name': parsed.get('competition_name'),
            'category_name': parsed.get('category_name'),
            'group_name': parsed.get('group_name'),
            'placement': parsed.get('placement'),
            'athlete_name': parsed.get('athlete_name'),
        },
        'suggested': {
            'event_id': event_id,
            'event_title': event_title,
            'category_id': category_id,
            'category_name': category_name,
            'group_id': group_id,
            'placement_claimed': normalize_placement(parsed.get('placement')),
        },
    }


def extract_grade_certificate_fields(image_file):
    """Call Claude vision on an uploaded grade certificate image and return
    a dict with raw AI guesses plus DB-matched suggestions (grade, exam
    event, obtained date)."""
    parsed = _call_claude_vision(image_file, GRADE_EXTRACTION_PROMPT)

    from .models import Grade
    from landing.models import Event

    grades = list(Grade.objects.values_list('id', 'name'))
    grade_id, grade_name = _best_match(parsed.get('grade_name'), grades)

    events = list(Event.objects.filter(event_type='examination').values_list('id', 'title'))
    event_id, event_title = _best_match(parsed.get('exam_event_name'), events)

    return {
        'raw': {
            'grade_name': parsed.get('grade_name'),
            'exam_event_name': parsed.get('exam_event_name'),
            'obtained_date': parsed.get('obtained_date'),
            'athlete_name': parsed.get('athlete_name'),
        },
        'suggested': {
            'grade_id': grade_id,
            'grade_name': grade_name,
            'event_id': event_id,
            'event_title': event_title,
            'obtained_date': normalize_date(parsed.get('obtained_date')),
        },
    }


def extract_seminar_certificate_fields(image_file):
    """Call Claude vision on an uploaded seminar/stagiu certificate image
    and return a dict with raw AI guesses plus a DB-matched suggested
    event."""
    parsed = _call_claude_vision(image_file, SEMINAR_EXTRACTION_PROMPT)

    from landing.models import Event

    events = list(Event.objects.filter(event_type='training_seminar').values_list('id', 'title'))
    event_id, event_title = _best_match(parsed.get('seminar_name'), events)

    return {
        'raw': {
            'seminar_name': parsed.get('seminar_name'),
            'start_date': parsed.get('start_date'),
            'end_date': parsed.get('end_date'),
            'athlete_name': parsed.get('athlete_name'),
        },
        'suggested': {
            'event_id': event_id,
            'event_title': event_title,
        },
    }


def extract_visa_certificate_fields(image_file):
    """Call Claude vision on an uploaded medical/annual visa photo and
    return a dict with the raw AI guess plus a normalized suggested
    issued date."""
    parsed = _call_claude_vision(image_file, VISA_EXTRACTION_PROMPT)

    return {
        'raw': {
            'issued_date': parsed.get('issued_date'),
            'athlete_name': parsed.get('athlete_name'),
        },
        'suggested': {
            'issued_date': normalize_date(parsed.get('issued_date')),
        },
    }
