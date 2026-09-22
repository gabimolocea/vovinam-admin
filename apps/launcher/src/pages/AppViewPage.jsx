import { useEffect } from 'react';

// Embeds a local app (competition-admin, referee-scoring, public-display)
// right inside the launcher's own window via <webview>, instead of
// spawning a separate OS window - "Înapoi" just hides this overlay, it
// doesn't stop the underlying page.
export default function AppViewPage({ app, onBack }) {
  // Lets the Window menu's "Deschide în browser extern" item (main.js)
  // know which app is currently on screen - the button that used to live
  // in this bar moved up there instead.
  useEffect(() => {
    window.launcher.setActiveAppUrl(app.url);
    return () => window.launcher.setActiveAppUrl(null);
  }, [app.url]);

  return (
    <div className="app-view">
      <div className="app-view-bar">
        <button className="btn-secondary" onClick={onBack} type="button">
          ← Înapoi la panou
        </button>
        <div className="app-view-title">{app.title}</div>
      </div>
      <webview src={app.url} className="app-view-webview" />
    </div>
  );
}
