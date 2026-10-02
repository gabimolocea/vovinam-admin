import { useEffect, useRef, useState } from 'react';
import TutorialPanel from '../components/TutorialPanel.jsx';
import { jsAreFile, jsCurata, trimiteInAplicatie } from '../tutorial/condu.js';
import PASI from '../tutorial/pasiCompetitie.js';
import { ghidulAFostVazut, tineMinteCaAFostVazut } from '../tutorial/vazut.js';

// Embeds a local app (competition-admin, referee-scoring, public-display)
// right inside the launcher's own window via <webview>, full-bleed - no
// bar of its own on top of it (that used to hold "Înapoi la panou" and
// "Deschide în browser extern"; both are native Window menu items now,
// see main.js). "Înapoi" hides this overlay, it doesn't stop the
// underlying page.
export default function AppViewPage({ app, onBack }) {
  const webviewRef = useRef(null);
  const [appErrors, setAppErrors] = useState([]);
  // Ghidul interactiv exista doar pentru Panoul Competitie: celelalte doua
  // aplicatii inglobate (arbitraj, ecran public) n-au nimic de parcurs.
  const areGhid = app.id === 'competition-admin';
  const [ghidDeschis, setGhidDeschis] = useState(false);
  const [paginaGata, setPaginaGata] = useState(false);
  const [aplicatieGata, setAplicatieGata] = useState(false);
  const [ghidVazut, setGhidVazut] = useState(ghidulAFostVazut);

  // executeJavaScript pe un <webview> arunca pana cand documentul lui
  // exista; pana la dom-ready ghidul n-are pe ce lucra.
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return undefined;
    const marcheaza = () => setPaginaGata(true);
    webview.addEventListener('dom-ready', marcheaza);
    return () => webview.removeEventListener('dom-ready', marcheaza);
  }, []);

  // Cand aplicatia inglobata chiar are ce arata.
  //
  // Nu e acelasi lucru cu `paginaGata`: dom-ready spune doar ca exista un
  // document. Filele apar cateva momente mai tarziu, dupa ce aplicatia isi
  // aduce datele - iar intre cele doua momente orice pas al ghidului cade in
  // gol. Asa ca intrebam aplicatia, din secunda in secunda, pana raspunde ca
  // si-a desenat bara; daca omul mai are de trecut prin autentificare,
  // asteptam linistit cat dureaza.
  useEffect(() => {
    if (!areGhid || !paginaGata || aplicatieGata) return undefined;
    const etichete = PASI.map((p) => p.fila);
    let valabil = true;
    const intreaba = async () => {
      const gata = await trimiteInAplicatie(webviewRef.current, jsAreFile(etichete));
      if (valabil && gata) setAplicatieGata(true);
    };
    intreaba();
    const ceas = setInterval(intreaba, 1000);
    return () => { valabil = false; clearInterval(ceas); };
  }, [areGhid, paginaGata, aplicatieGata]);

  // Prima deschidere a Panoului Competitie: ghidul porneste singur, dar abia
  // cand are pe ce lucra. Daca interfetele nu ruleaza, aplicatia nu ajunge
  // niciodata "gata" si ghidul nu sare in fata unui ecran gol - omul vede
  // caseta de erori, care spune ce e de facut.
  useEffect(() => {
    if (!areGhid || ghidVazut || !aplicatieGata) return;
    setGhidDeschis(true);
  }, [areGhid, ghidVazut, aplicatieGata]);

  // Iesirea din aplicatie cu ghidul deschis lasa altfel conturul rosu peste
  // ecran, iar urmatorul care deschide aplicatia il gaseste acolo.
  useEffect(() => () => {
    trimiteInAplicatie(webviewRef.current, jsCurata());
  }, []);

  // Lets the Window menu's "Deschide în browser extern" / "Înapoi la
  // panou" items (main.js) know an app is on screen, and hand them a way
  // back.
  useEffect(() => {
    window.launcher.setActiveAppUrl(app.url);
    const offGoBack = window.launcher.onGoBackToPanel(onBack);
    return () => {
      window.launcher.setActiveAppUrl(null);
      offGoBack();
    };
  }, [app.url, onBack]);

  // A <webview> has its own console and its own network stack, both out of
  // reach from here - so when something breaks inside the embedded app,
  // the launcher shows nothing and there's no devtools to open on
  // competition day. Pull the errors out and put them on screen.
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return undefined;

    const pushError = (text) => {
      setAppErrors((current) => {
        if (current.includes(text)) return current;
        return [...current.slice(-4), text];
      });
    };

    const onConsoleMessage = (event) => {
      // Electron numbered the levels (3 = error) up to v34 and switched to
      // names after that; accept both so this keeps working on an upgrade.
      const isError = typeof event.level === 'string'
        ? event.level === 'error'
        : event.level >= 3;
      if (!isError) return;
      pushError(event.message);
    };
    const onFailLoad = (event) => {
      if (event.isMainFrame === false) return;
      pushError(`Pagina nu s-a încărcat: ${event.errorDescription || event.errorCode} (${event.validatedURL || app.url})`);
    };

    webview.addEventListener('console-message', onConsoleMessage);
    webview.addEventListener('did-fail-load', onFailLoad);
    return () => {
      webview.removeEventListener('console-message', onConsoleMessage);
      webview.removeEventListener('did-fail-load', onFailLoad);
    };
  }, [app.url]);

  // A fresh app means fresh errors - don't carry the previous one over.
  useEffect(() => setAppErrors([]), [app.url]);

  // O pagina care n-a intrat nu se mai reincerca singura, iar in ziua
  // competitiei singura iesire era prin meniul Window, inapoi la panou si
  // din nou in aplicatie - adica exact ce nu ghicesti cand ecranul e gol.
  // Inchiderea ghidului e si raspunsul la "l-am vazut": si cine il parcurge
  // pana la capat, si cine il inchide la primul pas au decis la fel - sa nu
  // le mai sara in fata. Butonul plutitor ramane, pentru cand se razgandesc.
  function inchideGhid() {
    setGhidDeschis(false);
    if (!ghidVazut) {
      tineMinteCaAFostVazut();
      setGhidVazut(true);
    }
  }

  function reincarca() {
    const webview = webviewRef.current;
    if (!webview) return;
    // Daca reincarcarea reuseste, erorile de dinainte n-au ce sa mai caute
    // pe ecran; daca da iar gres, did-fail-load le pune imediat la loc.
    setAppErrors([]);
    setAplicatieGata(false);
    // Cand pagina e incarcata si eroarea vine din consola, `reload()`
    // pastreaza locul din aplicatie. Dar daca nicio navigare nu s-a
    // confirmat, n-are ce reface - atunci o cerem de la capat.
    // Si astea arunca pe loc daca webview-ul inca nu e atasat.
    try {
      const curent = webview.getURL?.();
      if (curent && curent !== 'about:blank') webview.reload();
      else webview.loadURL(app.url);
    } catch {
      // Nimic de reincarcat inca; butonul reapare cu urmatoarea eroare.
    }
  }

  return (
    <div className={`app-view${ghidDeschis ? ' app-view--cu-ghid' : ''}`}>
      <webview ref={webviewRef} src={app.url} className="app-view-webview" />
      {areGhid && !ghidDeschis && (
        <button type="button" className="app-view-ghid-buton" onClick={() => setGhidDeschis(true)}>
          Ghid pas cu pas
        </button>
      )}
      {areGhid && ghidDeschis && (
        <TutorialPanel
          webviewRef={webviewRef}
          gataDeRulat={aplicatieGata}
          onClose={inchideGhid}
        />
      )}
      {appErrors.length > 0 && (
        <div className="app-view-errors">
          <div className="app-view-errors-head">
            <span>Erori din aplicație</span>
            <div className="app-view-errors-actions">
              <button type="button" className="app-view-errors-reload" onClick={reincarca}>
                Reîncarcă
              </button>
              <button type="button" onClick={() => setAppErrors([])}>Închide</button>
            </div>
          </div>
          {appErrors.map((message) => (
            <pre key={message}>{message}</pre>
          ))}
        </div>
      )}
    </div>
  );
}
