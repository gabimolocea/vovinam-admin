import io

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image

from api.models import Athlete, User


def o_poza(nume='poza.png'):
    """O imagine adevarata, nu bytes oarecare: campul e ImageField, si
    Pillow trebuie sa o poata deschide ca sa treaca validarea."""
    buffer = io.BytesIO()
    Image.new('RGB', (60, 80), '#2f6fb0').save(buffer, format='PNG')
    return SimpleUploadedFile(nume, buffer.getvalue(), content_type='image/png')


class ProfileImageFocusTests(TestCase):
    """Punctul de focus al pozei de profil - unde se uita ochiul, in
    procente - trebuie sa calatoreasca impreuna cu fotografia prin tot
    fluxul de aprobare.

    Daca ramane in urma, noua poza se afiseaza incadrata dupa un punct ales
    pentru cea veche, iar simptomul e tocmai cel pe care punctul a venit
    sa-l repare: fata taiata. Si ar fi un esec tacut - nicio eroare,
    nicaieri.
    """

    def setUp(self):
        self.athlete = Athlete.objects.create(first_name='Test', last_name='Sportiv', status='approved')
        self.reviewer = User.objects.create_superuser(
            username='reviewer', email='reviewer@example.com', password='testpass123',
        )

    def test_sus_centru_e_implicit(self):
        # Nu centrul: o poza pe care n-a atins-o nimeni trebuie sa arate
        # mai bine imediat, nu dupa ce cineva o deschide si apasa pe fata.
        self.assertEqual(self.athlete.profile_image_focus_x, 50)
        self.assertEqual(self.athlete.profile_image_focus_y, 25)

    def test_focusul_asteapta_langa_poza_in_asteptare(self):
        self.athlete.submit_profile_image(o_poza(), focus=(40, 20))
        self.athlete.refresh_from_db()

        self.assertEqual(self.athlete.profile_image_status, 'pending')
        self.assertEqual(self.athlete.pending_profile_image_focus_x, 40)
        self.assertEqual(self.athlete.pending_profile_image_focus_y, 20)
        # Poza publica e inca cea veche, deci si incadrarea ei.
        self.assertEqual(self.athlete.profile_image_focus_x, 50)
        self.assertEqual(self.athlete.profile_image_focus_y, 25)

    def test_focusul_trece_la_poza_publica_odata_cu_aprobarea(self):
        self.athlete.submit_profile_image(o_poza(), focus=(40, 20))
        self.athlete.approve_profile_image(self.reviewer)
        self.athlete.refresh_from_db()

        self.assertEqual(self.athlete.profile_image_focus_x, 40)
        self.assertEqual(self.athlete.profile_image_focus_y, 20)
        # Si nu ramane o copie in urma, care sa se aplice gresit data viitoare.
        self.assertEqual(self.athlete.pending_profile_image_focus_x, 50)
        self.assertEqual(self.athlete.pending_profile_image_focus_y, 25)

    def test_respingerea_nu_atinge_incadrarea_publica(self):
        self.athlete.profile_image_focus_x = 30
        self.athlete.profile_image_focus_y = 15
        self.athlete.save()

        self.athlete.submit_profile_image(o_poza(), focus=(80, 90))
        self.athlete.reject_profile_image(self.reviewer, 'prea intunecata')
        self.athlete.refresh_from_db()

        # Poza veche ramane, deci ramane si punctul ei.
        self.assertEqual(self.athlete.profile_image_focus_x, 30)
        self.assertEqual(self.athlete.profile_image_focus_y, 15)
        self.assertEqual(self.athlete.pending_profile_image_focus_x, 50)
        self.assertEqual(self.athlete.pending_profile_image_focus_y, 25)

    def test_fara_focus_ramane_implicitul(self):
        # O poza incarcata de undeva unde nu exista inca alegerea punctului
        # nu trebuie sa pice, ci sa primeasca incadrarea implicita.
        self.athlete.submit_profile_image(o_poza())
        self.athlete.approve_profile_image(self.reviewer)
        self.athlete.refresh_from_db()

        self.assertEqual(self.athlete.profile_image_focus_x, 50)
        self.assertEqual(self.athlete.profile_image_focus_y, 25)
