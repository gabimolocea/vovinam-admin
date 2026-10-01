import { useEffect, useRef, useState } from 'react';
import BackLink from '../components/BackLink.jsx';

/**
 * Configurarea retelei pe device-urile Arbitru, prin cablul USB.
 *
 * De ce prin cablu si nu prin retea: device-ul are nevoie de Wi-Fi ca sa
 * ajunga la launcher, iar Wi-Fi-ul e exact ce-i lipseste. Singura cale care
 * nu depinde de retea e cablul - si el e oricum acolo, device-urile se leaga la
 * calculator ca sa fie programate.
 *
 * Numele retelei nu se scrie de mana: il cerem chiar device-ului, care
 * scaneaza cu radioul ei. Conteaza diferenta - device-ul prinde doar 2.4GHz,
 * deci o retea pe care laptopul o vede nu inseamna una la care ea se poate
 * conecta.
 */

const BAUD = 115200;

// Cat asteptam un raspuns de la device. Scanarea dureaza cateva secunde,
// restul comenzilor sunt instantanee.
const ASTEPTARE_SCAN_MS = 12000;
const ASTEPTARE_MS = 4000;

// Butoanele device-ului, în ordinea în care stau pe ea. Numele sunt cele pe
// care le trimite firmware-ul (`BUTON\t<nume>`), ca să nu fie nevoie de o
// traducere în două locuri.
// Ce poate face un buton. Codurile sunt cele pe care le înțelege firmware-ul
// (`r1` = roșu 1 punct), ca să nu existe o traducere în două locuri.
const ROLURI = [
  { cod: 'r1', eticheta: '+1 roșu' },
  { cod: 'r2', eticheta: '+2 roșu' },
  { cod: 'a1', eticheta: '+1 albastru' },
  { cod: 'a2', eticheta: '+2 albastru' },
];

function putereInCuvinte(rssi) {
  if (rssi >= -60) return 'semnal bun';
  if (rssi >= -72) return 'semnal slab';
  return 'semnal foarte slab';
}

export default function DeviceWifiPage({ onBack }) {
  const [port, setPort] = useState(null);
  const [retele, setRetele] = useState([]);
  const [ssid, setSsid] = useState('');
  const [parola, setParola] = useState('');
  const [stare, setStare] = useState('');
  const [eroare, setEroare] = useState('');
  const [ocupat, setOcupat] = useState(false);
  // Ce s-a apăsat de când a început proba. Nu se șterge singur: scopul e să
  // vezi că fiecare buton *a răspuns măcar o dată*, nu ce ții apăsat acum.
  const [apasate, setApasate] = useState({});
  const [inProba, setInProba] = useState(false);
  // Rolul fiecărui buton fizic, în ordinea de pe device.
  const [roluri, setRoluri] = useState(null);
  const [rolSalvat, setRolSalvat] = useState(null);

  const compatibil = typeof navigator !== 'undefined' && 'serial' in navigator;

  // Un device aprobat o data se deschide singura la intrarea pe ecran. Fara
  // asta, drumul spre configurare are un clic in plus de fiecare data, desi
  // raspunsul la "care device?" e deja stiut.
  useEffect(() => {
    if (!compatibil || port) return undefined;
    let activ = true;
    navigator.serial.getPorts().then(async (cunoscute) => {
      if (!activ || !cunoscute.length) return;
      try {
        const ales = cunoscute[0];
        await ales.open({ baudRate: BAUD });
        if (!activ) return;
        pornesteCitirea(ales);
        setPort(ales);
        await citesteRoluri(ales);
        await scaneaza(ales);
      } catch {
        // Portul e tinut de alt program, sau device-ul a fost scos - ramane
        // butonul de conectare, cu mesajul lui.
      }
    }).catch(() => {});
    return () => { activ = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compatibil]);

  // Un singur cititor, pornit odata cu portul si lasat sa curga.
  //
  // Prima varianta punea `reader.read()` intr-un `Promise.race` cu un
  // cronometru. Cand castiga cronometrul, citirea ramanea in asteptare, iar
  // bucla cerea imediat alta - doua citiri in acelasi timp pe acelasi
  // cititor. Chromium umplea consola cu "Invalid data pipe read result".
  //
  // Nici anularea cititorului la fiecare comanda nu merge: anularea inchide
  // fluxul portului, iar a doua comanda n-ar mai avea de unde citi. Asa ca
  // citim intr-un singur loc, continuu, si fiecare comanda doar asteapta sa
  // apara in ce s-a adunat ce o intereseaza.
  const cititor = useRef(null);
  const adunat = useRef('');

  function pornesteCitirea(portDeschis) {
    const reader = portDeschis.readable.getReader();
    cititor.current = reader;
    const decoder = new TextDecoder();

    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;
          const bucata = decoder.decode(value, { stream: true });
          adunat.current += bucata;

          // Apăsările vin nechemate, oricând, nu ca răspuns la o comandă -
          // deci se citesc aici, din curgerea comună, nu în `vorbeste`.
          for (const linie of bucata.split('\n')) {
            const buton = linie.match(/^BUTON\t(\d+)\t/);
            if (buton) {
              setApasate((prev) => ({ ...prev, [`b${buton[1]}`]: true }));
              continue;
            }
            if (/^ENCODER\t/.test(linie)) {
              setApasate((prev) => ({ ...prev, encoder: true }));
            }
          }
        }
      } catch {
        // Portul s-a inchis sub noi - normal la plecarea din ecran.
      }
    })();
  }

  async function opresteCitirea(portDeschis) {
    try {
      await cititor.current?.cancel();
      cititor.current?.releaseLock();
    } catch { /* se inchide oricum */ }
    cititor.current = null;
    try { await portDeschis?.close(); } catch { /* idem */ }
  }

  /** Trimite o linie si asteapta sa apara raspunsul in ce s-a adunat. */
  async function vorbeste(portDeschis, comanda, gata, asteptareMs) {
    adunat.current = '';

    const writer = portDeschis.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(`${comanda}\n`));
    } finally {
      writer.releaseLock();
    }

    const pana = Date.now() + asteptareMs;
    while (Date.now() < pana) {
      if (gata(adunat.current)) break;
      await new Promise((r) => setTimeout(r, 120));
    }
    return adunat.current;
  }

  async function conecteaza() {
    setEroare('');
    setStare('');
    try {
      const ales = await navigator.serial.requestPort();
      await ales.open({ baudRate: BAUD });
      pornesteCitirea(ales);
      setPort(ales);
      setStare('Device conectat. Caut rețelele pe care le vede ea…');
      await citesteRoluri(ales);
      await scaneaza(ales);
    } catch (err) {
      // `NotFoundError` inseamna ca n-a fost ales niciun port - nu e o
      // defectiune, e un "m-am razgandit".
      if (err?.name === 'NotFoundError') {
        setStare('');
        return;
      }
      // Un port serial se deschide de un singur program odata, iar cel care
      // il tine e aproape intotdeauna monitorul din Arduino IDE, lasat
      // deschis dupa programare. Mesajul browserului ("Failed to open
      // serial port") nu spune asta, si fara explicatie omul cauta
      // defectiunea in cablu sau in device.
      const ocupat = /open/i.test(err?.message || '') || err?.name === 'InvalidStateError';
      setEroare(ocupat
        ? 'Nu am putut deschide device-ul — portul e ținut de alt program. '
          + 'Închide monitorul serial din Arduino IDE (sau orice screen/picocom) și încearcă din nou.'
        : `Nu am putut deschide device-ul: ${err.message}`);
      setStare('');
    }
  }

  async function scaneaza(portDeschis = port) {
    if (!portDeschis) return;
    setOcupat(true);
    setEroare('');
    try {
      const raspuns = await vorbeste(
        portDeschis,
        'SCAN?',
        (text) => /OK SCAN gata/.test(text),
        ASTEPTARE_SCAN_MS,
      );
      const gasite = raspuns
        .split('\n')
        .filter((l) => l.startsWith('RETEA\t'))
        .map((l) => {
          const [, nume, rssi, canal] = l.trim().split('\t');
          return { nume, rssi: Number(rssi), canal: Number(canal) };
        })
        .filter((r) => r.nume);
      setRetele(gasite);
      setStare(gasite.length
        ? `Device-ul vede ${gasite.length} rețele.`
        : 'Device-ul nu vede nicio rețea. Verifică dacă routerul e pornit și emite pe 2.4GHz.');
      // Pastram ce era ales, daca mai e in lista: altfel o simpla reluare a
      // cautarii ar sterge alegerea facuta cu un minut inainte.
      setSsid((curent) => (gasite.some((r) => r.nume === curent) ? curent : ''));
    } catch (err) {
      setEroare(`Scanarea a eșuat: ${err.message}`);
    } finally {
      setOcupat(false);
    }
  }

  async function citesteRoluri(portDeschis = port) {
    if (!portDeschis) return;
    try {
      const raspuns = await vorbeste(portDeschis, 'BTN?', (t) => /OK BTN=/.test(t), ASTEPTARE_MS);
      const m = raspuns.match(/OK BTN=(\S+)/);
      if (m) {
        const lista = m[1].split(',');
        if (lista.length === 4) {
          setRoluri(lista);
          setRolSalvat(lista.join(','));
        }
      }
    } catch {
      // Firmware mai vechi, fara comanda asta - lista ramane ascunsă.
    }
  }

  /**
   * Schimbarea unui rol e mereu o inversare.
   *
   * Dacă butonul 1 ia rolul pe care-l avea butonul 3, al treilea îl
   * primește pe cel de dinainte al primului. Așa nu se poate ajunge la două
   * butoane care dau același punct și la unul care nu dă nimic - o stare în
   * care arbitrul ar vedea pe ecran altceva decât apasă.
   */
  function schimbaRol(index, cod) {
    setRoluri((prev) => {
      if (!prev || prev[index] === cod) return prev;
      const urmator = [...prev];
      const celalalt = urmator.indexOf(cod);
      if (celalalt >= 0) urmator[celalalt] = urmator[index];
      urmator[index] = cod;
      return urmator;
    });
  }

  async function salveazaRoluri() {
    if (!port || !roluri) return;
    setOcupat(true);
    setEroare('');
    try {
      const raspuns = await vorbeste(
        port,
        `BTN=${roluri.join(',')}`,
        (t) => /^(OK BTN=|EROARE )/m.test(t),
        ASTEPTARE_MS,
      );
      const linie = raspuns.split('\n').reverse().find((l) => /^(OK|EROARE)\b/.test(l.trim()));
      if (linie && linie.startsWith('EROARE')) {
        setEroare(linie.replace(/^EROARE\s*/, ''));
      } else {
        setRolSalvat(roluri.join(','));
        setStare('Butoanele au fost schimbate. Device-ul le ține minte.');
      }
    } catch (err) {
      setEroare(`Nu am putut schimba butoanele: ${err.message}`);
    } finally {
      setOcupat(false);
    }
  }

  async function porneteProba() {
    if (!port) return;
    setApasate({});
    setInProba(true);
    setEroare('');
    setStare('Apasă pe rând fiecare buton și rotește encoderul.');
    try {
      await vorbeste(port, 'TEST', (t) => /OK TEST pornit/.test(t), ASTEPTARE_MS);
    } catch (err) {
      setInProba(false);
      setEroare(`Nu am putut porni proba: ${err.message}`);
    }
  }

  async function opresteProba() {
    setInProba(false);
    setStare('');
    try {
      await vorbeste(port, 'TEST!', (t) => /OK TEST oprit/.test(t), ASTEPTARE_MS);
    } catch {
      // Se oprește oricum singură după trei minute.
    }
  }

  async function trimite() {
    if (!port || !ssid) return;
    if (parola && parola.length < 8) {
      setEroare('Parola trebuie să aibă cel puțin 8 caractere — asta cere WPA2, nu noi.');
      return;
    }
    setOcupat(true);
    setEroare('');
    try {
      const raspuns = await vorbeste(
        port,
        `WIFI=${ssid}\t${parola}`,
        // Device-ul isi scrie si jurnalul pe acelasi cablu, deci asteptam o
        // linie care incepe chiar cu raspunsul nostru.
        (text) => /^(OK WIFI=|EROARE )/m.test(text),
        ASTEPTARE_MS,
      );
      const linie = raspuns.split('\n').reverse().find((l) => /^(OK|EROARE)\b/.test(l.trim()));
      if (linie && linie.startsWith('EROARE')) {
        setEroare(linie.replace(/^EROARE\s*/, ''));
      } else {
        setStare(`Gata. Device-ul ține minte „${ssid}". Scoate cablul și repornește-o.`);
      }
    } catch (err) {
      setEroare(`Nu am putut scrie pe device: ${err.message}`);
    } finally {
      setOcupat(false);
    }
  }

  return (
    <div className="card card--wide">
      <BackLink onClick={async () => {
        // Inchidem portul inainte sa plecam: altfel ramane prins de noi, iar
        // urmatorul program care il cere - Arduino IDE, de pilda - primeste
        // exact eroarea despre portul ocupat.
        await opresteCitirea(port);
        onBack();
      }}
      />
      <h1>Device Arbitru</h1>
      <p className="subtitle">Leagă device-ul cu cablul USB-C.</p>

      {!compatibil && (
        <div className="error-box">
          Fereastra asta nu poate deschide porturi USB. Deschide launcherul instalat,
          nu dintr-un browser obișnuit.
        </div>
      )}

      {eroare && <div className="error-box">{eroare}</div>}
      {stare && !eroare && <p className="subtitle">{stare}</p>}

      {!port ? (
        <button type="button" className="btn-primary" onClick={conecteaza} disabled={!compatibil}>
          Conectează un device
        </button>
      ) : (
        <>
          <label htmlFor="retea">Rețeaua</label>
          <select
            id="retea"
            value={ssid}
            onChange={(e) => setSsid(e.target.value)}
            disabled={ocupat}
          >
            <option value="">— alege din ce vede device-ul —</option>
            {retele.map((r) => (
              <option key={`${r.nume}-${r.canal}`} value={r.nume}>
                {r.nume} ({putereInCuvinte(r.rssi)})
              </option>
            ))}
          </select>

          {/* Cel mai des motiv pentru care o retea lipseste, si singurul pe
              care nu-l poate ghici nimeni: device-ul prinde doar 2.4GHz, iar
              hotspoturile de telefon pornesc pe 5GHz. */}
          <p className="hint">
            Lipsește o rețea? Device-ul prinde doar <strong>2.4GHz</strong>.
          </p>

          <label htmlFor="parola">Parola</label>
          <input
            id="parola"
            type="text"
            value={parola}
            onChange={(e) => setParola(e.target.value)}
            placeholder="minimum 8 caractere"
            disabled={ocupat}
            autoComplete="off"
          />

          <h2 className="health-heading">Butoanele</h2>

          {roluri ? (
            <>
              <p className="hint">Dacă dai unui buton rolul altuia, se schimbă între ele.</p>
              <div className="health-list">
                {roluri.map((cod, i) => (
                  <div key={i} className="buton-rand">
                    <span className={`status-dot ${apasate[`b${i + 1}`] ? 'running' : 'starting'}`} />
                    <span className="health-name">Butonul {i + 1}</span>
                    <select
                      value={cod}
                      onChange={(e) => schimbaRol(i, e.target.value)}
                      disabled={ocupat}
                      aria-label={`Rolul butonului ${i + 1}`}
                    >
                      {ROLURI.map((r) => (
                        <option key={r.cod} value={r.cod}>{r.eticheta}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {roluri.join(',') !== rolSalvat && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={salveazaRoluri}
                  disabled={ocupat}
                >
                  Salvează butoanele
                </button>
              )}
            </>
          ) : (
            <p className="hint">
              Device-ul are un firmware mai vechi, fără schimbarea butoanelor.
            </p>
          )}

          {inProba && (
            <p className="hint">Apasă pe rând fiecare buton. Se oprește singură după 3 minute.</p>
          )}
          <div className="health-row">
            <span className={`status-dot ${apasate.encoder ? 'running' : 'starting'}`} />
            <span className="health-name">Encoder</span>
            <span className="health-detail">{apasate.encoder ? 'răspunde' : '—'}</span>
          </div>

          <div className="row">
            <button
              type="button"
              className="btn-secondary"
              onClick={inProba ? opresteProba : porneteProba}
              disabled={ocupat}
            >
              {inProba ? 'Oprește proba' : 'Testează butoanele'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => scaneaza()} disabled={ocupat}>
              Caută din nou
            </button>
            <button type="button" className="btn-primary" onClick={trimite} disabled={ocupat || !ssid}>
              {ocupat ? 'Se scrie…' : 'Scrie pe device'}
            </button>
          </div>
        </>
      )}

    </div>
  );
}
