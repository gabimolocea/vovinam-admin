import { useState } from 'react';

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

  /** Trimite o linie si aduna raspunsul pana la "OK"/"EROARE" sau expirare. */
  async function vorbeste(portDeschis, comanda, asteptareMs) {
    const encoder = new TextEncoder();
    const writer = portDeschis.writable.getWriter();
    await writer.write(encoder.encode(`${comanda}\n`));
    writer.releaseLock();

    const reader = portDeschis.readable.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const pana = Date.now() + asteptareMs;

    try {
      while (Date.now() < pana) {
        const { value, done } = await Promise.race([
          reader.read(),
          new Promise((resolve) => setTimeout(() => resolve({ value: null, done: false }), 400)),
        ]);
        if (done) break;
        if (value) text += decoder.decode(value, { stream: true });
        // Placuta scrie si jurnalul ei pe acelasi cablu, deci nu ne oprim la
        // prima linie, ci la una care arata a raspuns pentru noi.
        if (/^(OK|EROARE)\b.*$/m.test(text) && !/OK SCAN \d+$/m.test(text.trim())) break;
        if (/OK SCAN gata/m.test(text)) break;
      }
    } finally {
      reader.releaseLock();
    }
    return text;
  }

  async function conecteaza() {
    setEroare('');
    setStare('');
    try {
      const ales = await navigator.serial.requestPort();
      await ales.open({ baudRate: BAUD });
      setPort(ales);
      setStare('Plăcuță conectată. Caut rețelele pe care le vede ea…');
      await scaneaza(ales);
    } catch (err) {
      // `NotFoundError` inseamna ca n-a fost ales niciun port - nu e o
      // defectiune, e un "m-am razgandit".
      if (err?.name !== 'NotFoundError') {
        setEroare(`Nu am putut deschide plăcuța: ${err.message}`);
      }
      setStare('');
    }
  }

  async function scaneaza(portDeschis = port) {
    if (!portDeschis) return;
    setOcupat(true);
    setEroare('');
    try {
      const raspuns = await vorbeste(portDeschis, 'SCAN?', ASTEPTARE_SCAN_MS);
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
      const raspuns = await vorbeste(port, `WIFI=${ssid}\t${parola}`, ASTEPTARE_MS);
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

      <button type="button" className="btn-link" onClick={onBack}>
        Înapoi
      </button>
    </div>
  );
}
