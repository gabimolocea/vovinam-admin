import os
import unittest

from django.test import SimpleTestCase


class ProductionMediaStorageTests(SimpleTestCase):
    """Tot ce se încarcă trebuie să ajungă în același loc.

    Editorul de text scria pe discul containerului, în timp ce adresa
    imaginii se compunea din MEDIA_URL - adică Spaces. Poza ajungea
    undeva unde adresa ei nu arăta, iar în articol rămânea o imagine
    stricată. Și chiar dacă adresa ar fi fost locală, discul de pe App
    Platform se șterge la fiecare deploy.

    Testul păzește invariantul, nu o valoare anume: orice ar folosi
    aplicația pentru fișiere, editorul folosește același lucru.
    """

    def _production_settings(self, use_spaces):
        import importlib

        previous = {k: os.environ.get(k) for k in (
            'USE_SPACES', 'SPACES_BUCKET_NAME', 'SPACES_REGION', 'SECRET_KEY',
        )}
        os.environ.update({
            'USE_SPACES': 'True' if use_spaces else 'False',
            'SPACES_BUCKET_NAME': 'test-bucket',
            'SPACES_REGION': 'fra1',
            'SECRET_KEY': os.environ.get('SECRET_KEY') or 'test-only',
        })
        try:
            module = importlib.import_module('crud.settings_production')
            return importlib.reload(module)
        finally:
            for key, value in previous.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    def test_the_editor_uploads_where_everything_else_does(self):
        try:
            settings_module = self._production_settings(use_spaces=True)
        except Exception as exc:  # pragma: no cover - mediu fără django-storages
            raise unittest.SkipTest(f'nu pot încărca setările de producție: {exc}')

        self.assertEqual(
            settings_module.CKEDITOR_5_FILE_STORAGE,
            settings_module.STORAGES['default']['BACKEND'],
            'editorul de text trebuie să folosească aceeași stocare ca restul aplicației',
        )

    def test_the_editor_does_not_write_to_the_container_disk_on_spaces(self):
        """Discul e efemer: ce se scrie acolo dispare la deploy."""
        try:
            settings_module = self._production_settings(use_spaces=True)
        except Exception as exc:  # pragma: no cover
            raise unittest.SkipTest(f'nu pot încărca setările de producție: {exc}')

        self.assertNotIn('FileSystemStorage', settings_module.CKEDITOR_5_FILE_STORAGE)
