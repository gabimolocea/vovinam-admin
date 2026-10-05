import { useEffect, useRef, useState } from 'react';

// Embeds a local app (competition-admin, referee-scoring, public-display)
// right inside the launcher's own window via <webview>, full-bleed - no
// bar of its own on top of it (that used to hold "Înapoi la panou" and
// "Deschide în browser extern"; both are native Window menu items now,
// see main.js). "Înapoi" hides this overlay, it doesn't stop the
// underlying page.
export default function AppViewPage({ app, onBack }) {
  const webviewRef = useRef(null);
  const [appErrors, setAppErrors] = useState([]);
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
  function reincarca() {
    const webview = webviewRef.current;
    if (!webview) return;
    // Daca reincarcarea reuseste, erorile de dinainte n-au ce sa mai caute
    // pe ecran; daca da iar gres, did-fail-load le pune imediat la loc.
    setAppErrors([]);
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
    <div className="app-view">
      {/* `allowpopups`: fara el, un link cu target="_blank" dinauntru - butonul
          TV, de pilda - e oprit inainte ca procesul principal sa afle de el, si
          apasarea pare ca nu face nimic. Ce se intampla cu fereastra decide tot
          procesul principal (setWindowOpenHandler in electron/main.js), care
          deschide doar adresele din sala si trimite restul in browser. */}
      {/* eslint-disable-next-line react/no-unknown-property -- atribut Electron <webview>, nu DOM standard */}
      <webview ref={webviewRef} src={app.url} allowpopups="true" className="app-view-webview" />
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
