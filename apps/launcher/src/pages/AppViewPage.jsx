// Embeds a local app (competition-admin, referee-scoring, public-display)
// right inside the launcher's own window via <webview>, instead of
// spawning a separate OS window - "Înapoi" just hides this overlay, it
// doesn't stop the underlying page.
export default function AppViewPage({ app, onBack }) {
  return (
    <div className="app-view">
      <div className="app-view-bar">
        <button className="btn-secondary" onClick={onBack} type="button">
          ← Înapoi la panou
        </button>
        <div className="app-view-title">{app.title}</div>
        <button
          className="btn-link"
          type="button"
          onClick={() => window.launcher.openExternal(app.url)}
        >
          Deschide în browser extern
        </button>
      </div>
      <webview src={app.url} className="app-view-webview" />
    </div>
  );
}
