import { useRef, useState } from 'react';

/**
 * Configurarea retelei pe placutele arbitrilor, prin cablul USB.
 *
 * De ce prin cablu si nu prin retea: placuta are nevoie de Wi-Fi ca sa
 * ajunga la launcher, iar Wi-Fi-ul e exact ce-i lipseste. Singura cale care
 * nu depinde de retea e cablul - si el e oricum acolo, placutele se leaga la
 * calculator ca sa fie programate.
 *
 * Numele retelei nu se scrie de mana: il cerem chiar placutei, care
 * scaneaza cu radioul ei. Conteaza diferenta - placuta prinde doar 2.4GHz,
 * deci o retea pe care laptopul o vede nu inseamna una la care ea se poate
 * conecta.
 */

const BAUD = 115200;

// Cat asteptam un raspuns de la placuta. Scanarea dureaza cateva secunde,
// restul comenzilor sunt instantanee.
const ASTEPTARE_SCAN_MS = 12000;
const ASTEPTARE_MS = 4000;

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

  const compatibil = typeof navigator !== 'undefined' && 'serial' in navigator;

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
          if (value) adunat.current += decoder.decode(value, { stream: true });
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
      setStare('Plăcuță conectată. Caut rețelele pe care le vede ea…');
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
      // defectiunea in cablu sau in placuta.
      const ocupat = /open/i.test(err?.message || '') || err?.name === 'InvalidStateError';
      setEroare(ocupat
        ? 'Nu am putut deschide plăcuța — portul e ținut de alt program. '
          + 'Închide monitorul serial din Arduino IDE (sau orice screen/picocom) și încearcă din nou.'
        : `Nu am putut deschide plăcuța: ${err.message}`);
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
        ? `Plăcuța vede ${gasite.length} rețele.`
        : 'Plăcuța nu vede nicio rețea. Verifică dacă routerul e pornit și emite pe 2.4GHz.');
      // Pastram ce era ales, daca mai e in lista: altfel o simpla reluare a
      // cautarii ar sterge alegerea facuta cu un minut inainte.
      setSsid((curent) => (gasite.some((r) => r.nume === curent) ? curent : ''));
    } catch (err) {
      setEroare(`Scanarea a eșuat: ${err.message}`);
    } finally {
      setOcupat(false);
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
        // Placuta isi scrie si jurnalul pe acelasi cablu, deci asteptam o
        // linie care incepe chiar cu raspunsul nostru.
        (text) => /^(OK WIFI=|EROARE )/m.test(text),
        ASTEPTARE_MS,
      );
      const linie = raspuns.split('\n').reverse().find((l) => /^(OK|EROARE)\b/.test(l.trim()));
      if (linie && linie.startsWith('EROARE')) {
        setEroare(linie.replace(/^EROARE\s*/, ''));
      } else {
        setStare(`Gata. Plăcuța ține minte „${ssid}". Scoate cablul și repornește-o.`);
      }
    } catch (err) {
      setEroare(`Nu am putut scrie pe plăcuță: ${err.message}`);
    } finally {
      setOcupat(false);
    }
  }

  return (
    <div className="card card--wide">
      <h1>Rețeaua plăcuțelor de arbitraj</h1>
      <p className="subtitle">
        Leagă o plăcuță la laptop cu cablul USB-C și scrie-i rețeaua sălii.
        O ține minte și nu mai trebuie reprogramată.
      </p>

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
          Conectează o plăcuță
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
            <option value="">— alege din ce vede plăcuța —</option>
            {retele.map((r) => (
              <option key={`${r.nume}-${r.canal}`} value={r.nume}>
                {r.nume} ({putereInCuvinte(r.rssi)})
              </option>
            ))}
          </select>

          {/* Cel mai des motiv pentru care o retea lipseste din lista, si
              singurul pe care nu-l poate ghici nimeni: placuta prinde doar
              2.4GHz, iar hotspoturile de telefon pornesc pe 5GHz. Scris aici,
              nu doar cand lista e goala - de obicei lista are retele, doar
              ca nu si pe cea cautata. */}
          <p className="hint">
            Nu vezi rețeaua pe care o cauți? Plăcuța prinde doar <strong>2.4GHz</strong>.
            Pe iPhone pornește &bdquo;Maximize Compatibility&rdquo; în Hotspot personal și lasă
            ecranul acela deschis; pe Android alege banda 2.4 GHz. Apoi caută din nou.
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

          <div className="row">
            <button type="button" className="btn-secondary" onClick={() => scaneaza()} disabled={ocupat}>
              Caută din nou
            </button>
            <button type="button" className="btn-primary" onClick={trimite} disabled={ocupat || !ssid}>
              {ocupat ? 'Se scrie…' : 'Scrie pe plăcuță'}
            </button>
          </div>
        </>
      )}

      <button
        type="button"
        className="btn-link"
        onClick={async () => {
          // Inchidem portul inainte sa plecam: altfel ramane prins de noi,
          // iar urmatorul program care il cere - Arduino IDE, de pilda -
          // primeste exact eroarea de mai sus.
          await opresteCitirea(port);
          onBack();
        }}
      >
        Înapoi
      </button>
    </div>
  );
}
