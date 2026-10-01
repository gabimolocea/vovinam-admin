import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Apple, Check, Copy, Database, Download, HardDrive, Image,
  Monitor, MonitorPlay, Server, Tablet, Timer, Wifi,
} from 'lucide-react';
import { API_BASE_URL } from '@shared/lib/api';
import { Alert, Badge, Card, CardContent, Skeleton } from '../components/ui';

/**
 * Ghidul de instalare a laptopului din sala de concurs.
 *
 * Nu e documentatie pentru dezvoltatori: e scris pentru persoana care
 * pregateste laptopul si care, de regula, nu a deschis niciodata un
 * terminal. De aceea fiecare pas spune si ce trebuie sa vezi dupa ce l-ai
 * facut, iar sectiunea despre Docker explica ce e fiecare rand de acolo -
 * altfel ferestrele alea par un zgomot pe care nu stii daca e in regula.
 *
 * Instructiunile difera intre Mac si Windows mai ales la deschiderea unei
 * aplicatii nesemnate, asa ca pagina are un comutator in loc sa insire
 * ambele variante una sub alta si sa lase omul sa ghiceasca.
 *
 * Perechea lui scrisa e docs/GHID_COMPETITIE_LOCALA.md; cand se schimba
 * ceva aici, trebuie schimbat si acolo.
 */

// Adresa de descarcare e la noi, nu pe GitHub, si nu se schimba de la o
// versiune la alta: serverul cauta de fiecare data ultima versiune si
// trimite browserul la fisierul potrivit (api/views/launcher_release.py).
// Asa, cel care pregateste laptopul apasa un buton si primeste fisierul, in
// loc sa ajunga pe o pagina unde trebuie sa desfaca "Assets" si sa aleaga
// singur dintre cinci fisiere cu nume aproape identice.
const DOWNLOAD_URL = (cheie) => `${API_BASE_URL}/public/launcher/download/${cheie}/`;

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
    semn: 'Trebuie să scrie „healthy”. Până nu e sănătoasă, celelalte nici nu pornesc.',
  },
  {
    nume: 'backend',
    icon: Server,
    titlu: 'Aplicația propriu-zisă',
    ce: 'Programul care răspunde tabletelor de arbitraj și ecranelor din sală.',
    deCe:
      'Tot ce apasă cineva pe o tabletă ajunge aici, iar de aici în baza de date. '
      + 'Dacă acest container e oprit, tabletele nu mai pot trimite scoruri.',
    semn: 'Trebuie să scrie „running”, cu portul 8000 afișat lângă.',
  },
  {
    nume: 'frontends',
    icon: MonitorPlay,
    titlu: 'Cele trei ecrane',
    ce: 'Administrarea competiției, arbitrajul și ecranul public, ca pagini gata făcute.',
    deCe:
      'Paginile pe care le deschid oamenii în browser. Ele vin de aici, din '
      + 'container — de asta pe laptopul din sală nu mai trebuie instalat nimic '
      + 'altceva în afară de Docker.',
    semn: 'Trebuie să scrie „running”, cu trei porturi lângă: 5191, 5176 și 5177.',
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
    semn: 'Trebuie să scrie „running”. Nu are port — nu-l accesează nimeni direct.',
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

/**
 * Butoanele de descarcare, cu ultima versiune adusa de la server.
 *
 * Nu intrebam GitHub din browser: serverul o face si tine raspunsul in
 * cache, ca sa nu ne lovim de limita lui GitHub taman cand cineva
 * pregateste laptopul (vezi api/views/launcher_release.py).
 *
 * Daca versiunea nu se poate afla - server cazut, nicio versiune publicata
 * inca - ramane legatura catre lista de versiuni. Pagina trebuie sa fie
 * folosibila si atunci: omul care o citeste nu are pe cine intreba.
 */
function Descarcari({ sistem }) {
  const [stare, setStare] = useState({ faza: 'se-incarca' });

  useEffect(() => {
    let activ = true;
    fetch(`${API_BASE_URL}/public/launcher/latest/`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((date) => activ && setStare({ faza: 'gata', date }))
      .catch(() => activ && setStare({ faza: 'eroare' }));
    return () => { activ = false; };
  }, []);

  if (stare.faza === 'se-incarca') {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }

  const date = stare.date;
  const fisiere = (date?.fisiere || []).filter((f) => f.sistem === sistem);

  if (!fisiere.length) {
    return (
      <div className="flex flex-col gap-2">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <div>
            Nu pot afla acum ultima versiune. Descarc-o de pe pagina de versiuni și
            alege fișierul care se termină în{' '}
            <code className="font-mono">{sistem === 'mac' ? '.dmg' : '.exe'}</code>.
          </div>
        </Alert>
        <a
          href={date?.pagina_release || 'https://github.com/gabimolocea/vovinam-admin/releases/latest'}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
        >
          <Download className="h-4 w-4" /> Deschide pagina de versiuni
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {fisiere.map((f) => (
        <a
          key={f.cheie}
          href={DOWNLOAD_URL(f.cheie)}
          className="flex w-fit items-center gap-3 rounded-md bg-brand-red px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          <Download className="h-4 w-4 shrink-0" />
          <span className="flex flex-col items-start leading-tight">
            <span>{f.eticheta}</span>
            <span className="text-xs font-normal opacity-80">{f.detaliu} · {f.marime_mb} MB</span>
          </span>
        </a>
      ))}
      {date?.versiune && (
        <p className="text-xs text-muted-foreground">
          Versiunea {date.versiune}
          {date.publicat_la && ` · publicată ${new Date(date.publicat_la).toLocaleDateString('ro-RO', {
            day: 'numeric', month: 'long', year: 'numeric',
          })}`}
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

/** „Dupa pasul asta trebuie sa vezi X” - fara reperele astea, cineva care
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
  const [sistem, setSistem] = useState('mac');
  const eMac = sistem === 'mac';

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
          {' '}Instalarea cere internet bun — se descarcă vreun gigabyte — iar în sală
          s-ar putea să nu-l ai.
        </div>
      </Alert>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold">De ce ai nevoie</h2>
        <Card>
          <CardContent className="pt-6">
            <ul className="flex flex-col gap-2 text-sm">
              <li><strong>Un laptop</strong> — Mac sau Windows — care rămâne în sală toată ziua, cu încărcătorul lui. Nu se închide capacul în timpul competiției.</li>
              <li><strong>Internet</strong> — doar acum, la instalare. În ziua competiției nu mai e nevoie.</li>
              <li><strong>Un router Wi-Fi propriu</strong> pentru eveniment, la care se leagă tabletele și ecranele.</li>
              <li><strong>Contul tău de administrator</strong> — același cu care ești autentificat acum.</li>
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              Două programe se instalează, atât: Docker Desktop și aplicația
              federației. Nu e nevoie de nimic altceva.
            </p>
          </CardContent>
        </Card>
      </section>

      <div className="flex items-center gap-2" role="tablist" aria-label="Sistemul laptopului">
        <span className="text-sm text-muted-foreground">Laptopul din sală are:</span>
        {[['mac', 'macOS', Apple], ['windows', 'Windows', Monitor]].map(([id, nume, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={sistem === id}
            onClick={() => setSistem(id)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium ${
              sistem === id
                ? 'border-brand-red bg-brand-red text-white'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            <Icon className="h-4 w-4" /> {nume}
          </button>
        ))}
      </div>

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
              descarcă <strong>Docker Desktop pentru {eMac ? 'Mac' : 'Windows'}</strong>.
            </li>
            {eMac ? (
              <li>
                Alege varianta potrivită: <strong>Apple Silicon</strong> pentru Mac-urile din 2020
                încoace (M1, M2, M3, M4), <strong>Intel</strong> pentru cele mai vechi. Dacă nu
                știi, meniul Apple → &bdquo;Despre acest Mac&rdquo; îți spune.
              </li>
            ) : (
              <li>
                La instalare lasă bifată opțiunea <strong>WSL 2</strong>. Dacă Windows cere o
                repornire, fă-o acum — altfel Docker nu pornește.
              </li>
            )}
            <li>
              {eMac
                ? 'Deschide fișierul descărcat și trage iconița Docker peste folderul Applications.'
                : 'Deschide fișierul descărcat și apasă prin instalare până la final.'}
            </li>
            <li>Pornește Docker. Prima dată cere parola calculatorului și acceptarea condițiilor.</li>
            <li>
              Așteaptă până balena din {eMac ? 'bara de sus' : 'colțul din dreapta jos'} stă
              nemișcată — cât se mișcă, încă pornește.
            </li>
          </ol>
          <Verifica>
            în fereastra Docker, jos în stânga, un punct verde cu textul &bdquo;Engine running&rdquo;.
          </Verifica>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <div>
              Lasă Docker să pornească odată cu calculatorul (Settings → General →
              &bdquo;Start Docker Desktop when you sign in&rdquo;). Altfel, dacă laptopul se
              restartează în ziua competiției, nimic nu mai pornește singur.
            </div>
          </Alert>
        </Pas>

        <Pas numar={2} titlu="Descarcă aplicația federației" durata="~2 minute">
          <p className="text-sm text-muted-foreground">
            De aici se conduce toată ziua: aduci competiția din site, pornești sala,
            iar la final trimiți rezultatele înapoi.
          </p>
          <Descarcari sistem={sistem} />
          <Alert>
            <Download className="h-4 w-4" />
            <div>
              {eMac ? (
                <>
                  <strong className="font-semibold">Despre versiunile următoare:</strong> aplicația
                  îți spune singură când apare una nouă și îți deschide pagina de descarcare.
                  Pe Mac instalarea nu se poate face automat, așa că o tragi din nou peste
                  folderul Applications — e nevoie de un certificat Apple pentru ca pasul
                  ăsta să dispară.
                </>
              ) : (
                <>
                  <strong className="font-semibold">Despre versiunile următoare:</strong> aplicația
                  le descarcă singură și te întreabă când vrei să repornești. Dacă ești în
                  mijlocul unei competiții, alegi &bdquo;Mai târziu&rdquo; și nu se întrerupe nimic.
                </>
              )}
            </div>
          </Alert>
        </Pas>

        <Pas numar={3} titlu="Deschide-o prima dată" durata="~5 minute">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <div>
              <strong className="font-semibold">Calculatorul o să te avertizeze. E normal.</strong>{' '}
              Aplicația nu e cumpărată de la {eMac ? 'Apple' : 'Microsoft'} cu un certificat
              plătit, iar sistemul nu recunoaște cine a făcut-o. Pașii de mai jos se fac{' '}
              <strong>o singură dată</strong>; după aceea se deschide normal.
            </div>
          </Alert>
          {eMac ? (
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
              <li>Deschide fișierul <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.dmg</code> și trage aplicația peste folderul Applications.</li>
              <li>
                În Applications, <strong>clic dreapta</strong> pe ea (nu dublu-clic) și alege{' '}
                <strong>Deschide</strong>. Apare o fereastră care întreabă dacă ești sigur —
                apasă tot <strong>Deschide</strong>.
              </li>
              <li>
                Dacă scrie că aplicația <em>&bdquo;este deteriorată și nu poate fi deschisă&rdquo;</em>,
                deschide Terminal și rulează o singură dată:
              </li>
            </ol>
          ) : (
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
              <li>Dublu-clic pe fișierul <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.exe</code> descărcat.</li>
              <li>
                Windows arată un ecran albastru, <strong>&bdquo;Windows protected your PC&rdquo;</strong>.
                Apasă <strong>More info</strong>, apoi butonul <strong>Run anyway</strong> care
                apare dedesubt.
              </li>
              <li>Mergi prin instalare până la final și lasă bifată scurtătura pe desktop.</li>
            </ol>
          )}
          {eMac && (
            <Comanda>xattr -dr com.apple.quarantine &quot;/Applications/FRVV Competition Launcher.app&quot;</Comanda>
          )}
          <Verifica>
            o fereastră cu sigla federației, care îți cere adresa serverului și datele
            tale de autentificare. Adresa se scrie cu <code className="font-mono">https://</code> în față.
          </Verifica>
        </Pas>

        <Pas numar={4} titlu="Prima pornire a sălii" durata="~20 minute, o singură dată">
          <p className="text-sm text-muted-foreground">
            Autentifică-te cu contul tău, alege competiția și apasă pornirea. Prima
            dată launcherul descarcă din internet tot ce îi trebuie — de asta durează.
            La competițiile următoare pornește în mai puțin de un minut, fără internet.
          </p>
          <Verifica>
            în Docker, la <strong>Containers</strong>, patru rânduri pornite. Ce
            înseamnă fiecare scrie mai jos.
          </Verifica>
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
          Trebuie să vezi patru rânduri, toate pornite. Dacă unul lipsește sau e roșu,
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
                Docker Desktop nu e pornit. Deschide-l, așteaptă punctul verde
                &bdquo;Engine running&rdquo;, apoi încearcă din nou.
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
              <p className="font-semibold">Prima pornire se oprește la descărcare</p>
              <p className="text-muted-foreground">
                Nu are internet, sau e prea slab. Prima pornire trebuie făcută acasă
                sau la federație, nu în sală — după aceea totul e deja pe laptop.
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
              <p className="font-semibold">Un container apare roșu sau repornește mereu</p>
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
