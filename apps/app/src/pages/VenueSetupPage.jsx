import { useRef, useState } from 'react';
import {
  AlertTriangle, Check, Copy, Database, HardDrive, Image, Monitor,
  Server, Tablet, Timer, Wifi,
} from 'lucide-react';
import { Alert, Badge, Card, CardContent } from '../components/ui';

/**
 * Ghidul de instalare a laptopului din sala de concurs.
 *
 * Nu e documentatie pentru dezvoltatori: e scris pentru persoana care
 * pregateste laptopul si care, de regula, nu a deschis niciodata un
 * terminal. De aceea fiecare comanda are buton de copiere (nimeni nu
 * transcrie corect o comanda lunga de pe ecran), fiecare pas spune si ce
 * trebuie sa vezi dupa ce l-ai facut, iar sectiunea despre Docker explica
 * ce e fiecare rand de acolo - altfel ferestrele alea par un zgomot pe
 * care nu stii daca e in regula sau nu.
 *
 * Perechea lui scrisa e docs/GHID_COMPETITIE_LOCALA.md; cand se schimba
 * ceva aici, trebuie schimbat si acolo.
 */

const CONTAINERE = [
  {
    nume: 'db',
    icon: Database,
    titlu: 'Baza de date',
    ce: 'PostgreSQL 17 — aceeași versiune ca pe site-ul federației.',
    deCe:
      'Aici stau toate datele competiției cât ține ziua: sportivii, categoriile, '
      + 'cântarul, scorurile, clasamentele. În sală, acesta este adevărul — nu '
      + 'site-ul din internet.',
    semn: 'Trebuie să scrie „healthy". Până nu e sănătoasă, celelalte două nici nu pornesc.',
  },
  {
    nume: 'backend',
    icon: Server,
    titlu: 'Aplicația propriu-zisă',
    ce: 'Programul care răspunde tabletelor de arbitraj și ecranelor din sală.',
    deCe:
      'Tot ce apasă cineva pe o tabletă ajunge aici, iar de aici în baza de date. '
      + 'Dacă acest container e oprit, tabletele nu mai pot trimite scoruri.',
    semn: 'Trebuie să scrie „running", cu portul 8000 afișat lângă.',
  },
  {
    nume: 'backup-scheduler',
    icon: Timer,
    titlu: 'Salvările automate',
    ce: 'Face o copie completă a bazei de date la fiecare 15 minute.',
    deCe:
      'Plasa de siguranță a zilei. Dacă se încurcă ceva — o categorie ștearsă din '
      + 'greșeală, un scor greșit propagat — te poți întoarce la o copie de acum '
      + '15 minute, din launcher. Rulează separat de aplicație tocmai ca să '
      + 'continue să salveze chiar dacă aplicația e repornită.',
    semn: 'Trebuie să scrie „running". Nu are port — nu-l accesează nimeni direct.',
  },
];

const VOLUME = [
  {
    nume: 'frvv_local_db_data',
    icon: Database,
    ce: 'Datele competiției. Ăsta e volumul care nu trebuie șters niciodată în ziua competiției.',
  },
  {
    nume: 'frvv_local_media',
    icon: Image,
    ce: 'Pozele de profil ale sportivilor, aduse odată cu competiția.',
  },
  {
    nume: 'frvv_local_backups',
    icon: HardDrive,
    ce: 'Copiile făcute din 15 în 15 minute. De aici le ia launcherul când ceri o restaurare.',
  },
];

const ADRESE = [
  { icon: Monitor, ce: 'Administrarea competiției', port: '5191', cine: 'Laptopul secretariatului' },
  { icon: Tablet, ce: 'Arbitraj', port: '5176', cine: 'Tabletele arbitrilor' },
  { icon: Monitor, ce: 'Ecranul public', port: '5177', cine: 'Televizorul sau proiectorul din sală' },
];

function Comanda({ children }) {
  const [stare, setStare] = useState('gata'); // gata | copiat | selectat
  const codRef = useRef(null);

  // Scrierea in clipboard poate fi refuzata - browser mai vechi, pagina
  // servita fara https, o setare de securitate. Daca am lasa doar un
  // `catch` gol, omul ar apasa butonul si nu s-ar intampla absolut nimic,
  // ceea ce intr-un tutorial e mai rau decat sa nu existe butonul. Asa ca
  // in caz de refuz selectam noi comanda si ii spunem sa apese Cmd+C.
  async function copiaza() {
    try {
      await navigator.clipboard.writeText(children);
      setStare('copiat');
    } catch {
      const nod = codRef.current;
      if (nod) {
        const interval = document.createRange();
        interval.selectNodeContents(nod);
        const selectie = window.getSelection();
        selectie.removeAllRanges();
        selectie.addRange(interval);
      }
      setStare('selectat');
    }
    setTimeout(() => setStare('gata'), 3000);
  }

  const eticheta = {
    gata: 'Copiază comanda',
    copiat: 'Comandă copiată',
    selectat: 'Comandă selectată — apasă Cmd+C',
  }[stare];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-stretch gap-2">
        <code ref={codRef} className="flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-sm">
          {children}
        </code>
        <button
          type="button"
          onClick={copiaza}
          aria-label={eticheta}
          className="shrink-0 rounded-md border border-border px-3 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {stare === 'copiat'
            ? <Check className="h-4 w-4 text-green-600" />
            : <Copy className="h-4 w-4" />}
        </button>
      </div>
      {stare !== 'gata' && (
        <p className="text-xs text-muted-foreground" role="status">
          {stare === 'copiat' ? 'Copiat.' : 'Comanda e selectată — apasă Cmd+C ca s-o copiezi.'}
        </p>
      )}
    </div>
  );
}

function Pas({ numar, titlu, durata, children }) {
  return (
    <Card>
      <CardContent className="flex gap-4 pt-6">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-red text-sm font-bold text-white">
          {numar}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-bold">{titlu}</h3>
            {durata && <Badge variant="secondary">{durata}</Badge>}
          </div>
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

/** &bdquo;Dupa pasul asta trebuie sa vezi X&rdquo; - fara reperele astea, cineva care
 * nu cunoaste programele merge mai departe cu un pas nereusit si descopera
 * abia la final, cand e greu de spus care dintre ei a fost. */
function Verifica({ children }) {
  return (
    <div className="rounded-md border-l-4 border-green-600 bg-green-50 px-3 py-2 text-sm dark:bg-green-950/30">
      <strong className="font-semibold">Trebuie să vezi:</strong> {children}
    </div>
  );
}

export default function VenueSetupPage() {
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Competiție în sală — instalare</h1>
        <p className="mt-1 text-muted-foreground">
          Cum pregătești laptopul care ține competiția când sala nu are internet.
          Se face o singură dată, cu mult înainte de eveniment.
        </p>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <div>
          <strong className="font-semibold">Fă asta cu o săptămână înainte, nu în dimineața competiției.</strong>
          {' '}Prima instalare durează aproape o oră, din care cea mai mare parte e
          așteptare, iar unii pași cer internet — pe care în sală s-ar putea să nu-l ai.
        </div>
      </Alert>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold">De ce ai nevoie</h2>
        <Card>
          <CardContent className="pt-6">
            <ul className="flex flex-col gap-2 text-sm">
              <li><strong>Un laptop Mac</strong> care rămâne în sală toată ziua, cu încărcătorul lui. Nu se închide capacul în timpul competiției.</li>
              <li><strong>Internet</strong> — doar acum, la instalare. În ziua competiției nu mai e nevoie.</li>
              <li><strong>Un router Wi-Fi propriu</strong> pentru eveniment, la care se leagă tabletele și ecranele.</li>
              <li><strong>Contul tău de administrator</strong> — același cu care ești autentificat acum.</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold">Instalarea, pas cu pas</h2>

        <Pas numar={1} titlu="Instalează Docker Desktop" durata="~15 minute">
          <p className="text-sm text-muted-foreground">
            Docker e programul care ține baza de date și aplicația competiției,
            fiecare în &bdquo;cutia&rdquo; ei, fără să încurce nimic altceva de pe laptop.
          </p>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
            <li>
              Intră pe <a href="https://www.docker.com/products/docker-desktop/" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-red underline">docker.com</a> și
              descarcă <strong>Docker Desktop pentru Mac</strong>.
            </li>
            <li>
              Alege varianta potrivită: <strong>Apple Silicon</strong> pentru Mac-urile din 2020 încoace
              (M1, M2, M3, M4), <strong>Intel</strong> pentru cele mai vechi. Dacă nu știi: meniul{' '}
              <span aria-hidden="true"></span> Apple → &bdquo;Despre acest Mac&rdquo; îți spune.
            </li>
            <li>Deschide fișierul descărcat și trage iconița Docker peste folderul Applications.</li>
            <li>Pornește Docker din Applications. Prima dată cere parola Mac-ului și acceptarea condițiilor.</li>
            <li>Așteaptă până balena din bara de sus stă nemișcată — cât se mișcă, încă pornește.</li>
          </ol>
          <Verifica>
            o balenă în bara de sus a ecranului, iar în fereastra Docker, jos în stânga,
            un punct verde cu textul &bdquo;Engine running&rdquo;.
          </Verifica>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <div>
              Lasă Docker să pornească odată cu Mac-ul (Settings → General → &bdquo;Start Docker
              Desktop when you sign in&rdquo;). Altfel, dacă laptopul se restartează în ziua
              competiției, nimic nu mai pornește singur.
            </div>
          </Alert>
        </Pas>

        <Pas numar={2} titlu="Instalează Node.js" durata="~5 minute">
          <p className="text-sm text-muted-foreground">
            E nevoie de el pentru cele trei aplicații din sală — administrare,
            arbitraj, ecran public. Alege versiunea <strong>LTS</strong>, cea
            recomandată pe prima pagină.
          </p>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
            <li>
              Intră pe <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-red underline">nodejs.org</a> și
              descarcă varianta LTS pentru macOS.
            </li>
            <li>Deschide fișierul și apasă &bdquo;Continue&rdquo; până la final.</li>
            <li>
              Verifică: deschide <strong>Terminal</strong> (Command+Space, scrii &bdquo;Terminal&rdquo;, Enter)
              și rulează:
            </li>
          </ol>
          <Comanda>node --version</Comanda>
          <Verifica>un număr, de exemplu <code className="font-mono">v22.14.0</code>. Dacă scrie &bdquo;command not found&rdquo;, instalarea n-a reușit.</Verifica>
        </Pas>

        <Pas numar={3} titlu="Adu proiectul pe laptop" durata="~10 minute">
          <p className="text-sm text-muted-foreground">
            Cere-i unei persoane tehnice din federație arhiva proiectului, sau
            descarc-o cu comanda de mai jos dacă ai acces la depozitul de cod.
            Pune-l într-un loc stabil — de exemplu direct în folderul tău de acasă —
            și nu-l mai muta după aceea.
          </p>
          <Comanda>git clone &lt;adresa-depozitului&gt; ~/vovinam-admin</Comanda>
          <p className="text-sm text-muted-foreground">Apoi instalează ce are nevoie aplicația:</p>
          <Comanda>cd ~/vovinam-admin &amp;&amp; npm install</Comanda>
          <Verifica>
            la final, un rând de forma &bdquo;added 1234 packages&rdquo;. Durează câteva minute și
            pare că stă degeaba — e normal.
          </Verifica>
        </Pas>

        <Pas numar={4} titlu="Pornește prima dată" durata="~20 minute, o singură dată">
          <p className="text-sm text-muted-foreground">
            În folderul proiectului găsești fișierul{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">Porneste competitia.command</code>.
            Dublu-clic pe el. Pornește Docker dacă nu merge deja, apoi deschide launcherul.
          </p>
          <p className="text-sm text-muted-foreground">
            Prima pornire e lungă: Docker își construiește imaginile. Lasă-l în pace
            până se deschide fereastra launcherului.
          </p>
          <Verifica>
            o fereastră cu sigla federației, care îți cere adresa serverului și datele
            tale de autentificare. Adresa se scrie cu <code className="font-mono">https://</code> în față.
          </Verifica>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <div>
              Fișierul trebuie să rămână în folderul proiectului — de acolo își află
              singur calea. Pentru o scurtătură pe birou fă un <strong>alias</strong>{' '}
              (clic dreapta → &bdquo;Creează alias&rdquo;), nu o copie.
            </div>
          </Alert>
        </Pas>

        <Pas numar={5} titlu="Pregătește rețeaua sălii" durata="~10 minute">
          <ul className="flex flex-col gap-2 text-sm">
            <li>
              <strong>Un router propriu evenimentului</strong>, cu nume și parolă proprii
              (de exemplu <code className="font-mono">FRVV-EVENT</code>). Internetul pe el e opțional.
            </li>
            <li>
              <strong>Oprește &bdquo;client isolation&rdquo;</strong> (sau &bdquo;AP isolation&rdquo;) din setările
              routerului, dacă există. Cu ea pornită, tabletele nu văd laptopul și nimic
              nu funcționează, deși totul pare pornit.
            </li>
            <li>
              <strong>Toate</strong> dispozitivele — laptop, tablete, ecrane — se leagă la
              acest Wi-Fi, nu la altul.
            </li>
          </ul>
          <Verifica>
            adresa laptopului în rețea, pe care launcherul o afișează mare după pornire.
            Arată de forma <code className="font-mono">192.168.1.50</code>.
          </Verifica>
        </Pas>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold">Ce trebuie să vezi în Docker</h2>
        <p className="text-sm text-muted-foreground">
          Deschide Docker Desktop și intră în secțiunea <strong>Containers</strong>.
          Trebuie să vezi trei rânduri, toate pornite. Dacă unul lipsește sau e roșu,
          competiția nu merge — iar aici scrie ce înseamnă fiecare.
        </p>

        <div className="flex flex-col gap-3">
          {CONTAINERE.map(({ nume, icon: Icon, titlu, ce, deCe, semn }) => (
            <Card key={nume}>
              <CardContent className="flex gap-4 pt-6">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <code className="font-mono text-sm font-bold">{nume}</code>
                    <span className="text-sm text-muted-foreground">— {titlu}</span>
                  </div>
                  <p className="text-sm">{ce}</p>
                  <p className="text-sm text-muted-foreground">{deCe}</p>
                  <p className="text-sm"><strong className="font-semibold">Stare normală:</strong> {semn}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <h3 className="mt-2 font-display text-lg font-bold">Volumele (unde stau datele)</h3>
        <p className="text-sm text-muted-foreground">
          În secțiunea <strong>Volumes</strong> din Docker sunt trei intrări. Containerele
          se pot opri și reporni fără pierderi, fiindcă datele stau aici, nu în ele.
          <strong> Nu șterge niciodată nimic de aici în ziua competiției.</strong>
        </p>
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            {VOLUME.map(({ nume, icon: Icon, ce }) => (
              <div key={nume} className="flex gap-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <code className="font-mono text-sm font-bold">{nume}</code>
                  <p className="text-sm text-muted-foreground">{ce}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold">Adresele din sală</h2>
        <p className="text-sm text-muted-foreground">
          Pe fiecare dispozitiv se deschide browserul și se scrie adresa laptopului,
          urmată de două puncte și port. Launcherul le afișează pe toate, gata scrise —
          de acolo e mai sigur să le iei decât să le tastezi.
        </p>
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            {ADRESE.map(({ icon: Icon, ce, port, cine }) => (
              <div key={port} className="flex flex-wrap items-center gap-3">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <code className="font-mono text-sm font-bold">{`http://<adresa-laptopului>:${port}`}</code>
                <span className="text-sm text-muted-foreground">{ce} — {cine}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold">Când ceva nu merge</h2>
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6 text-sm">
            <div>
              <p className="font-semibold">Launcherul spune că nu găsește Docker</p>
              <p className="text-muted-foreground">
                Docker Desktop nu e pornit. Deschide-l din Applications, așteaptă punctul
                verde &bdquo;Engine running&rdquo;, apoi încearcă din nou.
              </p>
            </div>
            <div>
              <p className="font-semibold">La autentificare apare &bdquo;Metoda GET nu este permisă&rdquo;</p>
              <p className="text-muted-foreground">
                Adresa serverului e scrisă fără <code className="font-mono">https://</code>.
                Scrie-o întreagă și reîncearcă.
              </p>
            </div>
            <div>
              <p className="font-semibold">Tabletele nu se conectează la laptop</p>
              <p className="text-muted-foreground">
                Aproape întotdeauna: ori sunt pe alt Wi-Fi, ori routerul are &bdquo;client
                isolation&rdquo; pornită. Verifică-le în ordinea asta.
              </p>
            </div>
            <div>
              <p className="font-semibold">Containerul <code className="font-mono">backend</code> apare roșu sau repornește mereu</p>
              <p className="text-muted-foreground">
                Apasă pe el în Docker și citește ultimele rânduri din &bdquo;Logs&rdquo; — acolo scrie
                motivul. Trimite acele rânduri persoanei tehnice; fără ele nu se poate ghici.
              </p>
            </div>
            <div className="flex gap-2 rounded-md bg-muted px-3 py-2">
              <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-muted-foreground">
                Datele nu se pierd dacă se oprește ceva: baza de date are copii din 15 în
                15 minute, iar laptopul repornit le aduce înapoi singur. Până și o pană de
                curent costă, în cel mai rău caz, ultimele 15 minute de lucru.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
