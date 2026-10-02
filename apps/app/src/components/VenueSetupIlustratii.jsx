/**
 * Ilustratiile din ghidul de instalare a laptopului din sala (VenueSetupPage).
 *
 * Sunt desene, nu capturi de ecran, si asta e intentionat: cel care
 * pregateste laptopul nu trebuie sa se intrebe daca versiunea lui de Docker
 * sau de Windows arata altfel decat in poza. Fiecare desen arata doar
 * lucrul dupa care se uita omul in acel pas - punctul verde, butonul pe
 * care apasa, randurile care trebuie sa fie acolo - si taie restul.
 *
 * De aceea textul din desene nu se repeta in pagina: testele paginii cauta
 * fiecare instructiune o singura data, iar un cititor care vede acelasi
 * lucru scris de doua ori incepe sa caute diferenta dintre ele.
 *
 * Culorile sunt cele ale aplicatiei (tailwind.config.js): navy #172642
 * pentru desen, rosu #da3b26 doar pentru ce trebuie privit, verde pentru
 * starile bune. Rosul nu se foloseste decoratiiv nicaieri aici.
 */

const NAVY = '#172642';
const GRI = '#5b6779';
const LINIE = '#d7dde8';
const LINIE_FINA = '#eef1f6';
const SUPRAFATA = '#f4f7fb';
const ECRAN = '#dde6f5';
const ROSU = '#da3b26';
const VERDE = '#16a34a';
const VERDE_TEXT = '#15803d';
const VERDE_FUNDAL = '#dcfce7';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/** Capul de sageata rosu, refolosit de desenele cu adnotari. Marker-ele
 * au nevoie de id unic in pagina, de unde prefixul primit ca parametru. */
function CapSageata({ id }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M0,0 L10,5 L0,10 z" fill={ROSU} />
      </marker>
    </defs>
  );
}

function Nor({ cx }) {
  return (
    <>
      <g fill="#e7eefb" stroke="#9db4dd" strokeWidth="1.5">
        <circle cx={cx - 23} cy="68" r="16" />
        <circle cx={cx} cy="60" r="22" />
        <circle cx={cx + 23} cy="70" r="15" />
        <rect x={cx - 38} y="70" width="84" height="16" rx="8" />
      </g>
      {/* Peste conturul interior al celor patru forme suprapuse, ca norul
          sa arate ca o singura forma, nu ca niste cercuri lipite. */}
      <rect x={cx - 36} y="71" width="80" height="13" fill="#e7eefb" />
    </>
  );
}

function LaptopMic({ x, y }) {
  return (
    <>
      <g fill={SUPRAFATA} stroke={NAVY} strokeWidth="1.8">
        <rect x={x} y={y} width="70" height="44" rx="5" />
        <polygon points={`${x - 6},${y + 46} ${x + 76},${y + 46} ${x + 82},${y + 54} ${x - 12},${y + 54}`} />
      </g>
      <rect x={x + 6} y={y + 6} width="58" height="32" rx="2" fill={ECRAN} />
    </>
  );
}

/**
 * Harta zilei: de unde vine competitia, unde se desfasoara, unde se intorc
 * rezultatele. E primul lucru din pagina fiindca fara ea pasii de instalare
 * sunt o lista de operatii fara rost vizibil.
 *
 * Trei desene separate, nu unul lat: pe telefon un desen lat de trei ori
 * cat ecranul isi face textul de cinci pixeli, iar asta e exact imaginea
 * care trebuia sa se inteleaga din prima. Asa, cele trei se aseaza unul
 * sub altul si raman la fel de citete. Fiecare viewBox decupeaza din
 * acelasi sistem de coordonate zona panoului lui, toate 210x206, ca sa
 * aiba aceeasi inaltime una langa alta.
 */
function PanouHarta({ numar, titlu, subtitlu, viewBox, eticheta, children }) {
  return (
    <div className="relative flex flex-col items-center gap-1 rounded-lg border border-border bg-card p-3 pt-4">
      <span className="absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-brand-red text-xs font-bold text-white">
        {numar}
      </span>
      <svg viewBox={viewBox} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={eticheta} className="h-auto w-full max-w-[220px]">
        {children}
      </svg>
      <p className="text-sm font-bold">{titlu}</p>
      <p className="text-xs text-muted-foreground">{subtitlu}</p>
    </div>
  );
}

export function HartaZilei() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <PanouHarta
        numar="1" titlu="Aduci competiția" subtitlu="o dată, cu internet" viewBox="22 20 210 206"
        eticheta="Competiția coboară din site pe laptopul din sală."
      >
        <CapSageata id="harta-sageata-1" />
        <Nor cx={127} />
        <text x="127" y="105" textAnchor="middle" fontSize="11" fill={GRI}>app.vovinam.ro</text>
        <line x1="127" y1="116" x2="127" y2="146" stroke={ROSU} strokeWidth="2.5" markerEnd="url(#harta-sageata-1)" />
        <LaptopMic x={92} y={152} />
      </PanouHarta>

      <PanouHarta
        numar="2" titlu="Toată ziua, local" subtitlu="fără internet" viewBox="271 8 210 206"
        eticheta="Laptopul, tabletele și ecranul, toate legate la routerul propriu al sălii."
      >
        <g fill="none" stroke={VERDE} strokeWidth="2.5" strokeLinecap="round">
          <path d="M368,56 a 12,12 0 0 1 24,0" />
          <path d="M360,48 a 20,20 0 0 1 40,0" />
          <path d="M352,40 a 28,28 0 0 1 56,0" />
        </g>
        <g fill={SUPRAFATA} stroke={NAVY} strokeWidth="1.8">
          <rect x="355" y="64" width="50" height="22" rx="5" />
          <line x1="364" y1="64" x2="358" y2="50" />
          <line x1="396" y1="64" x2="402" y2="50" />
        </g>
        <circle cx="368" cy="75" r="2.2" fill={VERDE} />
        <circle cx="378" cy="75" r="2.2" fill={VERDE} />
        <circle cx="388" cy="75" r="2.2" fill={LINIE} />
        <text x="380" y="104" textAnchor="middle" fontSize="10.5" fill={GRI}>Router Wi-Fi propriu</text>
        <g stroke="#9db4dd" strokeWidth="1.5" fill="none">
          <path d="M380,110 V 130" />
          <path d="M305,130 H 455" />
          <path d="M305,130 V 156" />
          <path d="M380,130 V 156" />
          <path d="M455,130 V 156" />
        </g>
        <g fill={SUPRAFATA} stroke={NAVY} strokeWidth="1.6">
          <rect x="282" y="156" width="46" height="28" rx="3" />
          <polygon points="277,186 333,186 337,192 273,192" />
          <rect x="366" y="156" width="28" height="40" rx="4" />
          <rect x="430" y="156" width="50" height="32" rx="3" />
          <polygon points="448,188 462,188 466,196 444,196" />
        </g>
        <rect x="286" y="159" width="38" height="22" fill={ECRAN} />
        <rect x="369" y="160" width="22" height="30" fill={ECRAN} />
        <rect x="433" y="159" width="44" height="26" fill={ECRAN} />
        <text x="305" y="208" textAnchor="middle" fontSize="9.5" fill={GRI}>Laptop</text>
        <text x="380" y="210" textAnchor="middle" fontSize="9.5" fill={GRI}>Tablete</text>
        <text x="455" y="210" textAnchor="middle" fontSize="9.5" fill={GRI}>Ecran</text>
      </PanouHarta>

      <PanouHarta
        numar="3" titlu="Trimiți rezultatele" subtitlu="la final, cu internet" viewBox="528 20 210 206"
        eticheta="Rezultatele urcă de pe laptop înapoi în site."
      >
        <CapSageata id="harta-sageata-3" />
        <Nor cx={633} />
        <text x="633" y="105" textAnchor="middle" fontSize="11" fill={GRI}>app.vovinam.ro</text>
        <line x1="633" y1="146" x2="633" y2="116" stroke={ROSU} strokeWidth="2.5" markerEnd="url(#harta-sageata-3)" />
        <LaptopMic x={598} y={152} />
      </PanouHarta>
    </div>
  );
}

/** Dupa instalarea Docker-ului, singurul lucru la care se uita omul e
 * punctul din coltul de jos. Restul ferestrei e desenat sters tocmai ca sa
 * nu-l invite sa caute si acolo. */
export function DockerPornit() {
  return (
    <svg viewBox="0 0 620 300" xmlns="http://www.w3.org/2000/svg" role="img" className="h-auto w-full"
      aria-label="Fereastra Docker Desktop, cu punctul verde și textul „Engine running” în colțul din stânga jos.">
      <CapSageata id="docker-sageata" />
      <rect x="10" y="10" width="440" height="280" rx="10" fill="#fff" stroke={LINIE} />
      <path d="M10,20 a10,10 0 0 1 10,-10 h420 a10,10 0 0 1 10,10 v24 h-440 z" fill={SUPRAFATA} />
      <line x1="10" y1="44" x2="450" y2="44" stroke={LINIE} />
      <circle cx="30" cy="27" r="5.5" fill="#ff5f57" />
      <circle cx="47" cy="27" r="5.5" fill="#febc2e" />
      <circle cx="64" cy="27" r="5.5" fill="#28c840" />
      <text x="84" y="32" fontSize="12" fontWeight="700" fill={NAVY}>Docker Desktop</text>
      <rect x="10" y="44" width="116" height="212" fill="#fafbfd" />
      <line x1="126" y1="44" x2="126" y2="256" stroke={LINIE} />
      <rect x="18" y="60" width="100" height="22" rx="5" fill="#e3edfd" />
      <text x="30" y="75" fontSize="11" fontWeight="700" fill={NAVY}>Containers</text>
      <text x="30" y="103" fontSize="11" fill={GRI}>Images</text>
      <text x="30" y="127" fontSize="11" fill={GRI}>Volumes</text>
      <g fill={LINIE_FINA}>
        <rect x="146" y="62" width="280" height="12" rx="6" />
        <rect x="146" y="86" width="230" height="12" rx="6" />
        <rect x="146" y="110" width="264" height="12" rx="6" />
        <rect x="146" y="134" width="190" height="12" rx="6" />
      </g>
      <line x1="10" y1="256" x2="450" y2="256" stroke={LINIE} />
      <circle cx="34" cy="273" r="5" fill={VERDE} />
      <text x="48" y="277" fontSize="12" fontWeight="700" fill={VERDE_TEXT}>Engine running</text>
      <rect x="18" y="260" width="146" height="26" rx="6" fill="none" stroke={ROSU} strokeWidth="2" />
      <path d="M470,250 C 400,250 260,258 176,272" fill="none" stroke={ROSU} strokeWidth="1.6"
        strokeDasharray="4 4" markerEnd="url(#docker-sageata)" />
      <text x="476" y="238" fontSize="11" fill={GRI}>Jos în stânga:</text>
      <text x="476" y="254" fontSize="12" fontWeight="700" fill={ROSU}>punct verde</text>
    </svg>
  );
}

/** Pe Mac, pasul la care se blocheaza toata lumea: dublu-clic nu merge, si
 * sistemul nu spune ce sa faci in loc. Desenul arata exact meniul si exact
 * butonul din fereastra care urmeaza. */
export function DeschidereMac() {
  return (
    <svg viewBox="0 0 620 300" xmlns="http://www.w3.org/2000/svg" role="img" className="h-auto w-full"
      aria-label="Meniul deschis cu butonul drept al mouse-ului, cu „Deschide” selectat, și fereastra de confirmare care urmează, unde se apasă tot „Deschide”.">
      <circle cx="32" cy="24" r="13" fill={ROSU} />
      <text x="32" y="29" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">1</text>
      <text x="54" y="29" fontSize="11.5" fontWeight="700" fill={GRI}>Nu dublu-clic</text>
      <rect x="20" y="48" width="250" height="214" rx="10" fill="#fff" stroke={LINIE} />
      <rect x="44" y="68" width="40" height="40" rx="9" fill={NAVY} />
      <text x="64" y="94" textAnchor="middle" fontSize="15" fontWeight="700" fill="#edb654">V</text>
      <text x="96" y="84" fontSize="11" fontWeight="700" fill={NAVY}>FRVV Competition</text>
      <text x="96" y="99" fontSize="11" fontWeight="700" fill={NAVY}>Launcher</text>
      <rect x="44" y="122" width="190" height="122" rx="8" fill="#fff" stroke="#c6cedb" />
      <rect x="48" y="126" width="182" height="24" rx="5" fill="#2563eb" />
      <text x="60" y="142" fontSize="11.5" fontWeight="700" fill="#fff">Deschide</text>
      <text x="60" y="170" fontSize="11.5" fill={GRI}>Afișează informații</text>
      <text x="60" y="194" fontSize="11.5" fill={GRI}>Mută în Coș</text>
      <line x1="52" y1="208" x2="226" y2="208" stroke="#e3e8f0" />
      <text x="60" y="230" fontSize="11.5" fill={GRI}>Duplichează</text>

      <circle cx="342" cy="24" r="13" fill={ROSU} />
      <text x="342" y="29" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">2</text>
      <text x="364" y="29" fontSize="11.5" fontWeight="700" fill={GRI}>O singură dată, prima dată</text>
      <rect x="330" y="48" width="270" height="196" rx="12" fill="#fff" stroke="#c6cedb" />
      <circle cx="465" cy="90" r="22" fill="#fef3c7" />
      <path d="M465,79 v 13" stroke="#b45309" strokeWidth="3" strokeLinecap="round" />
      <circle cx="465" cy="100" r="2" fill="#b45309" />
      <text x="465" y="134" textAnchor="middle" fontSize="11.5" fontWeight="700" fill={NAVY}>„FRVV Competition Launcher”</text>
      <text x="465" y="150" textAnchor="middle" fontSize="11.5" fontWeight="700" fill={NAVY}>a fost descărcată de pe internet.</text>
      <text x="465" y="172" textAnchor="middle" fontSize="11" fill={GRI}>Sigur vrei s-o deschizi?</text>
      <rect x="368" y="198" width="90" height="28" rx="7" fill="#f1f4f9" stroke={LINIE} />
      <text x="413" y="216" textAnchor="middle" fontSize="11.5" fill={GRI}>Anulează</text>
      <rect x="472" y="198" width="90" height="28" rx="7" fill="#2563eb" />
      <text x="517" y="216" textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#fff">Deschide</text>
      <rect x="467" y="193" width="100" height="38" rx="10" fill="none" stroke={ROSU} strokeWidth="2" />
    </svg>
  );
}

/** Pe Windows ecranul albastru pare o interdictie: butonul care te lasa sa
 * continui nici nu e pe ecran pana nu apesi "More info". De asta sunt
 * numerotate, in ordinea in care apar. */
export function DeschidereWindows() {
  return (
    <svg viewBox="0 0 620 280" xmlns="http://www.w3.org/2000/svg" role="img" className="h-auto w-full"
      aria-label="Ecranul albastru „Windows protected your PC”: întâi se apasă „More info”, apoi butonul „Run anyway” care apare dedesubt.">
      <rect x="110" y="14" width="400" height="250" rx="8" fill="#004e8c" />
      <text x="140" y="62" fontSize="17" fontWeight="700" fill="#fff">Windows protected your PC</text>
      <text x="140" y="92" fontSize="11.5" fill="#cfe2f3">Microsoft Defender SmartScreen a oprit pornirea</text>
      <text x="140" y="110" fontSize="11.5" fill="#cfe2f3">unei aplicații nerecunoscute.</text>
      <text x="140" y="146" fontSize="12.5" fontWeight="700" fill="#fff">More info</text>
      <line x1="140" y1="150" x2="196" y2="150" stroke="#fff" strokeWidth="1.2" />
      <circle cx="213" cy="141" r="12" fill={ROSU} />
      <text x="213" y="146" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">1</text>
      <rect x="140" y="190" width="112" height="34" rx="4" fill="#fff" />
      <text x="196" y="212" textAnchor="middle" fontSize="12.5" fontWeight="700" fill="#004e8c">Run anyway</text>
      <rect x="280" y="190" width="112" height="34" rx="4" fill="none" stroke="#9db4dd" />
      <text x="336" y="212" textAnchor="middle" fontSize="12.5" fill="#cfe2f3">Don&apos;t run</text>
      {/* Pe coltul butonului alb, nu intre butoane: intre ele, numarul pare
          sa-l numeasca pe cel gresit - exact pe cel pe care nu trebuie apasat. */}
      <circle cx="252" cy="190" r="12" fill={ROSU} />
      <text x="252" y="195" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">2</text>
      <text x="310" y="248" textAnchor="middle" fontSize="11" fill="#cfe2f3">Butonul alb apare abia după pasul 1.</text>
    </svg>
  );
}

/** Lista pe care o deschide omul in Docker ca sa stie daca sala e in
 * regula. Important e tiparul - patru randuri, toate verzi - nu numerele. */
export function ContainereDocker() {
  const randuri = [
    { nume: 'db', ce: 'baza de date', stare: 'healthy', port: '5432' },
    { nume: 'backend', ce: 'aplicația', stare: 'running', port: '8000' },
    { nume: 'frontends', ce: 'cele trei ecrane', stare: 'running', port: '5191 · 5176 · 5177' },
    { nume: 'backup-scheduler', ce: 'salvările automate', stare: 'running', port: '—' },
  ];

  return (
    <svg viewBox="0 0 620 290" xmlns="http://www.w3.org/2000/svg" role="img" className="h-auto w-full"
      aria-label="Lista Containers din Docker, cu patru rânduri pornite: db, backend, frontends și backup-scheduler.">
      <rect x="10" y="10" width="600" height="270" rx="10" fill="#fff" stroke={LINIE} />
      <text x="30" y="40" fontSize="14" fontWeight="700" fill={NAVY}>Containers</text>
      <text x="48" y="64" fontSize="9.5" fontWeight="700" fill={GRI} letterSpacing="0.08em">NUME</text>
      <text x="330" y="64" fontSize="9.5" fontWeight="700" fill={GRI} letterSpacing="0.08em">STARE</text>
      <text x="470" y="64" fontSize="9.5" fontWeight="700" fill={GRI} letterSpacing="0.08em">PORT</text>
      <line x1="24" y1="72" x2="596" y2="72" stroke="#e3e8f0" />

      {randuri.map(({ nume, ce, stare, port }, i) => {
        const y = 95 + i * 44;
        return (
          <g key={nume}>
            <circle cx="34" cy={y} r="5" fill={VERDE} />
            <text x="48" y={y - 3} fontSize="11.5" fontWeight="700" fill={NAVY} fontFamily={MONO}>{nume}</text>
            <text x="48" y={y + 11} fontSize="9.5" fill={GRI}>{ce}</text>
            <rect x="322" y={y - 10} width="74" height="20" rx="10" fill={VERDE_FUNDAL} />
            <text x="359" y={y + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill={VERDE_TEXT}>{stare}</text>
            <text x="470" y={y + 4} fontSize="10.5" fill={GRI}>{port}</text>
            {i < randuri.length - 1 && <line x1="24" y1={y + 21} x2="596" y2={y + 21} stroke={LINIE_FINA} />}
          </g>
        );
      })}

      <rect x="24" y="252" width="320" height="22" rx="6" fill="#f0fdf4" />
      <text x="36" y="267" fontSize="11" fontWeight="700" fill={VERDE_TEXT}>Patru rânduri, toate verzi = sala funcționează.</text>
    </svg>
  );
}

/** Singura setare de router care face ca totul sa para pornit si sa nu
 * mearga nimic. Desenata ca un ecran de setari, fiindca asa o cauta omul -
 * nu stie cum se numeste la el in router, dar recunoaste randul. */
export function RouterIzolare() {
  return (
    <svg viewBox="0 0 620 240" xmlns="http://www.w3.org/2000/svg" role="img" className="h-auto w-full"
      aria-label="Setările wireless ale routerului: rețeaua se numește FRVV-EVENT, iar comutatorul „Client isolation” este oprit.">
      <rect x="10" y="10" width="600" height="220" rx="10" fill="#fff" stroke={LINIE} />
      <path d="M10,20 a10,10 0 0 1 10,-10 h580 a10,10 0 0 1 10,10 v24 h-600 z" fill={SUPRAFATA} />
      <line x1="10" y1="44" x2="610" y2="44" stroke={LINIE} />
      <text x="30" y="32" fontSize="12" fontWeight="700" fill={NAVY}>Setările routerului · Wireless</text>

      <text x="34" y="80" fontSize="11.5" fill={GRI}>Nume rețea (SSID)</text>
      <text x="300" y="80" fontSize="11.5" fontWeight="700" fill={NAVY} fontFamily={MONO}>FRVV-EVENT</text>
      <line x1="24" y1="96" x2="596" y2="96" stroke={LINIE_FINA} />

      <text x="34" y="124" fontSize="11.5" fill={GRI}>Parolă</text>
      <text x="300" y="124" fontSize="11.5" fontWeight="700" fill={NAVY}>••••••••</text>
      <line x1="24" y1="140" x2="596" y2="140" stroke={LINIE_FINA} />

      <rect x="24" y="150" width="572" height="46" rx="8" fill="#fef2f2" />
      <text x="34" y="171" fontSize="11.5" fontWeight="700" fill={NAVY}>Client isolation</text>
      <text x="34" y="186" fontSize="9.5" fill={GRI}>(uneori „AP isolation”)</text>
      <rect x="300" y="162" width="46" height="24" rx="12" fill="#e2e8f0" stroke="#c6cedb" />
      <circle cx="313" cy="174" r="9" fill="#fff" stroke="#c6cedb" />
      <text x="358" y="178" fontSize="11.5" fontWeight="700" fill={ROSU}>OFF — trebuie oprit</text>
      <rect x="24" y="150" width="572" height="46" rx="8" fill="none" stroke={ROSU} strokeWidth="2" />
      <text x="34" y="218" fontSize="11" fill={GRI}>Pornit, tabletele nu văd laptopul — deși totul pare în regulă.</text>
    </svg>
  );
}

/** Ecranul launcherului dupa ce sala a pornit. Numarul mare din mijloc e
 * tot ce trebuie sa citeasca omul de acolo. */
export function LauncherPornit() {
  const aplicatii = ['Panou Competiție (admin)', 'Aplicație Arbitri', 'Ecran Public'];

  return (
    <svg viewBox="0 0 620 300" xmlns="http://www.w3.org/2000/svg" role="img" className="h-auto w-full"
      aria-label="Fereastra launcherului după pornire: adresa laptopului afișată mare în mijloc și cele trei aplicații, fiecare cu bulină verde și buton Deschide.">
      <CapSageata id="launcher-sageata" />
      <rect x="10" y="10" width="440" height="280" rx="10" fill="#fff" stroke={LINIE} />
      <path d="M10,20 a10,10 0 0 1 10,-10 h420 a10,10 0 0 1 10,10 v24 h-440 z" fill={SUPRAFATA} />
      <line x1="10" y1="44" x2="450" y2="44" stroke={LINIE} />
      <circle cx="30" cy="27" r="5.5" fill="#ff5f57" />
      <circle cx="47" cy="27" r="5.5" fill="#febc2e" />
      <circle cx="64" cy="27" r="5.5" fill="#28c840" />
      <text x="84" y="32" fontSize="12" fontWeight="700" fill={NAVY}>FRVV Competition Launcher</text>

      <text x="230" y="72" textAnchor="middle" fontSize="13" fontWeight="700" fill={NAVY}>Cupa României 2026</text>
      <text x="230" y="90" textAnchor="middle" fontSize="10.5" fill={GRI}>Stiva locală rulează.</text>
      <rect x="126" y="104" width="208" height="42" rx="9" fill="none" stroke={ROSU} strokeWidth="2" />
      <text x="230" y="136" textAnchor="middle" fontSize="27" fontWeight="700" fill={NAVY} fontFamily={MONO}>192.168.1.50</text>
      <path d="M470,126 L 344,126" fill="none" stroke={ROSU} strokeWidth="1.6" strokeDasharray="4 4"
        markerEnd="url(#launcher-sageata)" />
      <text x="476" y="118" fontSize="11" fill={GRI}>adresa laptopului</text>
      <text x="476" y="134" fontSize="11" fontWeight="700" fill={ROSU}>o tastezi pe tablete</text>

      {aplicatii.map((nume, i) => {
        const y = 166 + i * 38;
        return (
          <g key={nume}>
            <rect x="40" y={y} width="380" height="30" rx="7" fill="#fafbfd" stroke="#e3e8f0" />
            <circle cx="56" cy={y + 15} r="4.5" fill={VERDE} />
            <text x="70" y={y + 19} fontSize="10.5" fill={NAVY}>{nume}</text>
            <rect x="336" y={y + 6} width="74" height="18" rx="5" fill={NAVY} />
            <text x="373" y={y + 19} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#fff">Deschide</text>
          </g>
        );
      })}
    </svg>
  );
}

/* Dispozitivele din sala, desenate mare, pentru lista de adrese: acolo
   omul cauta intai "pe care aparat", si abia apoi citeste adresa. */

export function IconLaptop() {
  return (
    <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-16 w-auto">
      <g fill={SUPRAFATA} stroke={NAVY} strokeWidth="2">
        <rect x="22" y="6" width="76" height="50" rx="5" />
        <polygon points="14,58 106,58 114,70 6,70" />
      </g>
      <rect x="28" y="12" width="64" height="38" fill={ECRAN} />
    </svg>
  );
}

export function IconTableta() {
  return (
    <svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-16 w-auto">
      <rect x="8" y="4" width="44" height="72" rx="7" fill={SUPRAFATA} stroke={NAVY} strokeWidth="2" />
      <rect x="13" y="12" width="34" height="52" fill={ECRAN} />
      <circle cx="30" cy="70" r="2.5" fill={NAVY} />
    </svg>
  );
}

export function IconEcran() {
  return (
    <svg viewBox="0 0 110 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-16 w-auto">
      <g fill={SUPRAFATA} stroke={NAVY} strokeWidth="2">
        <rect x="6" y="4" width="98" height="58" rx="4" />
        <polygon points="43,62 67,62 73,74 37,74" />
      </g>
      <rect x="12" y="10" width="86" height="46" fill={ECRAN} />
      <line x1="31" y1="74" x2="79" y2="74" stroke={NAVY} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
