"""Post-approval media processing - shrinks approved certificate/diploma
images so storage cost doesn't grow unbounded with every submission, while
still keeping a copy for audit purposes.
"""
import logging
import os
from io import BytesIO

from django.core.files.base import ContentFile

logger = logging.getLogger(__name__)

MAX_DIMENSION = 1600  # px, longest side
JPEG_QUALITY = 70


def compress_image_field(field):
    """Re-encode an ImageField's file in place as a resized, compressed JPEG.

    Storage-backend agnostic (works the same on local FileSystemStorage and
    on S3Boto3Storage/Spaces) since it goes through the field's storage API
    rather than touching the filesystem directly. Best-effort: swallows and
    logs any failure (corrupt image, unreachable storage) rather than
    breaking the approval flow that triggered it.
    """
    if not field:
        return

    from PIL import Image

    old_name = field.name
    try:
        field.open('rb')
        image = Image.open(field)
        image.load()
    except Exception:
        logger.exception('Could not open %s for compression, leaving as-is', old_name)
        return
    finally:
        field.close()

    if image.mode not in ('RGB', 'L'):
        image = image.convert('RGB')
    image.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)

    buffer = BytesIO()
    image.save(buffer, format='JPEG', quality=JPEG_QUALITY, optimize=True)
    buffer.seek(0)

    new_name = f'{os.path.splitext(old_name)[0]}.jpg'
    storage = field.storage

    field.save(new_name, ContentFile(buffer.read()), save=False)
    field.instance.save(update_fields=[field.field.name])

    if new_name != old_name:
        try:
            storage.delete(old_name)
        except Exception:
            logger.exception('Compressed %s but could not delete original', old_name)
