"""Fiecare pagină de admin trebuie să se deschidă.

Admin-ul n-avea niciun test, iar formularele și inline-urile lui se leagă
între ele prin nume rezolvate abia la rulare: o clasă mutată dintr-un
modul în altul, un câmp scos dintr-un fieldset sau o proprietate care
crapă pe un obiect gol nu se văd nici la `manage.py check`, nici în
restul suitei. Testul ăsta deschide lista, formularul de adăugare și, când
există un rând, formularul de modificare pentru fiecare model înregistrat.
"""
from django.contrib import admin
from django.test import TestCase
from django.urls import reverse

from ..models import User


class AdminPagesLoadTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.superuser = User.objects.create_superuser(
            username='admin-pages', email='admin-pages@example.com', password='parola-de-test',
            first_name='Admin', last_name='Pagini',
        )

    def setUp(self):
        self.client.force_login(self.superuser)

    def test_every_registered_admin_page_loads(self):
        failures = []
        for model, model_admin in admin.site._registry.items():
            opts = model._meta
            pages = [('listă', reverse(f'admin:{opts.app_label}_{opts.model_name}_changelist'))]
            # Formularul de adăugare are sens doar unde adăugarea e permisă:
            # LogEntry si OutstandingToken raspund intentionat 403.
            request = self.client.request().wsgi_request
            request.user = self.superuser
            if model_admin.has_add_permission(request):
                pages.append(('adăugare', reverse(f'admin:{opts.app_label}_{opts.model_name}_add')))
            obj = model._default_manager.first()
            if obj is not None:
                pages.append(('modificare', reverse(f'admin:{opts.app_label}_{opts.model_name}_change', args=[obj.pk])))

            for what, url in pages:
                try:
                    response = self.client.get(url, follow=True)
                except Exception as exc:  # noqa: BLE001 - vrem să raportăm tot, nu să ne oprim la primul
                    failures.append(f'{opts.label} [{what}] {type(exc).__name__}: {exc}')
                else:
                    if response.status_code >= 400:
                        failures.append(f'{opts.label} [{what}] HTTP {response.status_code}')

        self.assertEqual(failures, [], 'Pagini de admin care nu se deschid:\n  ' + '\n  '.join(failures))


class AthleteSoftDeleteAdminTests(TestCase):
    """Ștergerea unui sportiv din admin trebuie să fie reversibilă.

    `Athlete` moștenește SoftDeleteMixin, dar admin-ul ștergea un singur
    obiect prin `obj.delete()` (logic) și o selecție prin
    `queryset.delete()` (definitiv) - același buton, două rezultate.
    """

    @classmethod
    def setUpTestData(cls):
        cls.superuser = User.objects.create_superuser(
            username='admin-stergere', email='admin-stergere@example.com', password='parola-de-test',
            first_name='Admin', last_name='Ștergere',
        )

    def _athlete(self, first_name):
        from ..models import Athlete
        return Athlete.objects.create(first_name=first_name, last_name='Test', status='approved')

    def test_bulk_delete_is_reversible_like_single_delete(self):
        from ..models import Athlete
        from django.contrib import admin as dj_admin

        one, two = self._athlete('Unu'), self._athlete('Doi')
        model_admin = dj_admin.site._registry[Athlete]

        request = self.client.request().wsgi_request
        request.user = self.superuser
        model_admin.delete_queryset(request, Athlete.objects.filter(pk__in=[one.pk, two.pk]))

        # randurile exista in continuare, doar marcate ca sterse
        self.assertEqual(Athlete.objects.filter(pk__in=[one.pk, two.pk]).count(), 0)
        still_there = Athlete.objects.with_deleted().filter(pk__in=[one.pk, two.pk])
        self.assertEqual(still_there.count(), 2)
        self.assertTrue(all(a.is_deleted and a.deleted_by_id == self.superuser.pk for a in still_there))

        for athlete in still_there:
            athlete.restore()
        self.assertEqual(Athlete.objects.filter(pk__in=[one.pk, two.pk]).count(), 2)
