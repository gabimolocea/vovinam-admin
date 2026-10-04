import io

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image
from rest_framework.test import APIClient

from api.models import Athlete, User


def o_poza():
    buffer = io.BytesIO()
    Image.new('RGB', (40, 50), '#888').save(buffer, format='PNG')
    return SimpleUploadedFile('p.png', buffer.getvalue(), content_type='image/png')


class AthleteDetailPrivateFieldsTests(TestCase):
    """Ce vede un sportiv oarecare despre alt sportiv.

    Endpointul `/athletes/<id>/public/` cere autentificare, dar atat: orice
    utilizator cu cont il poate cere pentru oricine. Separarea dintre ce e
    public si ce nu se face pe campuri, in PublicAthleteDetailSerializer,
    prin `_can_review` - sportivul insusi, antrenorul clubului lui, sau un
    admin.

    Testul asta exista fiindca greseala e tacuta: cine adauga un camp in
    `Meta.fields` fara o metoda cu garda nu primeste nicio eroare, nicaieri.
    Asa au ajuns sa fie vizibile data completa a nasterii, notele interne de
    moderare si poza netrecuta inca prin aprobare.
    """

    # Ce nu are voie sa iasa catre cineva fara drept de reviewer. Cand se
    # adauga un camp privat nou in serializer, se adauga si aici.
    PRIVATE = [
        'cnp', 'license_series', 'license_number', 'license_image',
        'mobile_number', 'address', 'emergency_contact_name',
        'emergency_contact_phone', 'email', 'previous_experience',
        'nationality', 'registered_date', 'expiration_date', 'status',
        'date_of_birth', 'profile_image_status', 'profile_image_admin_notes',
        'pending_profile_image',
    ]

    def setUp(self):
        self.client = APIClient()

        # Doi oameni fara nicio legatura: cluburi diferite (adica niciunul),
        # niciunul antrenorul celuilalt, niciunul admin.
        self.user_strain = User.objects.create_user(
            username='strain', email='strain@example.com', password='parola-de-test-1',
        )
        self.strain = Athlete.objects.create(
            user=self.user_strain, first_name='Cineva', last_name='Oarecare', status='approved',
        )

        self.user_tinta = User.objects.create_user(
            username='tinta', email='tinta@example.com', password='parola-de-test-2',
        )
        self.tinta = Athlete.objects.create(
            user=self.user_tinta,
            first_name='Sportiv', last_name='Urmarit', status='approved',
            cnp='1900101123456',
            license_series='AB', license_number='1234',
            mobile_number='0712345678',
            address='Strada Cuiva 1',
            emergency_contact_name='Ruda Lui', emergency_contact_phone='0799999999',
            date_of_birth='1990-01-01',
            previous_experience='zece ani',
            profile_image_admin_notes='poza respinsa: neclara',
        )

    def _vazut_de(self, user):
        client = APIClient()
        if user is not None:
            client.force_authenticate(user=user)
        return client.get(f'/api/athletes/{self.tinta.id}/public/')

    def test_un_sportiv_strain_nu_vede_niciun_camp_privat(self):
        raspuns = self._vazut_de(self.user_strain)
        self.assertEqual(raspuns.status_code, 200)

        scurse = {
            camp: raspuns.data.get(camp)
            for camp in self.PRIVATE
            if raspuns.data.get(camp) not in (None, '', [])
        }
        self.assertEqual(scurse, {}, f'campuri private vizibile unui strain: {scurse}')

    def test_poza_in_asteptare_nu_se_vede_din_afara(self):
        # Separat, fiindca cere o poza incarcata ca sa existe ce scurge.
        self.tinta.submit_profile_image(o_poza())

        raspuns = self._vazut_de(self.user_strain)
        self.assertIsNone(raspuns.data.get('pending_profile_image'))
        self.assertIsNone(raspuns.data.get('profile_image_status'))

    def test_omul_isi_vede_propriile_date(self):
        # Garda nu trebuie sa fie atat de stransa incat sa ascunda omului
        # propriile date - altfel pagina lui de profil ramane goala.
        raspuns = self._vazut_de(self.user_tinta)
        self.assertEqual(raspuns.status_code, 200)
        self.assertEqual(raspuns.data.get('cnp'), '1900101123456')
        self.assertEqual(str(raspuns.data.get('date_of_birth')), '1990-01-01')
        self.assertEqual(raspuns.data.get('address'), 'Strada Cuiva 1')

    def test_adminul_vede_tot(self):
        admin = User.objects.create_superuser(
            username='adminul', email='admin@example.com', password='parola-de-test-3',
        )
        raspuns = self._vazut_de(admin)
        self.assertEqual(raspuns.data.get('cnp'), '1900101123456')
        self.assertEqual(raspuns.data.get('profile_image_admin_notes'), 'poza respinsa: neclara')

    def test_anonim_nu_primeste_nimic(self):
        raspuns = self._vazut_de(None)
        self.assertIn(raspuns.status_code, (401, 403))
