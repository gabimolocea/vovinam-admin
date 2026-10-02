import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Apple, Check, Copy, Database, Download, Globe, HardDrive, Image,
  KeyRound, Laptop, Monitor, MonitorPlay, Router, Server, Timer, Wifi,
} from 'lucide-react';
import { API_BASE_URL } from '@shared/lib/api';
import { Alert, Badge, Skeleton } from '../components/ui';
import {
  ContainereDocker, DeschidereMac, DeschidereWindows, DockerPornit, HartaZilei,
  IconEcran, IconLaptop, IconTableta, LauncherPornit, PanouCompetitie, RouterIzolare,
} from '../components/VenueSetupIlustratii';

/**
 * Ghidul de instalare a laptopului din sala de concurs.
 *
 * Nu e documentatie pentru dezvoltatori: e scris pentru persoana care
 * pregateste laptopul si care, de regula, nu a deschis niciodata un
 * terminal. De aceea pagina arata, nu povesteste: fiecare pas are desenul
 * ferestrei pe care omul o are in fata si al lucrului la care se uita in
 * ea, iar textul de langa e doar atat cat sa spuna ce apesi. Desenele sunt
 * in components/VenueSetupIlustratii.jsx.
 *
 * Fiindca desenele poarta instructiunea, textul nu o mai repeta - nici
 * pentru cititor, care ar incepe sa caute diferenta dintre cele doua
 * formulari, nici pentru teste, care cauta fiecare instructiune o singura
 * data in pagina.
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

const NECESARE = [
  { icon: Laptop, titlu: 'Un laptop', ce: 'Mac sau Windows. Stă în sală toată ziua, în priză, cu capacul deschis.' },
  { icon: Globe, titlu: 'Internet', ce: 'Doar acum, la instalare. În ziua competiției, nu mai e nevoie.' },
  { icon: Router, titlu: 'Un router Wi-Fi', ce: 'Al evenimentului. La el se leagă tabletele și ecranele.' },
  { icon: KeyRound, titlu: 'Contul tău', ce: 'Același cont de administrator cu care ești autentificat acum.' },
];

const CONTAINERE = [
  {
    nume: 'db',
    icon: Database,
    titlu: 'Baza de date',
    ce: 'Sportivii, categoriile, cântarul, scorurile. În sală, aici e adevărul — nu în site.',
    semn: 'healthy',
  },
  {
    nume: 'backend',
    icon: Server,
    titlu: 'Aplicația',
    ce: 'Primește tot ce apasă arbitrii pe tablete. Oprit, tabletele nu mai pot trimite scoruri.',
    semn: 'running · 8000',
  },
  {
    nume: 'frontends',
    icon: MonitorPlay,
    titlu: 'Cele trei ecrane',
    ce: 'Paginile gata făcute. De asta pe laptop nu se mai instalează nimic altceva.',
    semn: 'running · 5191 · 5176 · 5177',
  },
  {
    nume: 'backup-scheduler',
    icon: Timer,
    titlu: 'Salvările automate',
    ce: 'Copiază toată baza de date din 15 în 15 minute. Plasa de siguranță a zilei.',
    semn: 'running, fără port',
  },
];

const VOLUME = [
  { nume: 'frvv_local_db_data', icon: Database, ce: 'Datele competiției.' },
  { nume: 'frvv_local_media', icon: Image, ce: 'Pozele de profil ale sportivilor.' },
  { nume: 'frvv_local_backups', icon: HardDrive, ce: 'Copiile din 15 în 15 minute.' },
];

const ADRESE = [
  { icon: IconLaptop, ce: 'Administrarea competiției', port: '5191', cine: 'Laptopul secretariatului' },
  { icon: IconTableta, ce: 'Arbitraj', port: '5176', cine: 'Tabletele arbitrilor' },
  { icon: IconEcran, ce: 'Ecranul public', port: '5177', cine: 'Televizorul din sală' },
];

// Filele Panoului Competitie, in ordinea din bara lui (apps/competition-admin,
// CategoriesLayout.jsx). Explicatiile spun ce tine fiecare fila, nu cum se
// apasa: pagina asta pregateste laptopul, nu tine loc de instruire pe aplicatie.
// Filele nu sunt noua lucruri deopotriva: vin in trei valuri, cam in ordinea
// din bara. Culoarea tine valul, nu fila - asa se vede dintr-o privire unde
// esti in zi, in loc sa citesti noua titluri egale.
const FAZE = [
  {
    nume: 'Înainte: cine concurează',
    accent: 'border-l-sky-400 bg-sky-50/70',
    punct: 'bg-sky-400',
    file: [
      ['Centralizator', 'Tabloul mare: cluburile pe rânduri, categoriile pe coloane. De aici înscrii sportivii, celulă cu celulă, și vezi câți participanți are fiecare categorie.'],
      ['Tehnica', 'Câte un cartonaș pentru fiecare probă tehnică — grupă, probă, gen — cu cine e înscris. Echipele de Sincron tot de aici se adaugă.'],
      ['Lupta', 'Toți sportivii înscriși la luptă, cu greutatea de la cântar, categoria sugerată și cea aleasă.'],
    ],
  },
  {
    nume: 'Apoi: cum se desfășoară',
    accent: 'border-l-amber-400 bg-amber-50/70',
    punct: 'bg-amber-400',
    file: [
      ['Piramide', 'Arborele fiecărei categorii de luptă. Se tipărește sau se scoate în Excel.'],
      ['Programare', 'Câte terenuri sunt și ce categorie intră pe fiecare, cu ora de start și durata. Poate muta categoriile și asigna arbitrii automat.'],
      ['Arbitri', 'Cine e în sală și pe ce rol delegat, plus foaia de delegare în PDF. Alocarea pe probe se face în Programare, nu aici.'],
    ],
  },
  {
    nume: 'În timpul zilei și la final',
    accent: 'border-l-emerald-400 bg-emerald-50/70',
    punct: 'bg-emerald-400',
    file: [
      ['Live', 'Ce se întâmplă pe fiecare teren: probele în curs și cele finalizate.'],
      ['Clasament', 'Patru clasamente: tehnica, lupta, cluburi și sportivi înscriși.'],
      ['Diplome', 'Șabloanele de diplomă — locul 1, 2, 3 și participare — pentru solo, echipă și luptă.'],
    ],
  },
];


const PROBLEME = [
  ['Launcherul spune că nu găsește Docker', 'Docker Desktop nu e pornit. Deschide-l, așteaptă punctul verde.'],
  ['La autentificare apare „Metoda GET nu este permisă”', 'Lipsește https:// din adresa serverului.'],
  ['Prima pornire se oprește la descărcare', 'Internet prea slab. Fă prima pornire acasă, nu în sală.'],
  ['Tabletele nu se conectează la laptop', 'Ori sunt pe alt Wi-Fi, ori routerul izolează clienții. În ordinea asta.'],
  ['Un container e roșu sau repornește mereu', 'Apasă pe el în Docker → „Logs” și trimite ultimele rânduri persoanei tehnice.'],
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
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
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

/** Pasii nu stau in chenare - o cutie in jurul unui desen care are el
 * insusi chenarul ferestrei infatisate dadea trei rame una in alta. Ii
 * leaga in schimb o linie verticala prin numere, ca pe o cronologie: se
 * vede dintr-o privire ca sunt o insiruire, nu cinci lucruri separate. */
function Pas({ numar, titlu, durata, children, ultim }) {
  return (
    <div className="relative flex gap-4">
      {!ultim && (
        <span aria-hidden="true" className="absolute bottom-0 left-4 top-9 -ml-px w-0.5 bg-border" />
      )}
      <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-red text-sm font-bold text-white ring-4 ring-background">
        {numar}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-lg font-bold">{titlu}</h3>
          {durata && <Badge variant="secondary">{durata}</Badge>}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Desenele n-au rama proprie: fiecare poarta deja, inauntru, chenarul
 * ferestrei pe care o infatiseaza, iar doua rame concentrice nu spun nimic
 * in plus.
 *
 * Latimea minima plus derularea pe orizontala sunt pentru telefon: sub ea,
 * scrisul din ferestrele desenate ajunge de cinci pixeli si desenul nu mai
 * ajuta cu nimic. Mai bine il tragi intr-o parte decat sa te uiti la el. */
function Desen({ children, nota }) {
  return (
    <figure className="m-0 flex flex-col gap-1.5">
      <div className="overflow-x-auto">
        <div className="min-w-[460px]">{children}</div>
      </div>
      {nota && <figcaption className="text-xs text-muted-foreground">{nota}</figcaption>}
    </figure>
  );
}

/** Alertele neutre erau tot niste cutii cu chenar. Ce aveau de spus se
 * spune la fel de bine cu semnul si textul, fara rama; culoarea a ramas
 * doar unde chiar avertizeaza (Alert variant="destructive"). */
function Nota({ children }) {
  return (
    <div className="flex gap-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div>{children}</div>
    </div>
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
    <div className="flex max-w-4xl flex-col gap-8">
      <h1 className="font-display text-2xl font-bold">Competiție LAN — instalare</h1>

      <section className="flex flex-col gap-2">
        <HartaZilei />
        <p className="text-xs text-muted-foreground">
          Ghidul de mai jos acoperă pasul 1, instalarea. Pașii 2–4 se fac din aplicație,
          la fiecare competiție.
        </p>
      </section>

      <Alert variant="warning">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <strong className="font-semibold">Fă asta cu o săptămână înainte, nu în dimineața competiției.</strong>
          {' '}Se descarcă vreun gigabyte, iar în sală s-ar putea să nu ai internet bun.
        </div>
      </Alert>

      <section className="flex flex-col gap-3">
        <h2 className="border-b border-border pb-2 font-display text-xl font-bold">Ai nevoie de</h2>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {NECESARE.map(({ icon: Icon, titlu, ce }) => (
            <div key={titlu} className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-semibold">{titlu}</p>
                <p className="text-sm text-muted-foreground">{ce}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Se instalează două programe, atât: Docker Desktop și aplicația federației.
        </p>
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

      <section className="flex flex-col gap-8">
        <h2 className="border-b border-border pb-2 font-display text-xl font-bold">Instalarea, pas cu pas</h2>

        <Pas numar={1} titlu="Instalează Docker Desktop" durata="~15 minute">
          <p className="text-sm text-muted-foreground">
            Docker ține baza de date și aplicația competiției, fiecare în
            &bdquo;cutia&rdquo; ei, fără să încurce nimic altceva de pe laptop.
          </p>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
            <li>
              Descarcă-l de pe <a href="https://www.docker.com/products/docker-desktop/" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-red underline">docker.com</a>.
            </li>
            {eMac ? (
              <li>
                Alege <strong>Apple Silicon</strong> (Mac din 2020 încoace) sau <strong>Intel</strong>.
                Meniul Apple → &bdquo;Despre acest Mac&rdquo; îți spune care e.
              </li>
            ) : (
              <li>Lasă bifată opțiunea <strong>WSL 2</strong>. Dacă cere o repornire, fă-o acum.</li>
            )}
            <li>
              {eMac
                ? 'Trage iconița peste folderul Applications și pornește-l.'
                : 'Treci prin instalare până la final și pornește-l.'}
            </li>
            <li>Prima dată cere parola calculatorului și acceptarea condițiilor.</li>
          </ol>
          <Desen>
            <DockerPornit />
          </Desen>
          <Verifica>punctul verde din desen. Cât se mișcă balena, Docker încă pornește.</Verifica>
          <Alert variant="destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              Settings → General → &bdquo;Start Docker Desktop when you sign in&rdquo;. Altfel, un
              restart în ziua competiției nu mai pornește nimic singur.
            </div>
          </Alert>
        </Pas>

        <Pas numar={2} titlu="Descarcă aplicația federației" durata="~2 minute">
          <p className="text-sm text-muted-foreground">
            De aici se conduce toată ziua: aduci competiția, pornești sala, trimiți
            rezultatele înapoi.
          </p>
          <Descarcari sistem={sistem} />
          <div className="flex gap-3 text-sm">
            <Download className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              {eMac ? (
                <>
                  <strong className="font-semibold">Versiunile următoare:</strong> aplicația îți
                  spune când apare una nouă și îți deschide pagina de descarcare. Pe Mac o tragi
                  din nou peste Applications — automat nu se poate fără un certificat Apple.
                </>
              ) : (
                <>
                  <strong className="font-semibold">Versiunile următoare:</strong> aplicația le
                  descarcă singură și te întreabă când vrei să repornești. În mijlocul unei
                  competiții alegi &bdquo;Mai târziu&rdquo; și nu se întrerupe nimic.
                </>
              )}
            </div>
          </div>
        </Pas>

        <Pas numar={3} titlu="Deschide-o prima dată" durata="~5 minute">
          <Nota>
            <strong className="font-semibold">Calculatorul o să te avertizeze. E normal.</strong>{' '}
            Aplicația nu are certificat plătit de la {eMac ? 'Apple' : 'Microsoft'}, iar sistemul
            nu recunoaște cine a făcut-o. Se face <strong>o singură dată</strong>.
          </Nota>
          <Desen nota={eMac
            ? 'Clic dreapta pe aplicație, nu dublu-clic — altfel nu te lasă deloc.'
            : 'Întâi „More info”, apoi butonul alb care apare dedesubt.'}>
            {eMac ? <DeschidereMac /> : <DeschidereWindows />}
          </Desen>
          {eMac ? (
            <>
              <p className="text-sm">
                Deschizi <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.dmg</code>-ul,
                tragi aplicația peste Applications, apoi o deschizi ca în desen.
              </p>
              <p className="text-sm text-muted-foreground">
                Dacă scrie că aplicația <em>&bdquo;este deteriorată și nu poate fi deschisă&rdquo;</em>,
                rulează o singură dată în Terminal:
              </p>
              <Comanda>xattr -dr com.apple.quarantine &quot;/Applications/FRVV Competition Launcher.app&quot;</Comanda>
            </>
          ) : (
            <p className="text-sm">
              Dublu-clic pe <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.exe</code>-ul
              descărcat, treci de ecranul albastru ca în desen, apoi mergi prin instalare până la
              final și lasă bifată scurtătura de pe desktop.
            </p>
          )}
          <Verifica>
            o fereastră cu sigla federației, care cere adresa serverului — scrisă cu{' '}
            <code className="font-mono">https://</code> în față — și datele tale.
          </Verifica>
        </Pas>

        <Pas numar={4} titlu="Prima pornire a sălii" durata="~20 minute, o singură dată">
          <p className="text-sm text-muted-foreground">
            Te autentifici, alegi competiția și apeși pornirea. Acum se descarcă tot ce
            trebuie — de asta durează. Data viitoare pornește în sub un minut, fără internet.
          </p>
          <Desen nota="Adresa din mijloc e cea pe care o tastezi pe tablete și pe ecran.">
            <LauncherPornit />
          </Desen>
          <Verifica>în Docker, patru rânduri pornite — exact cele de mai jos.</Verifica>
        </Pas>

        <Pas numar={5} titlu="Pregătește rețeaua sălii" durata="~10 minute" ultim>
          <Desen>
            <RouterIzolare />
          </Desen>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
            <li>Router propriu evenimentului, cu nume și parolă ale lui. Internet pe el: opțional.</li>
            <li>Oprește &bdquo;client isolation&rdquo; (sau &bdquo;AP isolation&rdquo;), dacă routerul o are.</li>
            <li><strong>Toate</strong> dispozitivele pe acest Wi-Fi — laptop, tablete, ecrane.</li>
          </ul>
          <Verifica>adresa laptopului, afișată mare în launcher după pornire.</Verifica>
        </Pas>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="border-b border-border pb-2 font-display text-xl font-bold">Ce trebuie să vezi în Docker</h2>
        <p className="text-sm text-muted-foreground">
          Docker Desktop → secțiunea <strong>Containers</strong>. Dacă un rând lipsește sau e
          roșu, competiția nu merge.
        </p>
        <Desen>
          <ContainereDocker />
        </Desen>

        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {CONTAINERE.map(({ nume, icon: Icon, titlu, ce, semn }) => (
            <div key={nume} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Icon className="h-4 w-4" />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <code className="font-mono text-sm font-bold">{nume}</code>
                  <span className="text-xs text-muted-foreground">{titlu}</span>
                </div>
                <p className="text-sm text-muted-foreground">{ce}</p>
                <Badge variant="secondary" className="w-fit font-mono text-xs">{semn}</Badge>
              </div>
            </div>
          ))}
        </div>

        <h3 className="mt-2 font-display text-lg font-bold">Volumele (unde stau datele)</h3>
        <div className="flex flex-col gap-3">
          {VOLUME.map(({ nume, icon: Icon, ce }) => (
            <div key={nume} className="flex items-center gap-3">
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <code className="font-mono text-sm font-bold">{nume}</code>
              <span className="text-sm text-muted-foreground">{ce}</span>
            </div>
          ))}
        </div>
        <Alert variant="destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            Containerele se pot opri și reporni fără pierderi, fiindcă datele stau aici.
            <strong> Nu șterge niciodată nimic din Volumes în ziua competiției.</strong>
          </div>
        </Alert>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="border-b border-border pb-2 font-display text-xl font-bold">Adresele din sală</h2>
        <p className="text-sm text-muted-foreground">
          Pe fiecare dispozitiv se deschide browserul și se scrie adresa laptopului, urmată de
          două puncte și port. Launcherul le afișează gata scrise — de acolo e mai sigur să le iei.
        </p>
        <div className="grid gap-6 sm:grid-cols-3">
          {ADRESE.map(({ icon: Icon, ce, port, cine }) => (
            <div key={port} className="flex flex-col items-start gap-2">
              <Icon />
              <p className="font-semibold">{ce}</p>
              <code className="break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                {`http://<adresa-laptopului>:${port}`}
              </code>
              <p className="text-xs text-muted-foreground">{cine}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="border-b border-border pb-2 font-display text-xl font-bold">Panoul Competiție — ce vei găsi acolo</h2>
        <p className="text-sm text-muted-foreground">
          E aplicația de pe portul 5191, deschisă pe laptopul central. Ocupă tot ecranul:
          sus numele competiției, jos o bară cu file. Fiecare filă e o bucată din zi.
        </p>
        <Desen nota="Fila deschisă e cea aprinsă. Bara se trage lateral când nu încap toate.">
          <PanouCompetitie />
        </Desen>
        {FAZE.map(({ nume, accent, punct, file }) => (
          <div key={nume} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${punct}`} />
              <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{nume}</h3>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {file.map(([numeFila, ce]) => (
                <div key={numeFila} className={`rounded-md border-l-4 px-3 py-2 ${accent}`}>
                  <p className="text-sm font-semibold">{numeFila}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{ce}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
        <Nota>
          În dreapta barei e un <strong className="font-semibold">lacăt</strong>: închis, nimeni nu
          mai poate modifica din greșeală. Sus, în dreapta, sunt legăturile
          <strong className="font-semibold"> Ecran TEREN 1</strong> și
          <strong className="font-semibold"> TEREN 2</strong> — de acolo deschizi ce se vede pe
          televizorul din sală.
        </Nota>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="border-b border-border pb-2 font-display text-xl font-bold">Când ceva nu merge</h2>
        <div className="flex flex-col gap-3 text-sm">
          {PROBLEME.map(([simptom, rezolvare]) => (
            <div key={simptom} className="flex gap-3 rounded-md border-l-4 border-l-red-300 bg-red-50/60 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <div>
                <p className="font-semibold">{simptom}</p>
                <p className="text-muted-foreground">{rezolvare}</p>
              </div>
            </div>
          ))}
          <div className="flex gap-3">
            <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-muted-foreground">
              Datele nu se pierd dacă se oprește ceva: baza de date are copii din 15 în 15
              minute, iar laptopul repornit le aduce înapoi singur. Chiar și o pană de curent
              costă, în cel mai rău caz, ultimele 15 minute de lucru.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
