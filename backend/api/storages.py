"""Stocare care optimizeaza imaginile la incarcare.

Se face aici, nu in modele, din doua motive. Intai, prinde tot: fiecare
ImageField din proiect trece prin stocare, inclusiv cele adaugate maine
si cele incarcate din panoul de administrare. Si al doilea, nu cere
nicio migrare - campurile raman exact ce sunt.

Redenumirea (png -> webp) se face inainte de `super().save()`, ca sa
ramana in sarcina Django verificarea ca numele e liber.
"""

from django.core.files.storage import FileSystemStorage

from .image_optimization import optimize


class OptimizedImageMixin:
    def save(self, name, content, max_length=None):
        if name:
            try:
                name, content = optimize(name, content)
            except Exception:
                # Optimizarea e un bonus, nu o conditie. Un fisier care
                # nu se poate micsora trebuie totusi sa se salveze.
                pass
        return super().save(name, content, max_length=max_length)


class OptimizedFileSystemStorage(OptimizedImageMixin, FileSystemStorage):
    pass


try:
    from storages.backends.s3boto3 import S3Boto3Storage

    class OptimizedS3Storage(OptimizedImageMixin, S3Boto3Storage):
        pass
except ImportError:  # django-storages lipseste (instalare minima)
    OptimizedS3Storage = None
