"""
WhatsApp notifications via Meta's WhatsApp Cloud API. Outside an open
24-hour customer-service window, WhatsApp only allows sending pre-approved
message *templates* (not free text) - so this sends a single approved
template (see settings.WHATSAPP_TEMPLATE_NAME) with the notification's
title/message as its two body variables, mirroring the branded email.

No-ops (logs and returns) when WhatsApp isn't configured, so nothing here
ever blocks an admin's approve/reject action.
"""
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

GRAPH_API_VERSION = 'v21.0'


def _is_configured():
    return bool(settings.WHATSAPP_ACCESS_TOKEN and settings.WHATSAPP_PHONE_NUMBER_ID)


def send_whatsapp_status_message(to_number, title, message):
    """Send the status-notification template message to `to_number` (E.164
    format, e.g. +40712345678). Silently no-ops if WhatsApp isn't configured
    or the recipient has no phone number on file."""
    if not _is_configured() or not to_number:
        return

    url = f'https://graph.facebook.com/{GRAPH_API_VERSION}/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages'
    payload = {
        'messaging_product': 'whatsapp',
        'to': to_number,
        'type': 'template',
        'template': {
            'name': settings.WHATSAPP_TEMPLATE_NAME,
            'language': {'code': 'ro'},
            'components': [{
                'type': 'body',
                'parameters': [
                    {'type': 'text', 'text': title},
                    {'type': 'text', 'text': message},
                ],
            }],
        },
    }
    try:
        response = requests.post(
            url,
            json=payload,
            headers={'Authorization': f'Bearer {settings.WHATSAPP_ACCESS_TOKEN}'},
            timeout=10,
        )
        if response.status_code >= 400:
            logger.error('WhatsApp send failed (%s): %s', response.status_code, response.text)
    except requests.RequestException:
        logger.exception('Failed to send WhatsApp message to %s', to_number)
