import json
import sys

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = (
        'Create or update a local admin account so it authenticates with the '
        'same email/password as the cloud account driving a local sync. '
        'Reads {"email", "password", "first_name"?, "last_name"?} as JSON from '
        'stdin - the password never touches argv, so it does not show up in '
        '`ps`.'
    )

    def handle(self, *args, **options):
        try:
            payload = json.load(sys.stdin)
        except json.JSONDecodeError as exc:
            raise CommandError(f'stdin is not valid JSON: {exc}') from exc

        email = (payload.get('email') or '').strip().lower()
        password = payload.get('password') or ''
        if not email or not password:
            raise CommandError('Both "email" and "password" are required.')

        User = get_user_model()
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                'username': email,
                'first_name': payload.get('first_name') or 'Admin',
                'last_name': payload.get('last_name') or 'Local',
                'role': 'admin',
                'is_staff': True,
                'is_superuser': True,
            },
        )
        if not created:
            user.is_staff = True
            user.is_superuser = True
            user.role = 'admin'

        user.set_password(password)
        user.save()

        self.stdout.write(self.style.SUCCESS('created' if created else 'updated'))
