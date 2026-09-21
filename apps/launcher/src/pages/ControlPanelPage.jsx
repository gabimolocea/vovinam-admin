import { useEffect, useRef, useState } from 'react';
import { cleanErrorMessage } from '../lib/cleanError.js';

const APP_LABELS = {
  'competition-admin': 'Panou Competiție (admin)',
  'referee-scoring': 'Aplicație Arbitri',
  'public-display': 'Ecran Public',
};

export default function ControlPanelPage({ event, localInfo, onOpenApp, onSyncToCloud }) {
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

  const appIds = Object.keys(localInfo?.urls || {});

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
              onClick={() => onOpenApp(id, localInfo.urls[id], APP_LABELS[id] || id)}
            >
              Deschide
            </button>
          </div>
        ))}
      </div>

      <div className="progress-log" ref={logRef}>
        {lines.join('\n')}
      </div>

      {resyncError && <div className="error-box" style={{ marginTop: 16 }}>{resyncError}</div>}

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn-secondary" onClick={handleResync} type="button" disabled={resyncing}>
          {resyncing ? 'Se resincronizează…' : 'Resincronizează din cloud'}
        </button>
        <button className="btn-primary" onClick={onSyncToCloud} type="button">
          Sincronizează rezultatele în cloud
        </button>
      </div>
      <p className="footer-note" style={{ marginTop: 8 }}>
        Folosește „Resincronizează” dacă au apărut sportivi sau modificări noi în cloud de la ultima sincronizare.
      </p>

      <p className="footer-note">
        Folosește acest buton doar la finalul competiției — trimite rezultatele înapoi în cloud.
      </p>
    </div>
  );
}
