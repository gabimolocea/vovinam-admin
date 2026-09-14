import { useState } from 'react';
import LegalPageLayout, { LegalSection } from '../components/LegalPageLayout';
import Lightbox from '../components/Lightbox';

export default function TermsPage() {
  const [certificateZoomOpen, setCertificateZoomOpen] = useState(false);

  return (
    <>
    <LegalPageLayout
      title="Termeni și Condiții"
      description="Termenii și condițiile de utilizare a platformei online a Federației Române de Vovinam Việt Võ Đạo."
      path="/termeni-si-conditii"
      updated="14 septembrie 2026"
    >
      <LegalSection>
        <p>
          Acești Termeni și Condiții („Termenii”) reglementează utilizarea site-ului și a platformei online
          <strong> vovinam.ro</strong> („Platforma”), operată de <strong>Federația Română de Vovinam Việt Võ Đạo</strong> („Federația”,
          „noi”). Prin crearea unui cont sau prin utilizarea Platformei, confirmi că ai citit, ai înțeles și ești de
          acord cu acești Termeni, precum și cu <a href="/confidentialitate">Politica de Confidențialitate</a> și
          <a href="/gdpr"> informarea GDPR</a>.
        </p>
      </LegalSection>

      <LegalSection title="1. Despre Platformă">
        <p>
          Platforma oferă informații publice despre activitatea Federației (noutăți, calendar competițional,
          cluburi afiliate, sportivi, staff, arbitri, regulamente) și un cont privat pentru sportivi, antrenori și
          susținători, prin care aceștia își pot gestiona profilul, pot transmite spre aprobare rezultate
          competiționale, examene de grad, participări la seminarii și vize medicale anuale.
        </p>
      </LegalSection>

      <LegalSection title="2. Crearea contului">
        <p>Pentru a crea un cont trebuie să:</p>
        <ul>
          <li>ai cel puțin 16 ani sau să creezi/gestionezi contul cu acordul unui părinte/tutore legal, atunci când titularul este minor;</li>
          <li>furnizezi date reale și actualizate despre tine (sau despre sportivul minor pe care îl reprezinți);</li>
          <li>păstrezi confidențialitatea parolei și ne anunți dacă suspectezi accesul neautorizat la contul tău.</li>
        </ul>
        <p>
          Un cont este personal și nu poate fi transferat sau partajat. Federația poate suspenda sau șterge un cont
          care încalcă acești Termeni sau conține date false.
        </p>
      </LegalSection>

      <LegalSection title="3. Conținut încărcat de utilizatori">
        <p>
          Prin încărcarea unei fotografii (poză legitimație, diplomă/certificat de rezultat, certificat de grad,
          dovadă de participare la seminar, viză medicală) declari pe propria răspundere că documentul este real,
          neafectat și că îți aparține sau ai dreptul să îl încarci. Toate aceste documente sunt revizuite de un
          antrenor/arbitru/administrator înainte de a produce vreun efect (aprobarea unui rezultat, a unui grad
          etc.) - încărcarea unui document nu garantează automat aprobarea lui.
        </p>
        <p>
          Federația își rezervă dreptul de a respinge sau elimina orice conținut care este fals, ilizibil, ofensator
          sau care încalcă drepturile unei terțe persoane.
        </p>
      </LegalSection>

      <LegalSection title="4. Utilizare interzisă">
        <p>Este interzis să:</p>
        <ul>
          <li>creezi conturi false sau să te dai drept altă persoană;</li>
          <li>încarci documente sau date ale altei persoane fără acordul acesteia (sau al părintelui/tutorelui, pentru minori);</li>
          <li>folosești Platforma pentru a transmite conținut ilegal, abuziv sau care încalcă drepturile terților;</li>
          <li>încerci să accesezi fără drept zone administrative, alte conturi sau date care nu îți aparțin;</li>
          <li>perturbi funcționarea Platformei (scraping automatizat agresiv, atacuri, exploatarea vulnerabilităților).</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Proprietate intelectuală">
        <p>
          Folosirea fără acordul Federației Române de Vovinam Việt Võ Đạo a denumirii integrale sau parțiale
          „Vovinam”, „Việt Võ Đạo” pe teritoriul României atrage consecințele legale asupra autorilor. Federația
          este membră a Federației Europene de Vovinam Việt Võ Đạo (EVVF) și a Federației Mondiale de Vovinam
          Việt Võ Đạo (WVVF), fiind unica entitate recunoscută de către Ministerul Sportului pentru a reprezenta
          România la evenimentele oficiale internaționale.{' '}
          <button type="button" onClick={() => setCertificateZoomOpen(true)} className="underline">
            Certificat de înregistrare a mărcii.
          </button>
        </p>
        <p>
          Conținutul Platformei (texte, sigla, grafică, structura site-ului) aparține Federației sau este utilizat
          cu acordul titularilor de drepturi și nu poate fi reprodus fără acord scris, cu excepția citării
          rezonabile cu menționarea sursei.
        </p>
      </LegalSection>

      <LegalSection title="6. Disponibilitatea serviciului">
        <p>
          Depunem eforturi rezonabile pentru ca Platforma să fie disponibilă și corectă, dar nu garantăm
          funcționarea neîntreruptă sau lipsită de erori. Platforma poate fi indisponibilă temporar pentru
          mentenanță sau din motive independente de noi.
        </p>
      </LegalSection>

      <LegalSection title="7. Limitarea răspunderii">
        <p>
          În limita permisă de lege, Federația nu răspunde pentru prejudicii indirecte rezultate din utilizarea sau
          imposibilitatea utilizării Platformei. Nimic din acești Termeni nu limitează răspunderea Federației în
          cazurile în care legea nu permite o astfel de limitare.
        </p>
      </LegalSection>

      <LegalSection title="8. Modificarea Termenilor">
        <p>
          Putem actualiza periodic acești Termeni. Continuarea utilizării Platformei după publicarea modificărilor
          reprezintă acceptarea acestora. Data ultimei actualizări este afișată în partea de sus a acestei pagini.
        </p>
      </LegalSection>

      <LegalSection title="9. Legea aplicabilă">
        <p>
          Acești Termeni sunt guvernați de legea română. Orice litigiu se va soluționa pe cale amiabilă sau, în
          lipsa unei înțelegeri, de instanțele competente din România.
        </p>
      </LegalSection>

      <LegalSection title="10. Contact">
        <p>
          Pentru întrebări legate de acești Termeni, ne poți contacta prin canalele oficiale afișate pe pagina{' '}
          <a href="/despre">Despre noi</a>.
        </p>
      </LegalSection>
    </LegalPageLayout>

    <Lightbox
      image={certificateZoomOpen ? { image: '/certificat-inregistrare-marca.jpg', alt_text: 'Certificat de înregistrare a mărcii' } : null}
      onClose={() => setCertificateZoomOpen(false)}
    />
    </>
  );
}
