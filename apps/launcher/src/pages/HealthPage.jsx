import { useEffect, useRef, useState } from 'react';

/**
 * Starea sălii: ce răspunde și cine e conectat, acum.
 *
 * Există fiindcă până acum nu se putea verifica nimic înainte de start. Se
 * afla la primul meci, când un arbitru apăsa un buton și nu se întâmpla
 * nimic - adică exact când nu mai e timp de căutat.
 *
 * Se reîmprospătează singur, ca să poată rămâne deschis pe un al doilea
 * ecran în timpul competiției. De aceea nu are nimic de apăsat: cine se
 * uită la el vrea să vadă, nu să lucreze.
 */

const LA_CAT_TIMP_MS = 4000;

// Ce se verifică, și cum se cheamă pe ecran. Porturile sunt aceleași cu cele
// din electron/services.js; dacă se schimbă acolo, se schimbă și aici.
const LEGATURI = [
  { cheie: 'backend', nume: 'Serverul competiției', port: 8000, cale: '/health/' },
  { cheie: 'competition-admin', nume: 'Administrare', port: 5191, cale: '/' },
  { cheie: 'referee-scoring', nume: 'Arbitraj', port: 5176, cale: '/' },
  { cheie: 'public-display', nume: 'Ecran public', port: 5177, cale: '/' },
];

/**
 * Verificarea o face procesul principal, nu fereastra.
 *
 * Din fereastra nu se poate: cele trei interfete sunt fisiere statice fara
 * antete CORS, deci browserul blocheaza cererea si le-ar arata cazute desi
 * raspund. Un ecran de verificare care minte e mai rau decat niciunul.
 */
async function verificaTot(gazda) {
  if (window.launcher?.checkHealth) {
    return window.launcher.checkHealth(gazda);
  }
  // Deschis in afara aplicatiei (dezvoltare in browser): nu putem verifica
  // cinstit, si o spunem in loc sa aratam becuri rosii nejustificate.
  return { legaturi: null, aparate: null };
}

function Rand({ nume, detaliu, bine }) {
  return (
    <div className="health-row">
      <span className={`status-dot ${bine ? 'running' : 'crashed'}`} />
      <span className="health-name">{nume}</span>
      <span className="health-detail">{detaliu}</span>
    </div>
  );
}

export default function HealthPage({ localInfo, onBack }) {
  const gazda = localInfo?.lanIp || 'localhost';
  const [legaturi, setLegaturi] = useState(null);
  const [aparate, setAparate] = useState(null);
  const [ultima, setUltima] = useState(null);
  const activ = useRef(true);

  useEffect(() => {
    activ.current = true;

    async function verifica() {
      const { legaturi: stari, aparate: lista } = await verificaTot(gazda);
      if (!activ.current) return;
      setLegaturi(stari);
      setAparate(lista);
      setUltima(new Date());
    }

    verifica();
    const ceas = setInterval(verifica, LA_CAT_TIMP_MS);
    return () => {
      activ.current = false;
      clearInterval(ceas);
    };
  }, [gazda]);

  const placute = aparate?.placute ?? 0;
  const browsere = aparate?.browsere ?? 0;

  return (
    <div className="card card--wide">
      <h1>Starea sălii</h1>
      <p className="subtitle">
        Se reîmprospătează singur. Poți lăsa fereastra asta deschisă în timpul competiției.
      </p>

      {legaturi === null ? (
        <p className="hint">
          Verificarea merge doar din aplicația instalată, nu dintr-un browser obișnuit.
        </p>
      ) : (
        <div className="health-list">
          {LEGATURI.map((l) => (
            <Rand
              key={l.cheie}
              nume={l.nume}
              detaliu={`${gazda}:${l.port}`}
              bine={legaturi[l.cheie]}
            />
          ))}
        </div>
      )}

      <h2 className="health-heading">Aparate conectate</h2>
      {aparate === null ? (
        <p className="hint">
          Nu pot citi lista. Serverul competiției nu răspunde sau e o versiune mai veche.
        </p>
      ) : (
        <>
          <div className="health-counts">
            <div>
              <strong>{placute}</strong>
              <span>plăcuțe de arbitraj</span>
            </div>
            <div>
              <strong>{browsere}</strong>
              <span>tablete și ecrane</span>
            </div>
          </div>
          {placute + browsere === 0 ? (
            <p className="hint">
              Nimic conectat încă. Pornește o plăcuță sau deschide o aplicație pe o
              tabletă — apare aici în câteva secunde.
            </p>
          ) : (
            <div className="health-list">
              {aparate.aparate.map((a) => (
                <Rand
                  key={a.adresa}
                  nume={a.fel === 'placuta' ? 'Plăcuță de arbitraj' : 'Tabletă sau ecran'}
                  detaliu={`${a.adresa} · acum ${a.acum_secunde}s`}
                  bine
                />
              ))}
            </div>
          )}
          <p className="hint">
            Se numără ce a vorbit cu serverul în ultimul minut. O plăcuță scoasă din
            priză dispare de aici în câteva zeci de secunde.
          </p>
        </>
      )}

      {ultima && (
        <p className="footer-note">
          Verificat la {ultima.toLocaleTimeString('ro-RO')}.
        </p>
      )}

      <button type="button" className="btn-link" onClick={onBack}>
        Înapoi
      </button>
    </div>
  );
}
