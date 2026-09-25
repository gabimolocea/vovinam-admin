"""Transcrierea comenzilor vocale de arbitraj.

Whisper ruleaza local, pe calculatorul din sala: sala poate foarte bine
sa n-aiba internet, iar restul sistemului e construit pornind de la asta.

Endpoint-ul transcrie si interpreteaza, dar NU aplica nimic. Ce e
posibil intr-un moment dat - daca exista repriza activa, daca meciul s-a
incheiat - stie panoul de operare, si nu vrem doua adevaruri despre
starea meciului.
"""

import os
import subprocess
import tempfile
import time

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from ..permissions import IsAdmin
from ..voice_commands import COMMANDS, interpret

_transcribe = None

# Vocabularul dat modelului ca indiciu. Pentru un set inchis de comenzi
# schimba mult rezultatul: modelul stie ce cuvinte sa astepte si nu mai
# inventeaza vecini fonetici.
_PROMPT = 'Comenzi de arbitraj: ' + ', '.join(label for _id, label, _v in COMMANDS) + '.'


def _load_backend():
    """Motorul Whisper, incarcat la prima cerere.

    Nu e in cerintele backendului: e optional, iar un server care nu-l
    are trebuie sa porneasca normal si sa raspunda limpede ca functia
    lipseste - nu sa cada la import.
    """
    global _transcribe
    if _transcribe:
        return _transcribe

    model = os.environ.get('WHISPER_MODEL', 'mlx-community/whisper-small-mlx')
    try:
        import mlx_whisper

        def run(path):
            out = mlx_whisper.transcribe(
                path, path_or_hf_repo=model, language='ro', initial_prompt=_PROMPT,
            )
            return out.get('text', '')
        _transcribe = run
        return _transcribe
    except ImportError:
        pass

    try:
        from faster_whisper import WhisperModel
        loaded = WhisperModel(os.environ.get('WHISPER_MODEL', 'small'), compute_type='int8')

        def run(path):
            segments, _info = loaded.transcribe(path, language='ro', initial_prompt=_PROMPT)
            return ' '.join(s.text for s in segments)
        _transcribe = run
        return _transcribe
    except ImportError:
        pass

    return None


def _to_wav(raw):
    """Browserul inregistreaza webm/opus; modelul lucreaza la 16 kHz
    mono, deci convertim exact acolo si nu pierdem nimic."""
    with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as f:
        f.write(raw)
        src = f.name
    dst = src.replace('.webm', '.wav')
    try:
        subprocess.run(
            ['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-ar', '16000', '-ac', '1', dst],
            check=True, timeout=20,
        )
    finally:
        if os.path.exists(src):
            os.unlink(src)
    return dst


@api_view(['POST'])
@permission_classes([IsAdmin])
def voice_command(request):
    backend = _load_backend()
    if backend is None:
        return Response(
            {'error': 'Asistentul vocal nu e instalat pe acest server.',
             'detail': 'Lipseste mlx-whisper (sau faster-whisper).'},
            status=503,
        )

    raw = request.body
    if not raw:
        return Response({'error': 'Nicio inregistrare primita.'}, status=400)

    require_wake = request.GET.get('wake', '1') != '0'

    started = time.time()
    wav = None
    try:
        wav = _to_wav(raw)
        text = backend(wav).strip()
    except subprocess.TimeoutExpired:
        return Response({'error': 'Conversia audio a durat prea mult.'}, status=504)
    except Exception as exc:
        return Response({'error': str(exc)}, status=500)
    finally:
        if wav and os.path.exists(wav):
            os.unlink(wav)

    code, command = interpret(text, require_wake_word=require_wake)
    return Response({
        'transcript': text,
        'code': code,
        'command': command,
        'latency_ms': int((time.time() - started) * 1000),
    })
