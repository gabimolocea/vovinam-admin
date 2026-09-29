import io

from django.core.files.base import ContentFile
from django.test import SimpleTestCase
from PIL import Image

from api.image_optimization import optimize, rule_for


def make_image(width, height, mode='RGB', fmt='PNG', color=(200, 30, 30)):
    image = Image.new(mode, (width, height), color if mode != 'RGBA' else (*color, 255))
    buffer = io.BytesIO()
    image.save(buffer, fmt)
    buffer.seek(0)
    return ContentFile(buffer.read(), name=f'x.{fmt.lower()}')


def reopen(content):
    content.seek(0)
    return Image.open(io.BytesIO(content.read()))


class DisplayImageTests(SimpleTestCase):
    """Siglele și pozele de profil se văd la 100-200 px pe ecran.
    Păstrate la dimensiunea de la aparat, se plătesc de trei ori -
    stocare, transfer și timpul de încărcare pe telefonul cuiva - pentru
    pixeli pe care nu-i vede nimeni."""

    def test_a_club_logo_is_shrunk_and_converted(self):
        original = make_image(1100, 1100)
        name, content = optimize('club_logos/5.png', original)

        self.assertTrue(name.endswith('.webp'), name)
        self.assertEqual(max(reopen(content).size), 512)
        self.assertLess(len(content.read()), len(original.read()))

    def test_the_aspect_ratio_survives(self):
        _name, content = optimize('club_logos/wide.png', make_image(1600, 400))
        self.assertEqual(reopen(content).size, (512, 128))

    def test_an_image_already_small_enough_is_not_enlarged(self):
        _name, content = optimize('club_logos/tiny.png', make_image(120, 120))
        self.assertEqual(reopen(content).size, (120, 120))


class EvidenceImageTests(SimpleTestCase):
    """Legitimațiile și certificatele sunt dovezi fotografiate: cineva
    le va deschide ca să citească un număr sau o ștampilă. Micșorarea
    agresivă ar distruge exact lucrul pentru care există fișierul."""

    def test_an_evidence_photo_keeps_its_format(self):
        name, _content = optimize('license_images/card.png', make_image(1200, 900))
        self.assertTrue(name.endswith('.png'), f'{name} ar fi trebuit să rămână PNG')

    def test_an_oversized_evidence_photo_is_capped_but_stays_readable(self):
        """O poză de 4000 px de pe telefon se plafonează la 2000 - încă
        destul cât să se descifreze o ștampilă, dar de patru ori mai
        puțini pixeli."""
        _name, content = optimize('medical_certificates/scan.jpeg',
                                  make_image(4000, 3000, fmt='JPEG'))
        self.assertEqual(max(reopen(content).size), 2000)

    def test_a_jpeg_lands_exactly_on_the_cap_despite_the_fast_decode(self):
        """Decodarea JPEG cere acum decodorului o versiune deja micșorată,
        la jumătate sau la sfert, ca să nu desfacă toată poza în memorie -
        serverul are un singur vCPU și o jumătate de gigabyte. Treptele
        alea sunt grosiere, deci verificăm că dimensiunea finală cade tot
        pe plafon, nu pe cea mai apropiată treaptă."""
        _name, content = optimize('medical_certificates/odd.jpeg',
                                  make_image(3333, 2111, fmt='JPEG'))
        image = reopen(content)
        self.assertEqual(max(image.size), 2000)
        self.assertEqual(image.size[1], round(2000 * 2111 / 3333))

    def test_evidence_is_never_shrunk_as_hard_as_a_logo(self):
        _name, evidence = optimize('grade_certificates/c.jpeg', make_image(1800, 1800, fmt='JPEG'))
        _name2, logo = optimize('club_logos/c.jpeg', make_image(1800, 1800, fmt='JPEG'))
        self.assertGreater(max(reopen(evidence).size), max(reopen(logo).size))


class UntouchedFileTests(SimpleTestCase):
    """Ce nu știm sigur la ce servește, nu atingem."""

    def test_a_pdf_passes_through(self):
        self.assertIsNone(rule_for('diploma_templates/sablon.pdf'))

    def test_a_video_passes_through(self):
        self.assertIsNone(rule_for('match_videos/meci.mp4'))

    def test_an_unknown_folder_is_left_alone(self):
        """Un folder nou apărut nu primește un tratament ghicit."""
        self.assertIsNone(rule_for('ceva_nou/imagine.png'))

    def test_a_corrupt_file_is_saved_as_it_came(self):
        """O imagine neoptimizată e doar mare; una pierdută e pierdută."""
        broken = ContentFile(b'nu sunt o imagine', name='x.png')
        name, content = optimize('club_logos/broken.png', broken)
        self.assertEqual(name, 'club_logos/broken.png')
        self.assertEqual(content.read(), b'nu sunt o imagine')


class ColourHandlingTests(SimpleTestCase):
    def test_transparency_lands_on_white_not_black(self):
        """Fundalul implicit al unei imagini noi e negru, iar o siglă
        transparentă turnată peste el devine ilizibilă."""
        transparent = Image.new('RGBA', (900, 900), (0, 0, 0, 0))
        buffer = io.BytesIO()
        transparent.save(buffer, 'PNG')
        buffer.seek(0)

        # Forțăm ieșirea JPEG, singura care nu știe transparență.
        from api import image_optimization as mod
        original_rules = mod.RULES
        mod.RULES = [('club_logos/', 512, 'JPEG', 85)]
        try:
            _name, content = optimize('club_logos/t.png', ContentFile(buffer.read(), name='t.png'))
        finally:
            mod.RULES = original_rules

        self.assertEqual(reopen(content).convert('RGB').getpixel((10, 10)), (255, 255, 255))
