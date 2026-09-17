"""
Utility functions for creating and managing notifications
"""
from django.conf import settings as django_settings
from django.utils import timezone
from .models import Notification, User, NotificationSettings
from .email_utils import send_status_email
from .whatsapp_utils import send_whatsapp_status_message

# Every notification type gets an email - not just result/grade/seminar/visa
# status changes. Where a dedicated NotificationSettings field exists (the
# four submission domains, competition updates, system announcements) it
# gates the email; the profile-tab link only makes sense for the four
# submission domains (mirrors the frontend's NotificationBell.jsx linkFor()).
DOMAIN_EMAIL_FIELDS = {
    'result': 'email_on_result_status_change',
    'grade': 'email_on_grade_status_change',
    'seminar': 'email_on_seminar_status_change',
    'visa': 'email_on_visa_status_change',
    'competition': 'email_on_competition_updates',
    'system_announcement': 'email_on_system_announcements',
}
DOMAIN_TABS = {'result': 'rezultate', 'grade': 'grade', 'seminar': 'seminarii', 'visa': 'vize'}
STATUS_SUFFIXES = ('_approved', '_rejected', '_revision_required')

# account_approved/profile_update_approved already send their own richer,
# unconditional email (with a custom message and CTA) right after calling
# create_notification() - skip them here so that email isn't sent twice.
EMAILED_ELSEWHERE = {'account_approved', 'profile_update_approved'}


def _send_status_channels(recipient, settings, notification_type, title, message):
    """Send the email/WhatsApp side-channels for a notification, if the
    recipient's settings and contact info allow it. Never raises -
    email_utils/whatsapp_utils already swallow their own failures.

    Types with no dedicated settings field (profile picture reviews,
    supporter relations, roster registrations) are always emailed - there's
    no "don't tell me" toggle for those, same as account_approved/
    profile_update_approved (handled outside this function - see
    EMAILED_ELSEWHERE), which email unconditionally too."""
    if notification_type in EMAILED_ELSEWHERE:
        return

    domain = next((d for d in DOMAIN_EMAIL_FIELDS if notification_type.startswith(d)), None)
    email_field = DOMAIN_EMAIL_FIELDS.get(domain)
    should_email = getattr(settings, email_field, True) if email_field else True

    if should_email:
        tab = DOMAIN_TABS.get(domain)
        # An athlete's own profile (grade/result/seminar/visa tabs) now
        # lives in the dashboard app, not the public site's old /cont/profil.
        cta_path = f"{django_settings.APP_URL.rstrip('/')}/profil?tab={tab}" if tab else None
        send_status_email(recipient, title, message, cta_label='Vezi profilul meu' if cta_path else None, cta_path=cta_path)

    suffix = next((s for s in STATUS_SUFFIXES if notification_type.endswith(s)), None)
    if settings.notify_via_whatsapp and domain in DOMAIN_TABS and suffix:
        phone = recipient.phone_number or getattr(getattr(recipient, 'athlete', None), 'mobile_number', None)
        if phone:
            send_whatsapp_status_message(phone, title, message)


def create_notification(recipient, notification_type, title, message, related_result=None, related_competition=None, action_data=None):
    """
    Create a notification for a user
    
    Args:
        recipient: User object or user ID
        notification_type: String from Notification.NOTIFICATION_TYPES
        title: Notification title
        message: Notification message
        related_result: Optional CategoryAthleteScore object (must be saved to DB)
        related_competition: Optional Competition object (must be saved to DB)
        action_data: Optional dict with additional data
    
    Returns:
        Notification object if created, None if user has disabled this notification type
    """
    if not recipient:
        return None

    if isinstance(recipient, int):
        try:
            recipient = User.objects.get(id=recipient)
        except User.DoesNotExist:
            return None
    
    # Check user's notification settings
    settings, _ = NotificationSettings.objects.get_or_create(user=recipient)
    
    # Map notification types to settings fields
    setting_mapping = {
        'result_submitted': 'notify_result_submitted',
        'result_approved': 'notify_result_approved',
        'result_rejected': 'notify_result_rejected',
        'result_revision_required': 'notify_result_revision_required',
        'grade_submitted': 'notify_grade_submitted',
        'grade_approved': 'notify_grade_approved',
        'grade_rejected': 'notify_grade_rejected',
        'grade_revision_required': 'notify_grade_revision_required',
        'seminar_submitted': 'notify_seminar_submitted',
        'seminar_approved': 'notify_seminar_approved',
        'seminar_rejected': 'notify_seminar_rejected',
        'seminar_revision_required': 'notify_seminar_revision_required',
        'competition_created': 'notify_competition_created',
        'competition_updated': 'notify_competition_updated',
        'system_announcement': 'notify_system_announcements',
    }
    
    # Check if user wants this type of notification
    setting_field = setting_mapping.get(notification_type)
    if setting_field and not getattr(settings, setting_field, True):
        return None
    
    # Only include related objects if they are saved to the database
    notification_data = {
        'recipient': recipient,
        'notification_type': notification_type,
        'title': title,
        'message': message,
        'action_data': action_data
    }
    
    # Only add related objects if they have been saved (have an ID)
    if related_result and hasattr(related_result, 'pk') and related_result.pk:
        notification_data['related_result'] = related_result
    
    if related_competition and hasattr(related_competition, 'pk') and related_competition.pk:
        notification_data['related_competition'] = related_competition
    
    # Create the notification
    notification = Notification.objects.create(**notification_data)

    _send_status_channels(recipient, settings, notification_type, title, message)

    return notification


def notify_welcome_email(user):
    """Sent once, right after self-service registration - both the plain and
    "enhanced" /auth/register* endpoints share UserRegistrationSerializer, so
    its create() is the single hook point for both."""
    send_status_email(
        user,
        title='Bine ai venit la Federația Română de Vovinam Việt Võ Đạo!',
        message=(
            'Contul tău a fost creat cu succes.\n\n'
            'Următorul pas este să completezi profilul tău de sportiv, ca să poți trimite '
            'rezultate, examene de grad, participări la seminarii și vize medicale spre aprobare.'
        ),
        cta_label='Completează profilul',
        cta_path='/cont',
    )


def notify_account_approved(athlete):
    """Sent when an athlete's profile/account is approved (Athlete.approve())
    - distinct from the per-submission result/grade/seminar/visa approvals,
    and from notify_profile_image_reviewed below (which only covers the
    separate profile-picture approval)."""
    if not athlete.user:
        return
    create_notification(
        recipient=athlete.user,
        notification_type='account_approved',
        title='Cont aprobat',
        message='Profilul tău de sportiv a fost verificat și aprobat. Este acum vizibil public pe site.',
    )
    send_status_email(
        athlete.user,
        title='Contul tău a fost aprobat!',
        message=(
            'Profilul tău de sportiv a fost verificat și aprobat de un administrator.\n\n'
            'Este acum vizibil public pe site și poți trimite rezultate, examene de grad, '
            'participări la seminarii și vize medicale spre aprobare.'
        ),
        cta_label='Vezi profilul meu',
        cta_path=f"{django_settings.APP_URL.rstrip('/')}/profil",
    )


def notify_profile_update_approved(athlete):
    """Sent when an *already-approved* athlete edits their profile and an
    admin re-approves the update - distinct from notify_account_approved
    (the first-ever approval), whose "acum vizibil public" wording doesn't
    fit a profile that was already public before this edit."""
    if not athlete.user:
        return
    create_notification(
        recipient=athlete.user,
        notification_type='profile_update_approved',
        title='Actualizare profil aprobată',
        message='Modificările aduse profilului tău de sportiv au fost verificate și aprobate de un administrator.',
    )
    send_status_email(
        athlete.user,
        title='Actualizarea profilului tău a fost aprobată',
        message=(
            'Modificările aduse profilului tău de sportiv au fost verificate și aprobate de un administrator.\n\n'
            'Profilul tău este din nou vizibil public pe site.'
        ),
        cta_label='Vezi profilul meu',
        cta_path=f"{django_settings.APP_URL.rstrip('/')}/profil",
    )


def _club_coach_recipients(athlete, exclude_user=None):
    """Users who coach the athlete's club - notified alongside admins when
    that athlete submits something, so a coach sees their own roster's
    activity without needing to be an admin. Excludes `exclude_user` (the
    submitter themselves, when they're also their own club's coach) to
    avoid a duplicate self-notification."""
    if not athlete.club:
        return []
    return [c.user for c in athlete.club.coaches.filter(is_coach=True) if c.user and c.user != exclude_user]


def _status_change_coach_recipients(athletes, exclude_user=None):
    """Deduplicated club-coach Users for a list of athletes (e.g. every
    member of a team result) - notified alongside the athlete(s) when a
    submission's status changes, so a coach sees the outcome even when an
    admin (not them) was the one who reviewed it. `exclude_user` is
    normally the reviewer themselves, who already knows."""
    seen_ids = set()
    recipients = []
    for athlete in athletes:
        if not athlete:
            continue
        for coach_user in _club_coach_recipients(athlete, exclude_user=athlete.user):
            if coach_user.id in seen_ids or coach_user == exclude_user:
                continue
            seen_ids.add(coach_user.id)
            recipients.append(coach_user)
    return recipients


def _submission_recipients(athlete):
    """Admins plus the athlete's club coaches, deduplicated - the standard
    audience for a "new submission awaiting approval" notification."""
    recipients = list(User.objects.filter(role='admin'))
    seen_ids = {u.id for u in recipients}
    for coach_user in _club_coach_recipients(athlete, exclude_user=athlete.user):
        if coach_user.id not in seen_ids:
            recipients.append(coach_user)
            seen_ids.add(coach_user.id)
    return recipients


def notify_profile_image_submitted(athlete):
    """Notify admins and the athlete's club coaches that a new profile
    picture is awaiting approval - same audience as any other submission
    (see _submission_recipients), not coach-first-with-admin-fallback."""
    recipients = _submission_recipients(athlete)
    for recipient in recipients:
        create_notification(
            recipient=recipient,
            notification_type='profile_image_submitted',
            title='Poză de profil în așteptare',
            message=f'{athlete.first_name} {athlete.last_name} a trimis o nouă poză de profil spre aprobare.',
            action_data={'athlete_id': athlete.id, 'athlete_name': f'{athlete.first_name} {athlete.last_name}'},
        )


def notify_athlete_registered(athlete):
    """Notify admins and the club's coaches (same audience as any other
    submission - see _submission_recipients) that a new athlete/coach has
    registered and awaits approval. Admins are notified even when the
    athlete has no club yet - that's exactly the case a coach can't cover."""
    recipients = _submission_recipients(athlete)
    for recipient in recipients:
        create_notification(
            recipient=recipient,
            notification_type='athlete_registered',
            title='Sportiv nou înregistrat',
            message=f'{athlete.first_name} {athlete.last_name} s-a înregistrat la clubul tău și așteaptă aprobare.',
            action_data={'athlete_id': athlete.id, 'athlete_name': f'{athlete.first_name} {athlete.last_name}'},
        )


def notify_profile_image_reviewed(athlete, approved):
    """Notify the athlete that their pending profile picture was approved/rejected."""
    if not athlete.user:
        return
    create_notification(
        recipient=athlete.user,
        notification_type='profile_image_approved' if approved else 'profile_image_rejected',
        title='Poză de profil aprobată' if approved else 'Poză de profil respinsă',
        message=(
            'Noua ta poză de profil a fost aprobată și este acum vizibilă public.'
            if approved else
            f'Noua ta poză de profil a fost respinsă.{" Motiv: " + athlete.profile_image_admin_notes if athlete.profile_image_admin_notes else ""}'
        ),
    )


def create_result_submitted_notification(result):
    """Create notification when an athlete submits a result"""
    athlete = result.athlete
    
    # Prepare event/competition compatibility info
    entity = getattr(result.category, 'event_or_competition', None) or result.category.competition
    entity_name = getattr(entity, 'name', None) or getattr(entity, 'title', None) or 'N/A'
    entity_date = getattr(entity, 'date', None) or getattr(entity, 'start_date', None) or None
    placement_suffix = f' - {result.get_placement_claimed_display()}' if result.placement_claimed else ''

    # Notification for the athlete (confirmation)
    create_notification(
        recipient=athlete.user,
        notification_type='result_submitted',
        title='Rezultat trimis cu succes',
        message=f'Rezultatul tău la {result.category.name} de la {entity_name}{placement_suffix} a fost trimis și așteaptă aprobare.',
        related_result=result,
        action_data={
            'category_name': result.category.name,
            'competition_name': getattr(result.category.competition, 'name', None) if getattr(result.category, 'competition', None) else None,
            'event_id': getattr(result.category.event, 'id', None) if getattr(result.category, 'event', None) else None,
            'event_name': getattr(result.category.event, 'title', None) or getattr(result.category.event, 'name', None) if getattr(result.category, 'event', None) else None,
            'event_start': entity_date.isoformat() if entity_date else None,
            'placement_claimed': result.placement_claimed,
            'result_type': result.type
        }
    )
    
    # Notification for admins and the athlete's club coaches
    for admin in _submission_recipients(athlete):
        create_notification(
            recipient=admin,
            notification_type='result_submitted',
            title='Rezultat nou trimis spre aprobare',
            message=f'{athlete.first_name} {athlete.last_name} a trimis un rezultat la {result.category.name} de la {entity_name}.',
            related_result=result,
            action_data={
                'athlete_id': athlete.id,
                'athlete_name': f'{athlete.first_name} {athlete.last_name}',
                'category_name': result.category.name,
                'competition_name': getattr(result.category.competition, 'name', None) if getattr(result.category, 'competition', None) else None,
                'event_id': getattr(result.category.event, 'id', None) if getattr(result.category, 'event', None) else None,
                'event_name': getattr(result.category.event, 'title', None) or getattr(result.category.event, 'name', None) if getattr(result.category, 'event', None) else None,
                'event_start': entity_date.isoformat() if entity_date else None,
                'placement_claimed': result.placement_claimed,
                'result_type': result.type
            }
        )


def create_result_status_notification(result, new_status, admin_user, admin_notes=''):
    """Create notification when result status changes (approved/rejected/revision_required)"""
    athlete = result.athlete

    # Prefer event when available for richer payloads; competitions may only
    # expose `title` (landing.Event) rather than `name`.
    entity = getattr(result.category, 'event_or_competition', None) or result.category.competition
    entity_name = getattr(entity, 'name', None) or getattr(entity, 'title', None) or 'N/A'
    entity_date = getattr(entity, 'date', None) or getattr(entity, 'start_date', None) or None

    # State exactly what result this is about - the claimed placement (e.g.
    # "Locul 1"), not just the category name, so "ce rezultat a fost aprobat"
    # is answered without opening the site.
    placement_suffix = f' - {result.get_placement_claimed_display()}' if result.placement_claimed else ''

    # Map status to notification type and messages
    status_mapping = {
        'approved': {
            'type': 'result_approved',
            'title': 'Rezultat aprobat!',
            'message': f'Felicitări! Rezultatul tău la {result.category.name} de la {entity_name}{placement_suffix} a fost aprobat.',
        },
        'rejected': {
            'type': 'result_rejected',
            'title': 'Rezultat respins',
            'message': f'Rezultatul tău la {result.category.name} de la {entity_name}{placement_suffix} a fost respins.',
        },
        'revision_required': {
            'type': 'result_revision_required',
            'title': 'Rezultat - sunt necesare completări',
            'message': f'Rezultatul tău la {result.category.name} de la {entity_name}{placement_suffix} necesită completări.',
        }
    }

    status_info = status_mapping.get(new_status)
    if not status_info:
        return

    # Add admin notes to message if provided
    message = status_info['message']
    if admin_notes:
        message += f'\n\nNote administrator: {admin_notes}'

    action_data = {
        'category_name': result.category.name,
        'competition_name': entity_name,
        'event_id': getattr(result.category.event, 'id', None) if getattr(result.category, 'event', None) else None,
        'event_name': entity_name,
        'event_start': entity_date.isoformat() if entity_date else None,
        'placement_claimed': result.placement_claimed,
        'result_type': result.type,
        'reviewed_by': str(admin_user) if admin_user else 'Admin',
        'admin_notes': admin_notes,
        'new_status': new_status
    }

    # Team results may have no individual submitter (athlete=None); notify
    # every team member instead of a single recipient in that case.
    recipients = [athlete] if athlete else list(result.team_members.all())
    for recipient_athlete in recipients:
        if not getattr(recipient_athlete, 'user_id', None):
            continue
        create_notification(
            recipient=recipient_athlete.user,
            notification_type=status_info['type'],
            title=status_info['title'],
            message=message,
            related_result=result,
            action_data=action_data,
        )

    # Let the club's coaches see the outcome too, even if an admin (not
    # them) reviewed it.
    coach_predicate = {'approved': 'a fost aprobat', 'rejected': 'a fost respins', 'revision_required': 'necesită completări'}[new_status]
    athlete_names = ' și '.join(f'{a.first_name} {a.last_name}' for a in recipients if a) or 'un sportiv din club'
    coach_message = f'Rezultatul lui {athlete_names} la {result.category.name} de la {entity_name}{placement_suffix} {coach_predicate}.'
    for coach_user in _status_change_coach_recipients(recipients, exclude_user=admin_user):
        create_notification(
            recipient=coach_user,
            notification_type=status_info['type'],
            title=status_info['title'],
            message=coach_message,
            related_result=result,
            action_data={**action_data, 'athlete_id': athlete.id if athlete else None, 'athlete_name': athlete_names},
        )


def create_competition_notification(competition, notification_type='competition_created'):
    """Create notification for competition events"""
    # Notify all athletes about new/updated competitions
    athletes = User.objects.filter(role='athlete')
    # `competition` may be a plain landing.Event or the api.models.Competition
    # proxy; only the proxy exposes `.name` (an alias for `.title`).
    competition_name = getattr(competition, 'name', None) or getattr(competition, 'title', str(competition))

    if notification_type == 'competition_created':
        title = 'Competiție nouă disponibilă'
        message = f'Competiția „{competition_name}” a fost creată și este disponibilă pentru înscriere.'
    else:
        title = 'Competiție actualizată'
        message = f'Competiția „{competition_name}” a fost actualizată. Verifică eventualele modificări.'
    
    start_date = getattr(competition, 'start_date', None)
    for athlete in athletes:
        create_notification(
            recipient=athlete,
            notification_type=notification_type,
            title=title,
            message=message,
            related_competition=competition,
            action_data={
                'competition_name': competition_name,
                'competition_date': start_date.isoformat() if start_date else None,
                'location': getattr(competition, 'address', ''),
            }
        )


def get_unread_notification_count(user):
    """Get count of unread notifications for a user"""
    return Notification.objects.filter(recipient=user, is_read=False).count()


def mark_notifications_as_read(user, notification_ids=None):
    """Mark notifications as read for a user"""
    queryset = Notification.objects.filter(recipient=user, is_read=False)
    
    if notification_ids:
        queryset = queryset.filter(id__in=notification_ids)
    
    updated_count = queryset.update(is_read=True, read_at=timezone.now())
    return updated_count


# Grade History Notification Functions
def create_grade_submitted_notification(grade_history):
    """Create notification when an athlete submits a grade history"""
    athlete = grade_history.athlete
    
    # Notification for the athlete (confirmation)
    create_notification(
        recipient=athlete.user,
        notification_type='grade_submitted',
        title='Examen de grad trimis cu succes',
        message=f'Cererea ta de examen de grad pentru {grade_history.grade.name} a fost trimisă și așteaptă aprobare.',
        action_data={
            'grade_name': grade_history.grade.name,
                'event': grade_history.event.id if getattr(grade_history, 'event', None) else None,
                'event_name': grade_history.event.title if getattr(grade_history, 'event', None) else None,
                'event_start': grade_history.event.start_date.isoformat() if getattr(grade_history, 'event', None) and getattr(grade_history.event, 'start_date', None) else None,
            'level': grade_history.level
        }
    )
    
    # Notification for admins and the athlete's club coaches
    for admin in _submission_recipients(athlete):
        create_notification(
            recipient=admin,
            notification_type='grade_submitted',
            title='Examen de grad nou trimis spre aprobare',
            message=f'{athlete.first_name} {athlete.last_name} a trimis o cerere de examen de grad pentru {grade_history.grade.name}.',
            action_data={
                'athlete_id': athlete.id,
                'athlete_name': f'{athlete.first_name} {athlete.last_name}',
                'grade_history_id': grade_history.id,
                'grade_name': grade_history.grade.name,
                    'event': grade_history.event.id if getattr(grade_history, 'event', None) else None,
                    'event_name': grade_history.event.title if getattr(grade_history, 'event', None) else None,
                    'event_start': grade_history.event.start_date.isoformat() if getattr(grade_history, 'event', None) and getattr(grade_history.event, 'start_date', None) else None,
                'level': grade_history.level
            }
        )


def create_grade_status_notification(grade_history, new_status, admin_user, admin_notes=''):
    """Create notification when grade history status changes"""
    athlete = grade_history.athlete
    
    # Map status to notification type and messages
    status_mapping = {
        'approved': {
            'type': 'grade_approved',
            'title': 'Examen de grad aprobat!',
            'message': f'Felicitări! Examenul tău de grad pentru {grade_history.grade.name} a fost aprobat.',
        },
        'rejected': {
            'type': 'grade_rejected',
            'title': 'Examen de grad respins',
            'message': f'Cererea ta de examen de grad pentru {grade_history.grade.name} a fost respinsă.',
        },
        'revision_required': {
            'type': 'grade_revision_required',
            'title': 'Examen de grad - sunt necesare completări',
            'message': f'Cererea ta de examen de grad pentru {grade_history.grade.name} necesită completări.',
        }
    }

    status_info = status_mapping.get(new_status)
    if not status_info:
        return

    # Add admin notes to message if provided
    message = status_info['message']
    if admin_notes:
        message += f'\n\nNote administrator: {admin_notes}'

    action_data = {
        'grade_name': grade_history.grade.name,
        'event': grade_history.event.id if getattr(grade_history, 'event', None) else None,
        'event_name': grade_history.event.title if getattr(grade_history, 'event', None) else None,
        'event_start': grade_history.event.start_date.isoformat() if getattr(grade_history, 'event', None) and getattr(grade_history.event, 'start_date', None) else None,
        'level': grade_history.level,
        'reviewed_by': str(admin_user) if admin_user else 'Admin',
        'admin_notes': admin_notes,
        'new_status': new_status,
    }

    # Create notification for the athlete
    create_notification(
        recipient=athlete.user,
        notification_type=status_info['type'],
        title=status_info['title'],
        message=message,
        action_data=action_data,
    )

    # Let the club's coaches see the outcome too, even if an admin (not
    # them) reviewed it.
    coach_predicate = {'approved': 'a fost aprobat', 'rejected': 'a fost respins', 'revision_required': 'necesită completări'}[new_status]
    coach_message = f'Examenul de grad al lui {athlete.first_name} {athlete.last_name} pentru {grade_history.grade.name} {coach_predicate}.'
    for coach_user in _status_change_coach_recipients([athlete], exclude_user=admin_user):
        create_notification(
            recipient=coach_user,
            notification_type=status_info['type'],
            title=status_info['title'],
            message=coach_message,
            action_data={**action_data, 'athlete_id': athlete.id, 'athlete_name': f'{athlete.first_name} {athlete.last_name}'},
        )


# Training Seminar Notification Functions
def create_seminar_submitted_notification(participation):
    """Create notification when an athlete submits seminar participation"""
    athlete = participation.athlete
    seminar = getattr(participation, 'seminar', None)
    event = getattr(participation, 'event', None)
    
    # Notification for the athlete (confirmation)
    # Prefer event when available
    if event:
        create_notification(
            recipient=athlete.user,
            notification_type='seminar_submitted',
            title='Participare la seminar trimisă cu succes',
            message=f'Cererea ta de participare la „{event.title}” a fost trimisă și așteaptă aprobare.',
            action_data={
                'event_id': event.pk,
                'event_name': event.title,
                'event_start_date': event.start_date.isoformat() if getattr(event, 'start_date', None) else None,
                'event_end_date': event.end_date.isoformat() if getattr(event, 'end_date', None) else None,
                'event_place': getattr(event, 'address', None) or (event.city.name if getattr(event, 'city', None) else None),
            }
        )
    else:
        create_notification(
            recipient=athlete.user,
            notification_type='seminar_submitted',
            title='Participare la seminar trimisă cu succes',
            message=f'Cererea ta de participare la „{seminar.name}” a fost trimisă și așteaptă aprobare.' if seminar else 'Cererea ta de participare a fost trimisă și așteaptă aprobare.',
            action_data={
                'seminar_name': seminar.name if seminar else None,
                'seminar_start_date': seminar.start_date.isoformat() if seminar and seminar.start_date else None,
                'seminar_end_date': seminar.end_date.isoformat() if seminar and seminar.end_date else None,
                'seminar_place': seminar.place if seminar else None,
            }
        )
    
    # Notification for admins and the athlete's club coaches
    for admin in _submission_recipients(athlete):
        create_notification(
            recipient=admin,
            notification_type='seminar_submitted',
            title='Participare la seminar nouă trimisă spre aprobare',
            message=(f'{athlete.first_name} {athlete.last_name} a trimis o cerere de participare la „{event.title}”.' if event else f'{athlete.first_name} {athlete.last_name} a trimis o cerere de participare la „{seminar.name}”.'),
            action_data=(
                {
                    'athlete_id': athlete.id,
                    'athlete_name': f'{athlete.first_name} {athlete.last_name}',
                    'participation_id': participation.id,
                    'event_id': event.pk,
                    'event_name': event.title,
                    'event_start_date': event.start_date.isoformat() if getattr(event, 'start_date', None) else None,
                    'event_end_date': event.end_date.isoformat() if getattr(event, 'end_date', None) else None,
                    'event_place': getattr(event, 'address', None) or (event.city.name if getattr(event, 'city', None) else None),
                } if event else {
                    'athlete_id': athlete.id,
                    'athlete_name': f'{athlete.first_name} {athlete.last_name}',
                    'participation_id': participation.id,
                    'seminar_name': seminar.name if seminar else None,
                    'seminar_start_date': seminar.start_date.isoformat() if seminar and seminar.start_date else None,
                    'seminar_end_date': seminar.end_date.isoformat() if seminar and seminar.end_date else None,
                    'seminar_place': seminar.place if seminar else None,
                }
            )
        )


def create_seminar_status_notification(participation, new_status, admin_user, admin_notes=''):
    """Create notification when seminar participation status changes"""
    athlete = participation.athlete
    seminar = getattr(participation, 'seminar', None)
    event = getattr(participation, 'event', None)
    # `event` is the current field (see TrainingSeminarParticipation's own
    # docstring - `seminar` is legacy/deprecated), so it's set for every
    # participation the frontend creates today; fall back to the legacy
    # field only for old records that still only have it.
    display_name = event.title if event else (seminar.name if seminar else 'seminar')

    # Map status to notification type and messages
    status_mapping = {
        'approved': {
            'type': 'seminar_approved',
            'title': 'Participare la seminar aprobată!',
            'message': f'Felicitări! Participarea ta la „{display_name}” a fost aprobată.',
        },
        'rejected': {
            'type': 'seminar_rejected',
            'title': 'Participare la seminar respinsă',
            'message': f'Cererea ta de participare la „{display_name}” a fost respinsă.',
        },
        'revision_required': {
            'type': 'seminar_revision_required',
            'title': 'Participare la seminar - sunt necesare completări',
            'message': f'Cererea ta de participare la „{display_name}” necesită completări.',
        }
    }

    status_info = status_mapping.get(new_status)
    if not status_info:
        return

    # Add admin notes to message if provided
    message = status_info['message']
    if admin_notes:
        message += f'\n\nNote administrator: {admin_notes}'
    
    # Create notification for the athlete
    # Prefer event when available
    if event:
        create_notification(
            recipient=athlete.user,
            notification_type=status_info['type'],
            title=status_info['title'],
            message=message,
            action_data={
                'event_id': event.pk,
                'event_name': event.title,
                'event_start_date': event.start_date.isoformat() if getattr(event, 'start_date', None) else None,
                'event_end_date': event.end_date.isoformat() if getattr(event, 'end_date', None) else None,
                'event_place': getattr(event, 'address', None) or (event.city.name if getattr(event, 'city', None) else None),
                'reviewed_by': str(admin_user) if admin_user else 'Admin',
                'admin_notes': admin_notes,
                'new_status': new_status
            }
        )
    else:
        create_notification(
            recipient=athlete.user,
            notification_type=status_info['type'],
            title=status_info['title'],
            message=message,
            action_data={
                'seminar_name': seminar.name if seminar else None,
                'seminar_start_date': seminar.start_date.isoformat() if seminar and seminar.start_date else None,
                'seminar_end_date': seminar.end_date.isoformat() if seminar and seminar.end_date else None,
                'seminar_place': seminar.place if seminar else None,
                'reviewed_by': str(admin_user) if admin_user else 'Admin',
                'admin_notes': admin_notes,
                'new_status': new_status
            }
        )

    # Let the club's coaches see the outcome too, even if an admin (not
    # them) reviewed it.
    seminar_label = event.title if event else (seminar.name if seminar else 'seminar')
    coach_predicate = {'approved': 'a fost aprobată', 'rejected': 'a fost respinsă', 'revision_required': 'necesită completări'}[new_status]
    coach_message = f'Participarea lui {athlete.first_name} {athlete.last_name} la „{seminar_label}” {coach_predicate}.'
    for coach_user in _status_change_coach_recipients([athlete], exclude_user=admin_user):
        create_notification(
            recipient=coach_user,
            notification_type=status_info['type'],
            title=status_info['title'],
            message=coach_message,
            action_data={
                'athlete_id': athlete.id,
                'athlete_name': f'{athlete.first_name} {athlete.last_name}',
                'event_id': event.pk if event else None,
                'event_name': event.title if event else None,
                'seminar_name': seminar.name if seminar else None,
                'reviewed_by': str(admin_user) if admin_user else 'Admin',
                'admin_notes': admin_notes,
                'new_status': new_status,
            },
        )


VISA_TYPE_LABELS = {'medical': 'medicală', 'annual': 'anuală'}


def create_visa_submitted_notification(visa):
    """Create notification when an athlete submits a visa (medical/annual)"""
    athlete = visa.athlete
    type_label = VISA_TYPE_LABELS.get(visa.visa_type, visa.visa_type)

    create_notification(
        recipient=athlete.user,
        notification_type='visa_submitted',
        title='Viză trimisă cu succes',
        message=f'Viza ta {type_label} a fost trimisă și așteaptă aprobare.',
        action_data={'visa_id': visa.pk, 'visa_type': visa.visa_type, 'issued_date': visa.issued_date.isoformat() if visa.issued_date else None},
    )

    for admin in _submission_recipients(athlete):
        create_notification(
            recipient=admin,
            notification_type='visa_submitted',
            title='Viză nouă trimisă spre aprobare',
            message=f'{athlete.first_name} {athlete.last_name} a trimis o viză {type_label} spre aprobare.',
            action_data={'athlete_id': athlete.id, 'athlete_name': f'{athlete.first_name} {athlete.last_name}', 'visa_id': visa.pk, 'visa_type': visa.visa_type},
        )


def create_visa_status_notification(visa, new_status, admin_user, admin_notes=''):
    """Create notification when a visa's approval status changes"""
    athlete = visa.athlete
    type_label = VISA_TYPE_LABELS.get(visa.visa_type, visa.visa_type)

    status_mapping = {
        'approved': {
            'type': 'visa_approved',
            'title': 'Viză aprobată!',
            'message': f'Viza ta {type_label} a fost aprobată.',
        },
        'rejected': {
            'type': 'visa_rejected',
            'title': 'Viză respinsă',
            'message': f'Viza ta {type_label} a fost respinsă.',
        },
        'revision_required': {
            'type': 'visa_revision_required',
            'title': 'Viză - sunt necesare completări',
            'message': f'Viza ta {type_label} necesită completări.',
        },
    }

    status_info = status_mapping.get(new_status)
    if not status_info:
        return

    message = status_info['message']
    if admin_notes:
        message += f'\n\nNote administrator: {admin_notes}'

    action_data = {
        'visa_id': visa.pk,
        'visa_type': visa.visa_type,
        'reviewed_by': str(admin_user) if admin_user else 'Admin',
        'admin_notes': admin_notes,
        'new_status': new_status,
    }

    create_notification(
        recipient=athlete.user,
        notification_type=status_info['type'],
        title=status_info['title'],
        message=message,
        action_data=action_data,
    )

    # Let the club's coaches see the outcome too, even if an admin (not
    # them) reviewed it.
    coach_predicate = {'approved': 'a fost aprobată', 'rejected': 'a fost respinsă', 'revision_required': 'necesită completări'}[new_status]
    coach_message = f'Viza {type_label} a lui {athlete.first_name} {athlete.last_name} {coach_predicate}.'
    for coach_user in _status_change_coach_recipients([athlete], exclude_user=admin_user):
        create_notification(
            recipient=coach_user,
            notification_type=status_info['type'],
            title=status_info['title'],
            message=coach_message,
            action_data={**action_data, 'athlete_id': athlete.id, 'athlete_name': f'{athlete.first_name} {athlete.last_name}'},
        )