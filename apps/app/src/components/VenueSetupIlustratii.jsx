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
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* Pasul care lipsea: pagina asta e chiar despre el, dar harta
          incepea de la ce se intampla dupa. Si e singurul care se face o
          data - de aceea subtitlurile spun cadenta fiecaruia, altfel cele
          patru par ca se repeta toate la fel. */}
      <PanouHarta
        numar="1" titlu="Instalezi programele" subtitlu="o singură dată" viewBox="0 0 210 206"
        eticheta="Cele două programe — Docker și aplicația federației — se instalează pe laptop."
      >
        <g fill="#e7eefb" stroke="#9db4dd" strokeWidth="1.5">
          <rect x="62" y="36" width="40" height="40" rx="9" />
        </g>
        <g fill="#9db4dd">
          <rect x="70" y="48" width="24" height="5" rx="2" />
          <rect x="70" y="56" width="24" height="5" rx="2" />
          <rect x="70" y="64" width="24" height="5" rx="2" />
        </g>
        <rect x="108" y="36" width="40" height="40" rx="9" fill="#e7eefb" stroke="#9db4dd" strokeWidth="1.5" />
        {/* Sigla reala, nu o litera: fisierul e acelasi pe care il serveste
            si componenta Logo din bara laterala (public/frvv-logo.png). */}
        <image href="/frvv-logo.png" x="112" y="40" width="32" height="32" preserveAspectRatio="xMidYMid meet" />
        <text x="82" y="88" textAnchor="middle" fontSize="8.5" fill={GRI}>Docker</text>
        <text x="128" y="88" textAnchor="middle" fontSize="8.5" fill={GRI}>Aplicația</text>
        <CapSageata id="harta-sageata-0" />
        <line x1="105" y1="98" x2="105" y2="128" stroke={ROSU} strokeWidth="2.5" markerEnd="url(#harta-sageata-0)" />
        <LaptopMic x={70} y={134} />
      </PanouHarta>

      <PanouHarta
        numar="2" titlu="Aduci competiția" subtitlu="înainte, cu internet" viewBox="22 20 210 206"
        eticheta="Competiția coboară din site pe laptopul din sală."
      >
        <CapSageata id="harta-sageata-1" />
        <Nor cx={127} />
        <text x="127" y="105" textAnchor="middle" fontSize="11" fill={GRI}>app.vovinam.ro</text>
        <line x1="127" y1="116" x2="127" y2="146" stroke={ROSU} strokeWidth="2.5" markerEnd="url(#harta-sageata-1)" />
        <LaptopMic x={92} y={152} />
      </PanouHarta>

      <PanouHarta
        numar="3" titlu="Toată ziua, local" subtitlu="fără internet" viewBox="271 8 210 206"
        eticheta="Laptopul central, laptopul de la teren, device-ul sau telefonul arbitrului și ecranul public, toate legate la routerul propriu al sălii."
      >
        {/* Antenele si undele, mutate cu 4 in sus fata de desenul cu trei
            aparate: al patrulea aparat are nevoie de randul de jos. */}
        <g fill="none" stroke={VERDE} strokeWidth="2.5" strokeLinecap="round">
          <path d="M368,52 a 12,12 0 0 1 24,0" />
          <path d="M360,44 a 20,20 0 0 1 40,0" />
          <path d="M352,36 a 28,28 0 0 1 56,0" />
        </g>
        <g fill={SUPRAFATA} stroke={NAVY} strokeWidth="1.8">
          <rect x="355" y="60" width="50" height="22" rx="5" />
          <line x1="364" y1="60" x2="358" y2="46" />
          <line x1="396" y1="60" x2="402" y2="46" />
        </g>
        <circle cx="368" cy="71" r="2.2" fill={VERDE} />
        <circle cx="378" cy="71" r="2.2" fill={VERDE} />
        <circle cx="388" cy="71" r="2.2" fill={LINIE} />
        <text x="380" y="100" textAnchor="middle" fontSize="10.5" fill={GRI}>Router Wi-Fi propriu</text>
        <g stroke="#9db4dd" strokeWidth="1.5" fill="none">
          <path d="M380,106 V 124" />
          <path d="M305,124 H 455" />
          <path d="M305,124 V 146" />
          <path d="M355,124 V 146" />
          <path d="M405,124 V 144" />
          <path d="M455,124 V 146" />
        </g>
        <g fill={SUPRAFATA} stroke={NAVY} strokeWidth="1.6">
          {/* laptopul central */}
          <rect x="288" y="146" width="34" height="24" rx="3" />
          <polygon points="284,172 326,172 329,177 281,177" />
          {/* laptopul de la teren */}
          <rect x="338" y="146" width="34" height="24" rx="3" />
          <polygon points="334,172 376,172 379,177 331,177" />
          {/* device-ul sau telefonul arbitrului */}
          <rect x="395" y="144" width="20" height="34" rx="4" />
          {/* ecranul public */}
          <rect x="432" y="146" width="46" height="26" rx="3" />
          <polygon points="448,172 462,172 465,178 445,178" />
        </g>
        <rect x="291" y="149" width="28" height="18" fill={ECRAN} />
        <rect x="341" y="149" width="28" height="18" fill={ECRAN} />
        <rect x="398" y="148" width="14" height="24" fill={ECRAN} />
        <circle cx="405" cy="174.5" r="1.3" fill={NAVY} />
        <rect x="435" y="149" width="40" height="20" fill={ECRAN} />
        <line x1="441" y1="178" x2="469" y2="178" stroke={NAVY} strokeWidth="1.6" strokeLinecap="round" />
        <g textAnchor="middle" fontSize="7.5" fill={GRI}>
          <text x="305" y="190">Laptop</text>
          <text x="305" y="199">central</text>
          <text x="355" y="190">Laptop</text>
          <text x="355" y="199">teren</text>
          <text x="405" y="190">Device/telefon</text>
          <text x="405" y="199">arbitru</text>
          <text x="455" y="190">Ecran/TV</text>
          <text x="455" y="199">public</text>
        </g>
      </PanouHarta>

      <PanouHarta
        numar="4" titlu="Trimiți rezultatele" subtitlu="la final, cu internet" viewBox="528 20 210 206"
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
      <rect x="44" y="68" width="40" height="40" rx="9" fill="#e7eefb" stroke="#9db4dd" strokeWidth="1.5" />
      <image href="/frvv-logo.png" x="48" y="72" width="32" height="32" preserveAspectRatio="xMidYMid meet" />
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

/** Ecranul Panoului Competitie, cel de pe :5191.
 *
 * Nu explica filele - alea sunt scrise langa, in pagina. Desenul are un
 * singur rol: sa recunoasca omul ecranul cand il deschide, si mai ales
 * bara de jos, fiindca acolo se trece de la o bucata a zilei la alta si
 * nu seamana cu un meniu obisnuit.
 *
 * Etichetele si ordinea sunt cele din apps/competition-admin
 * (CategoriesLayout.jsx); daca se schimba acolo, se schimba si aici.
 */
const FILE_PANOU = [
  'CENTRALIZATOR', 'TEHNICA', 'LUPTA', 'PIRAMIDE', 'PROGRAMARE',
  'ARBITRI', 'LIVE', 'CLASAMENT', 'DIPLOME',
];

export function PanouCompetitie() {
  // Chip-urile se asaza unul dupa altul, ca in bara reala. Latimea fiecaruia
  // se aproximeaza din numarul de litere - la majuscule de 6.5 iese destul
  // de exact, si oricum nimic nu depinde de precizie: daca ultimul ar iesi
  // din bara, asa face si in aplicatie, unde bara se deruleaza lateral.
  let x = 22;
  const chipuri = FILE_PANOU.map((eticheta) => {
    const latime = eticheta.length * 4.3 + 18;
    const chip = { eticheta, x, latime };
    x += latime + 4;
    return chip;
  });

  const coloane = [96, 156, 216, 276, 336, 396, 456, 516];

  return (
    <svg viewBox="0 0 620 300" xmlns="http://www.w3.org/2000/svg" role="img" className="h-auto w-full"
      aria-label="Panoul Competiție pe tot ecranul: sus numele competiției și legăturile către ecranele de teren, la mijloc tabloul cluburi–categorii, jos bara cu cele nouă file și lacătul.">
      <rect x="10" y="10" width="600" height="280" rx="10" fill="#fff" stroke={LINIE} />

      {/* bara de sus: sigla, numele competitiei, ecranele de teren */}
      <path d="M10,20 a10,10 0 0 1 10,-10 h580 a10,10 0 0 1 10,10 v22 h-600 z" fill={NAVY} />
      <rect x="10" y="42" width="600" height="2" fill="#edb654" />
      <image href="/frvv-logo.png" x="22" y="16" width="18" height="18" preserveAspectRatio="xMidYMid meet" />
      <text x="48" y="29" fontSize="9" fontWeight="700" fill="#fff" letterSpacing="0.02em">CAMPIONATUL NAȚIONAL — 30 MAI 2026</text>
      <text x="520" y="29" textAnchor="end" fontSize="7" fill="#c3cddf">Ecran TEREN 1</text>
      <text x="592" y="29" textAnchor="end" fontSize="7" fill="#c3cddf">Ecran TEREN 2</text>

      {/* bara de filtre si butoanele de export */}
      <text x="24" y="60" fontSize="7" fontWeight="700" fill={GRI} letterSpacing="0.06em">GRUPĂ</text>
      <rect x="54" y="50" width="72" height="14" rx="3" fill={SUPRAFATA} stroke={LINIE} />
      <text x="60" y="60" fontSize="6.5" fill={GRI}>Toate grupele</text>
      <rect x="462" y="50" width="82" height="14" rx="3" fill={SUPRAFATA} stroke={LINIE} />
      <text x="470" y="60" fontSize="6.5" fill={GRI}>Export (Excel)</text>
      <rect x="550" y="50" width="46" height="14" rx="3" fill={SUPRAFATA} stroke={LINIE} />
      <text x="558" y="60" fontSize="6.5" fill={GRI}>Setări</text>
      <line x1="10" y1="70" x2="610" y2="70" stroke="#e3e8f0" />

      {/* tabloul: cluburi pe randuri, categorii pe coloane */}
      <rect x="96" y="76" width="236" height="11" rx="2" fill="#fdf1dd" />
      <rect x="336" y="76" width="240" height="11" rx="2" fill="#fdf1dd" />
      <text x="100" y="85" fontSize="6" fontWeight="700" fill="#a97c2a">GRUPA 0</text>
      <text x="340" y="85" fontSize="6" fontWeight="700" fill="#a97c2a">GRUPA 1</text>
      <text x="24" y="99" fontSize="6.5" fontWeight="700" fill={GRI} letterSpacing="0.06em">CLUB</text>
      {coloane.map((cx) => <rect key={cx} x={cx} y={93} width="54" height="6" rx="3" fill={LINIE_FINA} />)}
      <line x1="20" y1="104" x2="600" y2="104" stroke="#e3e8f0" />
      <line x1="92" y1="76" x2="92" y2="236" stroke="#e3e8f0" />

      {[0, 1, 2, 3, 4].map((rand) => {
        const y = 110 + rand * 22;
        return (
          <g key={rand}>
            <rect x="24" y={y + 5} width="60" height="7" rx="3.5" fill={LINIE_FINA} />
            {coloane.map((cx, i) => (
              (rand + i) % 4 === 0
                ? <rect key={cx} x={cx} y={y + 3} width="54" height="11" rx="2" fill="#e7eefb" stroke="#c9d8f0" />
                : <rect key={cx} x={cx} y={y + 3} width="54" height="11" rx="2" fill="#f7f9fc" />
            ))}
            <line x1="20" y1={y + 19} x2="600" y2={y + 19} stroke="#f1f4f9" />
          </g>
        );
      })}
      <text x="24" y="229" fontSize="6.5" fill={GRI}>Nr. participanți</text>
      {coloane.map((cx, i) => (
        <text key={cx} x={cx + 27} y="229" textAnchor="middle" fontSize="6.5" fill={NAVY}>{i === 2 ? '1' : '0'}</text>
      ))}

      {/* bara de jos, cu filele */}
      <rect x="10" y="238" width="600" height="2" fill="#edb654" />
      <path d="M10,240 h600 v40 a10,10 0 0 1 -10,10 h-580 a10,10 0 0 1 -10,-10 z" fill={NAVY} />
      {chipuri.map(({ eticheta, x: cx, latime }, i) => (
        <g key={eticheta}>
          <rect x={cx} y={250} width={latime} height="20" rx="3"
            fill={i === 0 ? '#edb654' : 'none'} stroke={i === 0 ? '#edb654' : '#2c3f63'} />
          <text x={cx + latime / 2} y={264} textAnchor="middle" fontSize="6.5" fontWeight="700"
            letterSpacing="0.05em" fill={i === 0 ? NAVY : '#c3cddf'}>{eticheta}</text>
        </g>
      ))}
      <rect x="566" y="250" width="24" height="20" rx="3" fill="#fef3c7" stroke="#fcd34d" />
      <text x="578" y="265" textAnchor="middle" fontSize="11">🔒</text>
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
