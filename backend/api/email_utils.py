"""
Transactional email for notification status changes (result/grade/seminar/
visa approved/rejected/revision-required). Uses a single branded HTML+text
template pair (templates/emails/status_notification.{html,txt}) parameterized
per event, rather than one near-identical template per event type.

Sending never raises - a broken SES config or outage must never block an
admin's approve/reject action, so failures are logged and swallowed.
"""
import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)


def send_status_email(recipient, title, message, cta_label=None, cta_path=None):
    """Send the branded status-change email to `recipient` (a User).
    `cta_path` is either a path on the public site (e.g. '/cont'), turned
    into an absolute link via settings.FRONTEND_URL, or an already-absolute
    URL (e.g. into the dashboard app at settings.APP_URL) used as-is - a
    coach/athlete/admin's own profile, notifications, etc. now live there,
    not on the public site."""
    if not recipient or not recipient.email:
        return

    if cta_path and cta_path.startswith('http'):
        cta_url = cta_path
    elif cta_path:
        cta_url = f"{settings.FRONTEND_URL.rstrip('/')}{cta_path}"
    else:
        cta_url = None

    context = {
        'recipient_name': recipient.get_full_name() or recipient.email,
        'title': title,
        'message': message,
        'cta_label': cta_label,
        'cta_url': cta_url,
        'settings_url': f"{settings.APP_URL.rstrip('/')}/notifications",
        'logo_url': f"{settings.FRONTEND_URL.rstrip('/')}/frvv-logo.png",
    }

    try:
        text_body = render_to_string('emails/status_notification.txt', context)
        html_body = render_to_string('emails/status_notification.html', context)
        email = EmailMultiAlternatives(
            subject=f'[Vovinam] {title}',
            body=text_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[recipient.email],
        )
        email.attach_alternative(html_body, 'text/html')
        email.send(fail_silently=True)
    except Exception:
        logger.exception('Failed to send status email to %s', recipient.email)
