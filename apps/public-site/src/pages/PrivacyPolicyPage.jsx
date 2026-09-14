import LegalPageLayout, { LegalSection } from '../components/LegalPageLayout';

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      title="Politica de Confidențialitate"
      description="Ce date personale colectează Federația Română de Vovinam Việt Võ Đạo, în ce scop și cum le poți controla."
      path="/confidentialitate"
      updated="14 septembrie 2026"
    >
      <LegalSection>
        <p>
          Această politică explică ce date personale colectăm prin platforma <strong>vovinam.ro</strong>, de ce le
          colectăm, cât timp le păstrăm și ce drepturi ai. Pentru detalii specifice legate de GDPR (temeiuri legale,
          consimțământul dat la înregistrare, cookie-uri) vezi și <a href="/gdpr">pagina dedicată GDPR</a>.
        </p>
      </LegalSection>

      <LegalSection title="1. Operatorul de date">
        <p>
          Operatorul de date este <strong>Federația Română de Vovinam Việt Võ Đạo</strong>, unica entitate
          recunoscută de Ministerul Sportului pentru a reprezenta România la evenimentele oficiale internaționale
          de Vovinam Việt Võ Đạo. Detaliile de contact ale Federației sunt afișate pe pagina{' '}
          <a href="/despre">Despre noi</a>.
        </p>
      </LegalSection>

      <LegalSection title="2. Ce date colectăm">
        <p><strong>Cont de utilizator:</strong> adresă de email și parolă (stocată criptat, niciodată în text clar).</p>
        <p>
          <strong>Profil de sportiv/antrenor:</strong> prenume, nume, data nașterii, gen, telefon mobil, club,
          localitate, CNP, serie și poză legitimație (sau cererea de legitimare, dacă nu ești încă legitimat), nume
          și telefon contact de urgență, poză de profil.
        </p>
        <p>
          <strong>Documente transmise spre aprobare:</strong> fotografii ale diplomelor/certificatelor de rezultat,
          certificatelor de grad, dovezilor de participare la seminarii și vizelor medicale anuale.
        </p>
        <p><strong>Formular de contact:</strong> nume, email, telefon (opțional) și conținutul mesajului.</p>
        <p>
          <strong>Date tehnice:</strong> jurnale de acces la nivel de server (adresă IP, tip de browser, pagini
          accesate) folosite pentru securitate și depanare, și, dacă alegi să le accepți, cookie-uri de analiză
          (Google Analytics) - vezi secțiunea despre cookie-uri din <a href="/gdpr">pagina GDPR</a>.
        </p>
      </LegalSection>

      <LegalSection title="3. De ce colectăm aceste date și în ce temei legal">
        <ul>
          <li>
            <strong>Executarea contractului/serviciului</strong> - pentru a crea și administra contul tău, a-ți
            gestiona calitatea de sportiv legitimat, a procesa rezultate, grade, participări și vize medicale.
          </li>
          <li>
            <strong>Interes legitim</strong> - pentru comunicare legată de activitatea federativă, prevenirea
            fraudei și securitatea Platformei.
          </li>
          <li>
            <strong>Obligație legală</strong> - pentru păstrarea evidențelor federative cerute de reglementările
            sportive naționale/internaționale (EVVF, WVVF, Ministerul Sportului).
          </li>
          <li>
            <strong>Consimțământ</strong> - pentru CNP (vezi secțiunea 4), pentru cookie-urile de analiză, și pentru
            utilizarea imaginii în materiale promoționale, conform <a href="/gdpr">informării GDPR</a>.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. CNP - regim special">
        <p>
          Codul Numeric Personal beneficiază de un regim special de protecție conform Legii nr. 190/2018. Îl
          colectăm doar cu consimțământul tău explicit, exclusiv pentru identificarea certă a sportivului legitimat
          în evidențele oficiale ale Federației (cerută de reglementările competiționale), și îl accesează doar
          personalul autorizat implicat în procesul de legitimare.
        </p>
      </LegalSection>

      <LegalSection title="5. Cui transmitem datele">
        <p>Nu vindem datele tale. Le transmitem doar către:</p>
        <ul>
          <li>furnizori tehnici care găzduiesc Platforma și baza de date (DigitalOcean, infrastructură în UE);</li>
          <li>furnizorul de email tranzacțional folosit pentru notificări de cont (Amazon SES);</li>
          <li>
            un serviciu de inteligență artificială (Anthropic Claude) folosit strict pentru a citi automat câmpurile
            de pe o fotografie de legitimație/diplomă/certificat pe care o încarci, ca sprijin la completarea
            formularului - datele extrase sunt afișate pentru verificarea ta înainte de trimitere, nu sunt folosite
            pentru altceva;
          </li>
          <li>antrenorul clubului tău și arbitrii/administratorii implicați în aprobarea rezultatelor/gradelor tale;</li>
          <li>autorități publice, atunci când legea ne obligă.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Cât timp păstrăm datele">
        <p>
          Păstrăm datele contului și ale profilului de sportiv cât timp contul este activ, plus perioada necesară
          păstrării evidențelor federative după caz. Poți solicita oricând ștergerea contului - vezi secțiunea 8.
        </p>
      </LegalSection>

      <LegalSection title="7. Drepturile tale">
        <p>Conform GDPR, ai dreptul de a:</p>
        <ul>
          <li>solicita acces la datele tale și o copie a acestora;</li>
          <li>solicita corectarea datelor inexacte;</li>
          <li>solicita ștergerea datelor, atunci când nu există un temei legal care ne obligă să le păstrăm;</li>
          <li>restricționa sau te opune prelucrării, în anumite condiții;</li>
          <li>solicita portabilitatea datelor pe care ni le-ai furnizat direct;</li>
          <li>retrage oricând un consimțământ acordat, fără a afecta legalitatea prelucrării anterioare retragerii;</li>
          <li>depune o plângere la Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP).</li>
        </ul>
        <p>Detalii complete despre cum îți poți exercita aceste drepturi găsești în <a href="/gdpr">pagina GDPR</a>.</p>
      </LegalSection>

      <LegalSection title="8. Datele minorilor">
        <p>
          Vovinam Việt Võ Đạo se practică și de sportivi minori. Pentru un sportiv minor, profilul este completat și
          gestionat de un părinte/tutore legal sau de antrenorul clubului cu acordul acestuia, iar consimțământul
          pentru prelucrarea datelor (inclusiv CNP și imagine) este dat de părinte/tutore.
        </p>
      </LegalSection>

      <LegalSection title="9. Securitate">
        <p>
          Parolele sunt stocate criptat, conexiunea la Platformă este criptată (HTTPS), iar accesul la datele
          administrative este limitat pe roluri (sportiv, antrenor, arbitru, administrator).
        </p>
      </LegalSection>

      <LegalSection title="10. Modificări ale acestei politici">
        <p>
          Putem actualiza această politică periodic; data ultimei actualizări este afișată în partea de sus a
          paginii. Modificările importante vor fi comunicate prin notificare pe cont sau email.
        </p>
      </LegalSection>

      <LegalSection title="11. Contact">
        <p>
          Pentru exercitarea drepturilor tale sau orice întrebare legată de datele tale personale, contactează
          Federația prin canalele afișate pe pagina <a href="/despre">Despre noi</a>.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
