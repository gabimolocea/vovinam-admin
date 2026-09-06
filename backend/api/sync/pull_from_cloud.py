"""Fetch a fresh event pack directly from the cloud instance.

Used by the "Resincronizează din cloud" action on the local venue server so
an operator who just added a brand-new athlete/category in cloud (mid-event,
while briefly online) can bring that pack down to the local server with a
single click, instead of manually downloading/uploading a JSON file.

Requires CLOUD_SYNC_BASE_URL / CLOUD_SYNC_USERNAME / CLOUD_SYNC_PASSWORD to be
configured in the local server's environment (see .env.local.example). These
credentials should belong to a dedicated admin service account, not a
personal login.
"""

from __future__ import annotations

import requests
from django.conf import settings


class CloudSyncNotConfigured(Exception):
    """Raised when the local server has no cloud credentials configured."""


class CloudSyncError(Exception):
    """Raised when the cloud instance could not be reached or rejected us."""


def fetch_event_pack_from_cloud(event_id: int, timeout: int = 30) -> dict:
    base_url = (getattr(settings, 'CLOUD_SYNC_BASE_URL', '') or '').rstrip('/')
    username = getattr(settings, 'CLOUD_SYNC_USERNAME', '') or ''
    password = getattr(settings, 'CLOUD_SYNC_PASSWORD', '') or ''

    if not base_url or not username or not password:
        raise CloudSyncNotConfigured(
            'Resincronizarea automată din cloud nu este configurată pe acest '
            'server local. Completează CLOUD_SYNC_BASE_URL, CLOUD_SYNC_USERNAME '
            'și CLOUD_SYNC_PASSWORD în .env.local, sau folosește exportul/'
            'importul manual de fișier JSON.'
        )

    try:
        login_response = requests.post(
            f'{base_url}/api/auth/login/',
            json={'username': username, 'password': password},
            timeout=timeout,
        )
    except requests.RequestException as exc:
        raise CloudSyncError(
            f'Nu m-am putut conecta la aplicația din cloud ({base_url}). '
            'Verifică dacă ai internet chiar acum și încearcă din nou.'
        ) from exc

    if login_response.status_code != 200:
        raise CloudSyncError(
            'Autentificarea la cloud a eșuat. Verifică CLOUD_SYNC_USERNAME și '
            'CLOUD_SYNC_PASSWORD din .env.local.'
        )

    access_token = (login_response.json().get('tokens') or {}).get('access')
    if not access_token:
        raise CloudSyncError('Răspunsul de autentificare din cloud nu conține un token valid.')

    try:
        pack_response = requests.get(
            f'{base_url}/api/offline/event-pack/',
            params={'event_id': event_id},
            headers={'Authorization': f'Bearer {access_token}'},
            timeout=timeout,
        )
    except requests.RequestException as exc:
        raise CloudSyncError('Autentificarea a reușit, dar preluarea event pack-ului a eșuat.') from exc

    if pack_response.status_code != 200:
        detail = None
        try:
            detail = pack_response.json().get('detail')
        except ValueError:
            pass
        raise CloudSyncError(detail or f'Exportul din cloud a eșuat (status {pack_response.status_code}).')

    return pack_response.json()
