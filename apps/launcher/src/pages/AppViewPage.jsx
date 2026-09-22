import { useEffect } from 'react';

// Embeds a local app (competition-admin, referee-scoring, public-display)
// right inside the launcher's own window via <webview>, full-bleed - no
// bar of its own on top of it (that used to hold "Înapoi la panou" and
// "Deschide în browser extern"; both are native Window menu items now,
// see main.js). "Înapoi" hides this overlay, it doesn't stop the
// underlying page.
export default function AppViewPage({ app, onBack }) {
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

  return (
    <div className="app-view">
      <webview src={app.url} className="app-view-webview" />
    </div>
  );
}
