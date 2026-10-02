import { useEffect, useState } from 'react';
import PASI, { FAZE_TUTORIAL } from '../tutorial/pasiCompetitie.js';
import { jsCurata, jsEvidentiaza, jsMergiLaFila, trimiteInAplicatie } from '../tutorial/condu.js';

/**
 * Ghidul interactiv pentru Panoul Competitie.
 *
 * Nu e un text despre aplicatie, ci langa ea: la fiecare pas duce aplicatia
 * inglobata pe fila potrivita si incercuieste acolo lucrul despre care
 * vorbeste. Operatorul vede ecranul adevarat, cu datele lui, nu o poza.
 *
 * `aplica` se cheama si la fiecare schimbare de pas, si la redeschidere, si
 * e singurul loc care atinge webview-ul (prin tutorial/condu.js).
 *
 * Cand un pas nu gaseste ce cauta - s-a redenumit o fila, s-a mutat un buton
 * - panoul o spune in locul in care ar fi fost conturul. Un ghid care tace
 * si arata spre nimic e mai rau decat niciun ghid: omul crede ca n-a inteles
 * el, si cauta mai departe.
 */
export default function TutorialPanel({ webviewRef, gataDeRulat, onClose }) {
  const [index, setIndex] = useState(0);
  const [rateuri, setRateuri] = useState([]);

  const pas = PASI[index];
  const faza = [...FAZE_TUTORIAL].reverse().find((f) => index + 1 >= f.de_la);

  useEffect(() => {
    if (!gataDeRulat) return;
    const webview = webviewRef.current;
    if (!webview) return;

    let valabil = true;
    (async () => {
      const probleme = [];
      try {
        const aGasitFila = await webview.executeJavaScript(jsMergiLaFila(pas.fila));
        if (!aGasitFila) probleme.push(`fila „${pas.fila}”`);
        // Fila se schimba prin React: fara pauza, evidentierea cauta in
        // ecranul dinainte si nu gaseste nimic.
        await new Promise((gata) => { setTimeout(gata, 450); });
        const aGasitTinta = await webview.executeJavaScript(jsEvidentiaza(pas.tinta || pas.fila));
        if (!aGasitTinta) probleme.push(`„${pas.tinta || pas.fila}”`);
      } catch {
        probleme.push('aplicația nu a răspuns');
      }
      if (valabil) setRateuri(probleme);
    })();

    return () => { valabil = false; };
  }, [index, gataDeRulat, pas, webviewRef]);

  function inchide() {
    trimiteInAplicatie(webviewRef.current, jsCurata());
    onClose();
  }

  return (
    <aside className="tutorial" aria-label="Ghid interactiv">
      <div className="tutorial-head">
        <span className="tutorial-contor">Pasul {index + 1} din {PASI.length}</span>
        <button type="button" className="tutorial-x" onClick={inchide} aria-label="Închide ghidul">×</button>
      </div>

      {faza && <p className="tutorial-faza">{faza.nume}</p>}

      <h2 className="tutorial-titlu">{pas.titlu}</h2>
      <p className="tutorial-text">{pas.text}</p>

      {rateuri.length > 0 && (
        <p className="tutorial-rateu">
          Nu am găsit pe ecran {rateuri.join(' și ')}. Probabil s-a schimbat ceva în
          aplicație de când a fost scris ghidul — pasul rămâne valabil, doar că
          trebuie să cauți singur.
        </p>
      )}

      <div className="tutorial-progres" aria-hidden="true">
        {PASI.map((p, i) => (
          <span key={p.fila} className={`tutorial-bulina${i === index ? ' e-acum' : ''}${i < index ? ' trecut' : ''}`} />
        ))}
      </div>

      <div className="tutorial-butoane">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setIndex((i) => i - 1)}
          disabled={index === 0}
        >
          Înapoi
        </button>
        {index < PASI.length - 1 ? (
          <button type="button" className="btn-primary" onClick={() => setIndex((i) => i + 1)}>
            Următorul
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={inchide}>
            Am terminat
          </button>
        )}
      </div>

      <p className="tutorial-nota">
        Aplicația de alături e cea adevărată, cu datele competiției tale. Poți
        lucra în ea în timp ce ghidul e deschis.
      </p>
    </aside>
  );
}
