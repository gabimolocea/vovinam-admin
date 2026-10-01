import { useEffect, useRef, useState } from 'react';
import BackLink from '../components/BackLink.jsx';

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

// Cum se cheama pe ecran fiecare fel de aparat. Cheile vin de la server
// (api/connectivity.py), unde se deduc din portul aplicatiei deschise.
const NUME_FEL = {
  device: 'Device Arbitru',
  arbitraj: 'Arbitru, de pe telefon',
  administrare: 'Secretariat',
  ecran: 'Ecran public',
  altul: 'Alt aparat',
};

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

  const arbitri = aparate?.arbitri ?? 0;
  const total = (aparate?.aparate || []).length;

  return (
    <div className="card card--wide">
      <BackLink onClick={onBack} />
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
              {/* Cifra pe care o citește cineva înainte de start: câți
                  arbitri sunt legați, fie de pe device, fie de pe telefon.
                  Despărțite dedesubt, fiindcă o device lipsă și un telefon
                  lipsă se caută în locuri diferite. */}
              <strong>{arbitri}</strong>
              <span>arbitri conectați</span>
            </div>
            <div>
              <strong>{aparate.device_arbitru}</strong>
              <span>de pe Device Arbitru</span>
            </div>
            <div>
              <strong>{aparate.telefoane_arbitraj}</strong>
              <span>de pe telefon</span>
            </div>
            <div>
              <strong>{aparate.administrare + aparate.ecrane}</strong>
              <span>secretariat și ecrane</span>
            </div>
          </div>
          {total === 0 ? (
            <p className="hint">
              Nimic conectat încă. Pornește un device sau deschide o aplicație pe o
              tabletă — apare aici în câteva secunde.
            </p>
          ) : (
            <div className="health-list">
              {aparate.aparate.map((a) => (
                <Rand
                  key={a.adresa}
                  nume={NUME_FEL[a.fel] || 'Alt aparat'}
                  detaliu={`${a.adresa} · acum ${a.acum_secunde}s`}
                  bine
                />
              ))}
            </div>
          )}
          <p className="hint">
            Se numără ce a vorbit cu serverul în ultimul minut. O device scoasă din
            priză dispare de aici în câteva zeci de secunde.
          </p>
        </>
      )}

      {ultima && (
        <p className="footer-note">
          Verificat la {ultima.toLocaleTimeString('ro-RO')}.
        </p>
      )}
    </div>
  );
}
