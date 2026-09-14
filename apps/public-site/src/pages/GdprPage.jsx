import LegalPageLayout, { LegalSection } from '../components/LegalPageLayout';

export default function GdprPage() {
  return (
    <LegalPageLayout
      title="GDPR"
      description="Informare GDPR: consimțământul dat la înregistrare, utilizarea imaginii la competiții, drepturile tale și cookie-urile folosite pe vovinam.ro."
      path="/gdpr"
      updated="14 septembrie 2026"
    >
      <LegalSection>
        <p>
          Această pagină completează <a href="/confidentialitate">Politica de Confidențialitate</a> cu detaliile
          cerute de Regulamentul (UE) 2016/679 (GDPR): consimțământul pe care ți-l cerem la înregistrare, modul în
          care poate fi folosită imaginea ta la evenimentele Federației, drepturile tale concrete și cookie-urile
          folosite pe site.
        </p>
      </LegalSection>

      <LegalSection title="1. Consimțământul dat la înregistrare">
        <p>
          La crearea contului ți se cere să bifezi explicit o casetă de consimțământ pentru Termeni și Condiții,
          Politica de Confidențialitate și această informare GDPR. Fără această bifă nu se poate crea contul. Data
          și ora acceptării sunt înregistrate în contul tău, ca dovadă a consimțământului conform art. 7 alin. (1)
          GDPR.
        </p>
      </LegalSection>

      <LegalSection title="2. Utilizarea fotografiilor și materialelor video de la evenimente">
        <p>
          Competițiile, examenele de grad, seminariile și celelalte evenimente oficiale organizate sau găzduite de
          Federație sunt, prin natura lor, evenimente publice la care se fac în mod curent fotografii și
          înregistrări video. Prin înscrierea ca sportiv/participant la aceste evenimente (sau, pentru sportivii
          minori, prin consimțământul părintelui/tutorelui legal la înscriere), ești de acord ca imaginea ta
          surprinsă în cadrul acestor evenimente oficiale să fie folosită de Federație, fără o compensație
          suplimentară, pentru:
        </p>
        <ul>
          <li>publicarea rezultatelor, clasamentelor și reportajelor oficiale ale evenimentului;</li>
          <li>
            materiale de promovare a Vovinam Việt Võ Đạo și a activității Federației pe canalele oficiale (site,
            pagini de rețele sociale, materiale tipărite);
          </li>
          <li>arhiva istorică a Federației.</li>
        </ul>
        <p>
          Acest acord <strong>nu</strong> acoperă utilizarea comercială a imaginii tale de către terți în afara
          activității Federației și <strong>nu</strong> se extinde la fotografii/înregistrări din afara evenimentelor
          oficiale ale Federației. Poți retrage oricând acest acord pentru materialele viitoare, printr-o cerere
          scrisă către Federație (vezi secțiunea 6) - retragerea nu afectează materialele deja publicate legal
          înainte de primirea cererii.
        </p>
      </LegalSection>

      <LegalSection title="3. Datele minorilor">
        <p>
          Vovinam Việt Võ Đạo se practică și de copii/adolescenți. Pentru un sportiv minor, atât înscrierea, cât și
          orice consimțământ (inclusiv cel de la secțiunea 2) sunt date de părintele/tutorele legal, care poate
          contacta oricând Federația pentru a verifica, corecta sau retrage datele/consimțământul acordat pentru
          minorul pe care îl reprezintă.
        </p>
      </LegalSection>

      <LegalSection title="4. Temeiurile legale, pe scurt">
        <ul>
          <li><strong>Executarea contractului</strong> - administrarea contului, a calității de sportiv legitimat, a rezultatelor și gradelor.</li>
          <li><strong>Obligație legală</strong> - păstrarea evidențelor federative cerute de reglementările sportive.</li>
          <li><strong>Interes legitim</strong> - comunicare, securitate, prevenirea fraudei.</li>
          <li><strong>Consimțământ</strong> - CNP, imaginea foto/video de la evenimente (secțiunea 2) și cookie-urile de analiză (secțiunea 7).</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Drepturile tale, în detaliu">
        <p>Ne poți cere oricând, gratuit:</p>
        <ul>
          <li><strong>Acces</strong> - o copie a datelor tale personale pe care le deținem;</li>
          <li><strong>Rectificare</strong> - corectarea unor date inexacte sau incomplete;</li>
          <li><strong>Ștergere</strong> - ștergerea datelor, atunci când nu există un temei legal care ne obligă să le păstrăm;</li>
          <li><strong>Restricționare</strong> - limitarea temporară a prelucrării, în anumite situații;</li>
          <li><strong>Portabilitate</strong> - primirea datelor pe care ni le-ai furnizat direct, într-un format structurat;</li>
          <li><strong>Opoziție</strong> - te poți opune prelucrării bazate pe interes legitim;</li>
          <li><strong>Retragerea consimțământului</strong> - oricând, fără să afecteze legalitatea prelucrării de dinainte de retragere.</li>
        </ul>
        <p>
          Răspundem oricărei cereri în cel mult 30 de zile calendaristice. Dacă nu ești mulțumit de răspuns, poți
          depune o plângere la Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal
          (ANSPDCP) - B-dul G-ral. Gheorghe Magheru nr. 28-30, Sector 1, București, sau online la{' '}
          <a href="https://www.dataprotection.ro" target="_blank" rel="noopener noreferrer">www.dataprotection.ro</a>.
        </p>
      </LegalSection>

      <LegalSection title="6. Cum îți exerciți drepturile">
        <p>
          Trimite o cerere prin canalele de contact afișate pe pagina <a href="/despre">Despre noi</a>, menționând
          clar dreptul pe care vrei să îl exerciți. Îți putem cere date suplimentare doar pentru a confirma
          identitatea, ca să nu divulgăm datele altcuiva.
        </p>
      </LegalSection>

      <LegalSection title="7. Cookie-uri și Google Analytics">
        <p>
          Site-ul folosește cookie-uri strict necesare funcționării (autentificare, securitate CSRF), care nu
          necesită consimțământ. Dacă alegi „Accept” în bannerul de cookie-uri afișat la prima vizită, folosim și
          Google Analytics 4 pentru a înțelege cum este folosit site-ul (pagini vizitate, durata vizitei) - acesta
          setează cookie-uri de analiză (ex. <code>_ga</code>) și transmite date statistice, anonimizate la nivel
          de IP, către Google. Poți alege „Refuz” sau reveni oricând asupra alegerii tale din bannerul de
          cookie-uri, disponibil în josul paginii.
        </p>
      </LegalSection>

      <LegalSection title="8. Cui transmitem datele (împuterniciți)">
        <ul>
          <li>DigitalOcean - găzduirea site-ului și a bazei de date;</li>
          <li>Amazon SES - trimiterea emailurilor de cont (confirmare, resetare parolă, notificări);</li>
          <li>Anthropic (Claude) - citirea automată, opțională, a datelor de pe fotografiile de legitimație/diplome/certificate încărcate, strict pentru a prefigura formularul - datele extrase le vezi și le confirmi tu înainte de trimitere;</li>
          <li>Google Analytics - doar dacă ai acceptat cookie-urile de analiză.</li>
        </ul>
      </LegalSection>
    </LegalPageLayout>
  );
}
