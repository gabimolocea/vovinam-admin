"""Vocabularul de comenzi si potrivirea lor.

Nu dictare libera: fiecare rostire se potriveste cu una din comenzile
cunoscute, sau cu niciuna. Distinctia asta e chiar masuratoarea - o
comanda inteleasa gresit schimba scorul unui meci, una respinsa doar
enerveaza. A doua e acceptabila, prima nu.
"""

import re
import unicodedata

# (id, ce anunta testul, variantele acceptate)
#
# Variantele acopera felul in care se vorbeste de fapt, nu forma din
# manual: "un punct rosu" si "punct rosu" sunt aceeasi intentie.
COMMANDS = [
    ('point_red_1',    'un punct roșu',            ['un punct rosu', 'punct rosu', 'unu rosu']),
    ('point_red_2',    'două puncte roșu',         ['doua puncte rosu', 'doi rosu', 'douarosu']),
    ('point_blue_1',   'un punct albastru',        ['un punct albastru', 'punct albastru', 'unu albastru']),
    ('point_blue_2',   'două puncte albastru',     ['doua puncte albastru', 'doi albastru']),
    ('minus_red_1',    'minus un punct roșu',      ['minus un punct rosu', 'minus unu rosu', 'scade un punct rosu']),
    ('minus_red_2',    'minus două puncte roșu',   ['minus doua puncte rosu', 'minus doi rosu']),
    ('minus_blue_1',   'minus un punct albastru',  ['minus un punct albastru', 'minus unu albastru']),
    ('minus_blue_2',   'minus două puncte albastru', ['minus doua puncte albastru', 'minus doi albastru']),
    ('penalty_red',    'abatere roșu',             ['abatere rosu', 'o abatere rosu']),
    ('penalty_blue',   'abatere albastru',         ['abatere albastru', 'o abatere albastru']),
    ('warning_red',    'avertisment roșu',         ['avertisment rosu', 'un avertisment rosu']),
    ('warning_blue',   'avertisment albastru',     ['avertisment albastru', 'un avertisment albastru']),
    # Rostite singure, "pauza" si "reia" ies prost: doua silabe fara
    # context, iar modelul inventeaza vecini fonetici ("Pănguza",
    # "Bărădian"). Anuntam forma lunga, dar acceptam si scurtatura daca
    # totusi o nimereste.
    ('pause',          'oprește timpul',           ['opreste timpul', 'pune pauza', 'pauza', 'stop timpul']),
    ('resume',         'reia repriza',             ['reia repriza', 'reia', 'porneste timpul', 'opreste pauza']),
    ('round_start',    'începe repriza',           ['incepe repriza', 'start repriza']),
    ('round_end',      'oprește repriza',          ['opreste repriza', 'termina repriza', 'stop repriza']),
    ('undo',           'anulează',                 ['anuleaza', 'sterge ultima', 'greseala']),
]


def normalize(text):
    """Fara diacritice, fara semne, spatii simple. Whisper le pune
    inconsecvent, iar 'roşu' si 'rosu' sunt acelasi cuvant."""
    text = unicodedata.normalize('NFD', (text or '').lower())
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    text = re.sub(r'[^a-z0-9 ]+', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    # Modelul reda constant "minus" ca "minuz". Normalizam tokenul, nu
    # fraza: o regula per rostire n-ar acoperi urmatoarea variatie.
    text = re.sub(r'\bmin[uo][sz]\b', 'minus', text)
    return text


def match(transcript):
    """Intoarce id-ul comenzii, sau None daca nimic nu se potriveste.

    Potrivirea e pe cuvinte continute, nu pe egalitate: Whisper adauga
    des un articol sau o virgula, iar "asa, un punct rosu" e tot o
    comanda limpede. Dar daca in aceeasi rostire apar doua comenzi
    diferite, refuzam - inseamna ca n-am inteles.
    """
    said = normalize(transcript)
    if not said:
        return None

    # Contradictii: daca in aceeasi rostire apar ambele culori, sau si
    # "un punct" si "doua puncte", nu avem cum sti care a fost intentia.
    # Fara garda asta, "un punct rosu si albastru" trecea drept rosu -
    # adica exact greseala care strica un meci.
    if 'rosu' in said and 'albastru' in said:
        return None
    if re.search(r'\bun punct\b', said) and re.search(r'\bdoua puncte\b', said):
        return None

    # Cea mai lunga varianta care se potriveste castiga, fiind cea mai
    # specifica: "minus doi rosu" contine "doi rosu", dar inseamna altceva.
    # Daca doua comenzi diferite se potrivesc la fel de specific, refuzam.
    best = []
    for cmd_id, _label, variants in COMMANDS:
        for variant in variants:
            norm = normalize(variant)
            if norm and norm in said:
                best.append((len(norm), cmd_id))

    if not best:
        return None
    best.sort(reverse=True)
    top_len = best[0][0]
    winners = {cmd_id for length, cmd_id in best if length == top_len}
    if len(winners) != 1:
        return None
    winner = winners.pop()

    # Garda pe scadere. Whisper a auzit "minuz un punct rosu" si a
    # potrivit-o cu "un punct rosu" - adica a ADAUGAT un punct in loc
    # sa-l scada. Exact inversul intentiei, si tocmai la o comanda de
    # corectie. Nu o reparam scriind "minuz" printre variante: data
    # viitoare va auzi altceva. Daca in rostire apare o urma de
    # scadere, comanda TREBUIE sa fie una de scadere.
    said_minus = bool(re.search(r'\bmin[uo][sz]?\b|\bscade\b|\bscoate\b', said))
    if said_minus != winner.startswith('minus_'):
        return None

    return winner
