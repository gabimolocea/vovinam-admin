"""Redimensionarea si recodarea imaginilor incarcate.

Nu toate imaginile din sistem sunt acelasi lucru, si tocmai de aici
vine singura decizie care conteaza aici.

O sigla de club sau o poza de profil se vad la 100-200 px pe ecran:
pastrate la 1100x1100, se platesc de trei ori - stocare, transfer si
timpul de incarcare pe telefonul cuiva - pentru pixeli pe care nu-i vede
nimeni. Pe astea le micsoram tare si le trecem in WebP.

Dar o legitimatie, un certificat medical sau unul de grad sunt
DOVEZI fotografiate. Cineva le va deschide ca sa citeasca un numar sau o
stampila, poate le va si tipari. Acolo micsorarea agresiva distruge
exact lucrul pentru care exista fisierul. Pe alea doar le plafonam, si
le lasam formatul.

Regula se alege dupa folderul de incarcare, fiindca el spune la ce
serveste imaginea - singura informatie de care avem nevoie.
"""

import io
import logging
import os

logger = logging.getLogger(__name__)

# (prefix, latura maxima, format tinta sau None ca sa-l pastram, calitate)
RULES = [
    # Imagini de afisare: se vad mici, deci pot fi mici.
    ('club_logos/',           512,  'WEBP', 82),
    ('profile_images/',       640,  'WEBP', 82),
    ('events/',              1280,  'WEBP', 82),
    ('news/',                1280,  'WEBP', 82),
    ('about/',               1280,  'WEBP', 82),
    ('grades/',               512,  'WEBP', 82),
    ('match_images/',        1280,  'WEBP', 82),

    # Dovezi fotografiate: raman lizibile si isi pastreaza formatul.
    # Plafonul taie tot ce e peste ce poate citi un ochi pe ecran, dar
    # 2000 px pe latura lunga inca lasa o stampila descifrabila.
    ('license_images/',      2000,  None,   88),
    ('medical_certificates/', 2000,  None,   88),
    ('grade_certificates/',  2000,  None,   88),
    ('visa_images/',         2000,  None,   88),
    ('seminar_certificates/', 2000,  None,   88),
    ('result_certificates/', 2000,  None,   88),
]

# Ce stim sa deschidem. PDF-urile (sabloane de diplome, documente
# oficiale) si filmele trec neatinse - nu sunt imagini si nu avem ce
# optimiza aici fara sa stricam.
IMAGE_SUFFIXES = {'.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.bmp', '.tif', '.tiff'}


def rule_for(name):
    """Regula pentru calea asta, sau None daca fisierul nu ne priveste."""
    if os.path.splitext(name)[1].lower() not in IMAGE_SUFFIXES:
        return None
    for prefix, max_side, target, quality in RULES:
        if name.startswith(prefix) or f'/{prefix}' in name:
            return (max_side, target, quality)
    # Un folder pe care nu-l cunoastem: nu ghicim la ce serveste
    # imaginea, deci n-o atingem.
    return None


def already_optimal(name, content):
    """A mai trecut o data pe aici?

    Conteaza la migrarea fisierelor vechi: WebP recodat la fiecare
    rulare pierde calitate de fiecare data, pe degeaba. Daca formatul e
    deja cel tinta si dimensiunea e sub plafon, nu mai e nimic de facut.
    """
    rule = rule_for(name)
    if rule is None:
        return True

    max_side, target, _quality = rule
    try:
        from PIL import Image
        content.seek(0)
        with Image.open(content) as image:
            fmt = (image.format or '').upper()
            fits = max(image.size) <= max_side
    except Exception:
        return False
    finally:
        try:
            content.seek(0)
        except Exception:
            pass

    if target and fmt != target:
        return False
    return fits


def optimize(name, content):
    """Intoarce (nume_nou, continut_nou) sau (name, content) neschimbate.

    Orice esec lasa fisierul original: o imagine neoptimizata e doar
    mare, una pierduta e pierduta.
    """
    rule = rule_for(name)
    if rule is None:
        return name, content

    max_side, target, quality = rule
    try:
        from PIL import Image
        try:
            # Pozele de pe iPhone vin HEIC; fara asta Pillow nu le deschide.
            import pillow_heif
            pillow_heif.register_heif_opener()
        except ImportError:
            pass

        content.seek(0)
        image = Image.open(content)
        image.load()
    except Exception as exc:
        logger.warning('Nu am putut deschide %s pentru optimizare: %s', name, exc)
        content.seek(0)
        return name, content

    try:
        # Rotim dupa EXIF inainte de orice: altfel o poza facuta cu
        # telefonul pe verticala se salveaza culcata, fiindca orientarea
        # traia doar in metadatele pe care tocmai le aruncam.
        from PIL import ImageOps
        image = ImageOps.exif_transpose(image) or image

        width, height = image.size
        longest = max(width, height)
        if longest > max_side:
            scale = max_side / longest
            image = image.resize((max(1, round(width * scale)), max(1, round(height * scale))),
                                 Image.LANCZOS)

        out_format = target or (image.format or 'JPEG').upper()
        if out_format == 'JPG':
            out_format = 'JPEG'

        # JPEG nu stie transparenta; pe fundal alb, nu negru.
        if out_format == 'JPEG' and image.mode in ('RGBA', 'LA', 'P'):
            from PIL import Image as PILImage
            background = PILImage.new('RGB', image.size, (255, 255, 255))
            rgba = image.convert('RGBA')
            background.paste(rgba, mask=rgba.split()[-1])
            image = background
        elif out_format != 'JPEG' and image.mode == 'P':
            image = image.convert('RGBA')

        buffer = io.BytesIO()
        save_args = {'quality': quality}
        if out_format == 'WEBP':
            save_args['method'] = 6
        elif out_format == 'JPEG':
            save_args['optimize'] = True
            save_args['progressive'] = True
        image.save(buffer, out_format, **save_args)
    except Exception as exc:
        logger.warning('Optimizarea a esuat pentru %s: %s', name, exc)
        content.seek(0)
        return name, content

    original_size = getattr(content, 'size', None)
    new_size = buffer.tell()
    # Daca n-am castigat nimic, nu schimbam nimic: unele PNG-uri mici
    # ies mai mari in WebP, si n-are rost sa pierdem originalul pentru
    # asta.
    if original_size and new_size >= original_size and target is None:
        content.seek(0)
        return name, content

    buffer.seek(0)
    from django.core.files.base import ContentFile
    new_name = name
    if target:
        new_name = f'{os.path.splitext(name)[0]}.{target.lower()}'
    return new_name, ContentFile(buffer.read(), name=os.path.basename(new_name))
