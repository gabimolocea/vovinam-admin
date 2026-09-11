"""
Minimal Django EMAIL_BACKEND that sends via Amazon SES using boto3 - already
a dependency here for DigitalOcean Spaces storage, so this avoids pulling in
a separate email-sending library for a handful of transactional emails.
"""
import boto3
from botocore.exceptions import ClientError
from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend


class SESEmailBackend(BaseEmailBackend):
    def __init__(self, fail_silently=False, **kwargs):
        super().__init__(fail_silently=fail_silently, **kwargs)
        self._client = None

    def _get_client(self):
        if self._client is None:
            self._client = boto3.client(
                'ses',
                aws_access_key_id=settings.AWS_SES_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SES_SECRET_ACCESS_KEY,
                region_name=settings.AWS_SES_REGION_NAME,
            )
        return self._client

    def send_messages(self, email_messages):
        if not email_messages:
            return 0
        client = self._get_client()
        sent_count = 0
        for message in email_messages:
            try:
                client.send_raw_email(
                    Source=message.from_email,
                    Destinations=message.recipients(),
                    RawMessage={'Data': message.message().as_bytes()},
                )
                sent_count += 1
            except ClientError:
                if not self.fail_silently:
                    raise
        return sent_count
