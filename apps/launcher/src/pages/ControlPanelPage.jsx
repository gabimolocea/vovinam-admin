import { useEffect, useRef, useState } from 'react';
import { cleanErrorMessage } from '../lib/cleanError.js';

const APP_LABELS = {
  'competition-admin': 'Panou Competiție (admin)',
  'referee-scoring': 'Aplicație Arbitri',
  'public-display': 'Ecran Public',
};

export default function ControlPanelPage({ event, localInfo, onOpenApp, triggerResync, onResyncTriggered }) {
  const [statuses, setStatuses] = useState({});
  const [lines, setLines] = useState([]);
  const [resyncing, setResyncing] = useState(false);
  const [resyncError, setResyncError] = useState('');
  const logRef = useRef(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines]);

  useEffect(() => {
    const offLog = window.launcher.onServiceLog(({ id, line }) => {
      const trimmed = line.trim();
      if (trimmed) setLines((prev) => [...prev.slice(-200), `[${id}] ${trimmed}`]);
    });
    const offStatus = window.launcher.onServiceStatus(({ id, status }) => {
      setStatuses((prev) => ({ ...prev, [id]: status }));
    });
    const offProgress = window.launcher.onSyncProgress(({ direction, message }) => {
      if (direction === 'local') setLines((prev) => [...prev.slice(-200), message]);
    });
    return () => {
      offLog();
      offStatus();
      offProgress();
    };
  }, []);

  async function handleResync() {
    setResyncError('');
    setResyncing(true);
    try {
      await window.launcher.startLocalSync(event.id);
    } catch (err) {
      setResyncError(cleanErrorMessage(err, 'Resincronizarea a eșuat.'));
    } finally {
      setResyncing(false);
    }
  }

  // "Web → Local" lives in the native Sync menu (main.js). Triggering it
  // needs this component mounted (the progress log below is how the
  // operator sees it happen), but this component is unmounted while an
  // app is open embedded (App.jsx renders AppViewPage instead, covering
  // this entirely) - which App.jsx's own menu-event listener already
  // closes before setting triggerResync, so by the time this effect runs
  // here, mount is guaranteed to be fresh and this fires reliably instead
  // of racing a ref that a moment ago belonged to an unmounted instance.
  useEffect(() => {
    if (triggerResync) {
      handleResync();
      onResyncTriggered?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerResync]);

  const appIds = Object.keys(localInfo?.urls || {});

  // competition-admin's own root shows its "Competition Manager" (every
  // competition on this server) - since only one event is ever synced
  // down to a given LAN server at a time, jump straight into that one
  // instead of making the operator pick it again from a list of one.
  const appOpenUrl = (id) => {
    const base = localInfo.urls[id];
    if (id === 'competition-admin' && event?.id) return `${base}/competitions/${event.id}/categories`;
    return base;
  };

  return (
    <div className="card card--wide">
      <h1>{event?.name}</h1>
      <p className="subtitle">Stiva locală rulează. Deschide aplicațiile de mai jos direct aici.</p>

      <div className="lan-ip">{localInfo?.lanIp}</div>

      <div className="app-links">
        {appIds.map((id) => (
          <div key={id} className="app-link-row">
            <div>
              <div>
                <span className={`status-dot ${statuses[id] || 'starting'}`} />
                {APP_LABELS[id] || id}
              </div>
              <div className="url">{localInfo.urls[id]}</div>
            </div>
            <button
              className="btn-secondary"
              type="button"
              onClick={() => onOpenApp(id, appOpenUrl(id), APP_LABELS[id] || id)}
            >
              Deschide
            </button>
          </div>
        ))}
      </div>

      <div className="progress-log" ref={logRef}>
        {lines.join('\n')}
      </div>

      {resyncing && <div className="footer-note" style={{ marginTop: 16 }}>Se resincronizează…</div>}
      {resyncError && <div className="error-box" style={{ marginTop: 16 }}>{resyncError}</div>}

      <p className="footer-note" style={{ marginTop: 16 }}>
        Sincronizarea (Web → Local, Local → Web) e acum în meniul <strong>Sync</strong> din bara de sus.
      </p>
    </div>
  );
}
