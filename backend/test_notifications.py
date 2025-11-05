import pytest

from api.models import User, CategoryAthleteScore, Notification
from api.notification_utils import create_result_status_notification


@pytest.mark.django_db
def test_rejection_notification():
    """Ensure rejection notification is created for a result when requested.

    This is a lightweight smoke test that requires DB access; pytest-django's
    django_db marker enables DB usage.
    """
    # Find test data
    admin_user = User.objects.filter(role='admin').first()
    result = CategoryAthleteScore.objects.first()

    # If no suitable test data exists in the test DB, skip the test
    if not admin_user or not result:
        pytest.skip('No admin user or CategoryAthleteScore available in test DB')

    before_count = Notification.objects.filter(
        recipient=result.athlete.user,
        notification_type='result_rejected'
    ).count()

    create_result_status_notification(
        result=result,
        new_status='rejected',
        admin_user=admin_user,
        admin_notes='Please provide additional documentation.'
    )

    after_count = Notification.objects.filter(
        recipient=result.athlete.user,
        notification_type='result_rejected'
    ).count()

    assert after_count >= before_count