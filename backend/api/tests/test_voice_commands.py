from django.test import SimpleTestCase

from api.voice_commands import COMMANDS, interpret, match


class VoiceCommandMatchingTests(SimpleTestCase):
    """Potrivirea comenzilor vocale.

    Trei rezultate, nu două: înțeles, neînțeles, și înțeles greșit.
    Al treilea e singurul inacceptabil - schimbă scorul unui meci fără
    ca nimeni să fi cerut asta - și aproape tot ce se testează aici
    există ca să-l facă imposibil.
    """

    def test_every_command_recognises_its_own_wording(self):
        for cmd_id, label, _variants in COMMANDS:
            self.assertEqual(match(label), cmd_id, f'{label!r} nu se potrivește cu sine')

    def test_filler_words_around_a_command_are_tolerated(self):
        """Whisper adaugă des un articol sau un oftat; comanda rămâne clară."""
        self.assertEqual(match('asa, un punct rosu.'), 'point_red_1')
        self.assertEqual(match('deci doua puncte albastru'), 'point_blue_2')

    def test_both_corners_in_one_utterance_is_refused(self):
        """Nu există intenție clară, deci nu se ghicește."""
        self.assertIsNone(match('un punct rosu si albastru'))

    def test_conflicting_amounts_are_refused(self):
        self.assertIsNone(match('un punct sau doua puncte rosu'))

    def test_a_longer_wording_wins_over_the_one_it_contains(self):
        """'minus doi rosu' conține 'doi rosu', dar înseamnă opusul."""
        self.assertEqual(match('minus doi rosu'), 'minus_red_2')

    def test_a_mangled_minus_never_becomes_an_addition(self):
        """Cazul care a apărut la prima măsurătoare: modelul aude
        constant 'minuz'. Fără apărare, 'minus un punct roșu' se potrivea
        cu 'un punct roșu' - adăuga în loc să scadă, tocmai la comanda
        de corecție."""
        self.assertEqual(match('minuz un punct rosu'), 'minus_red_1')
        self.assertEqual(match('minos doua puncte albastru'), 'minus_blue_2')

    def test_a_subtraction_word_forces_a_subtraction_command(self):
        """Garda structurală: dacă apare orice urmă de scădere și comanda
        găsită nu e una de scădere, se refuză. Acoperă și transcrieri
        greșite pe care nu le-am văzut încă."""
        self.assertIsNone(match('scade avertisment rosu'))

    def test_nonsense_is_refused_rather_than_guessed(self):
        self.assertIsNone(match('ceva complet aiurea'))
        self.assertIsNone(match(''))


class VoiceCommandInterpretationTests(SimpleTestCase):
    """Cuvântul de activare separă comanda de conversație.

    Arbitrul central vorbește tot meciul cu sportivii. Fără un cuvânt
    care nu apare niciodată natural într-o repriză, o frază obișnuită ar
    putea deveni comandă.
    """

    def test_a_command_with_the_wake_word_is_accepted(self):
        self.assertEqual(interpret('arbitru un punct rosu'), ('ok', 'point_red_1'))

    def test_the_wake_word_may_follow_filler(self):
        self.assertEqual(interpret('asa, arbitrul, opreste timpul'), ('ok', 'pause'))

    def test_a_command_without_the_wake_word_does_not_fire(self):
        self.assertEqual(interpret('un punct rosu'), ('fara_activare', None))

    def test_the_wake_word_can_be_turned_off(self):
        self.assertEqual(
            interpret('un punct rosu', require_wake_word=False), ('ok', 'point_red_1'),
        )

    def test_silence_and_nonsense_are_told_apart(self):
        """Interfața răspunde altceva la 'n-am auzit nimic' decât la
        'am auzit, dar nu înțeleg' - altfel arbitrul nu știe dacă să
        repete mai tare sau altfel."""
        self.assertEqual(interpret(''), ('tacere', None))
        self.assertEqual(interpret('arbitru mergi mai repede'), ('neinteles', None))
