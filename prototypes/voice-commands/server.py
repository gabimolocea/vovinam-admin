"""Server local pentru masurarea recunoasterii comenzilor vocale.

Ruleaza pe calculatorul din sala si nu iese in internet: Whisper e local.
Serveste pagina de test, primeste inregistrarile, le transcrie si spune
cu ce comanda s-au potrivit.

Rularea:
    python3 server.py            # apoi deschide http://localhost:8777
"""

import json
import os
import subprocess
import sys
import tempfile
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from commands import COMMANDS, match  # noqa: E402

PORT = int(os.environ.get('PORT', '8777'))
MODEL = os.environ.get('WHISPER_MODEL', 'mlx-community/whisper-small-mlx')

# Vocabularul dat lui Whisper ca indiciu. Pentru un set inchis de
# comenzi, asta schimba mult rezultatul: modelul stie ce cuvinte sa
# astepte si nu mai inventeaza vecini fonetici.
PROMPT = 'Comenzi de arbitraj: ' + ', '.join(label for _id, label, _v in COMMANDS) + '.'

_transcribe = None


def load_backend():
    """Prima biblioteca Whisper disponibila. mlx e cea mai rapida pe
    Apple Silicon, dar nu vrem sa cada unealta daca lipseste."""
    global _transcribe
    if _transcribe:
        return _transcribe

    try:
        import mlx_whisper

        def run(path):
            out = mlx_whisper.transcribe(
                path, path_or_hf_repo=MODEL, language='ro', initial_prompt=PROMPT,
            )
            return out.get('text', '')
        _transcribe = run
        print(f'  motor: mlx_whisper ({MODEL})')
        return _transcribe
    except ImportError:
        pass

    try:
        from faster_whisper import WhisperModel
        model = WhisperModel(os.environ.get('WHISPER_MODEL', 'small'), compute_type='int8')

        def run(path):
            segments, _info = model.transcribe(path, language='ro', initial_prompt=PROMPT)
            return ' '.join(s.text for s in segments)
        _transcribe = run
        print('  motor: faster_whisper')
        return _transcribe
    except ImportError:
        pass

    raise RuntimeError(
        'Niciun motor Whisper instalat. Din folderul prototipului:\n'
        '  python3 -m venv .venv && ./.venv/bin/pip install mlx-whisper\n'
        '  ./.venv/bin/python server.py'
    )


def to_wav(raw):
    """Browserul inregistreaza webm/opus; Whisper vrea wav 16 kHz mono -
    exact rata la care lucreaza modelul, deci nu pierdem nimic."""
    with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as f:
        f.write(raw)
        src = f.name
    dst = src.replace('.webm', '.wav')
    subprocess.run(
        ['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-ar', '16000', '-ac', '1', dst],
        check=True,
    )
    os.unlink(src)
    return dst


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, code, body, ctype='application/json'):
        payload = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path in ('/', '/index.html'):
            here = os.path.dirname(os.path.abspath(__file__))
            with open(os.path.join(here, 'index.html'), 'rb') as f:
                return self._send(200, f.read(), 'text/html; charset=utf-8')
        if self.path == '/commands':
            return self._send(200, [
                {'id': cid, 'label': label} for cid, label, _v in COMMANDS
            ])
        self._send(404, {'error': 'not found'})

    def do_POST(self):
        if self.path != '/transcribe':
            return self._send(404, {'error': 'not found'})

        length = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(length)

        started = time.time()
        wav = None
        try:
            wav = to_wav(raw)
            text = load_backend()(wav).strip()
        except Exception as exc:
            return self._send(500, {'error': str(exc)})
        finally:
            if wav and os.path.exists(wav):
                os.unlink(wav)

        self._send(200, {
            'transcript': text,
            'matched': match(text),
            'latency_ms': int((time.time() - started) * 1000),
        })


if __name__ == '__main__':
    print(f'Test comenzi vocale  —  http://localhost:{PORT}')
    try:
        load_backend()
    except RuntimeError as exc:
        print(f'\n{exc}\n')
        sys.exit(1)
    print('  gata, deschide adresa de mai sus in browser\n')
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
