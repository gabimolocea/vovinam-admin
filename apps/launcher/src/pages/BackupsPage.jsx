import { useCallback, useEffect, useState } from 'react';
import { cleanErrorMessage } from '../lib/cleanError.js';

// Snapshots of the venue database - taken automatically every 15 minutes
// by the backup-scheduler container, plus whatever the operator takes by
// hand. This exists for the worst moment of a competition day: something
// went wrong and the fastest way out is to put the database back where it
// was ten minutes ago.
export default function BackupsPage({ onBack }) {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await window.launcher.listBackups();
      const list = Array.isArray(data) ? data : data?.results || data?.backups || [];
      setBackups(list);
    } catch (err) {
      setError(cleanErrorMessage(err, 'Nu s-au putut încărca backup-urile.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      await window.launcher.createBackup('manual');
      setNotice('Backup creat.');
      await load();
    } catch (err) {
      setError(cleanErrorMessage(err, 'Backup-ul a eșuat.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore(backup) {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      await window.launcher.restoreBackup(backup.filename);
      setNotice(`Restaurat din ${backup.filename}. Reîncarcă aplicațiile deschise ca să vezi datele restaurate.`);
      await load();
    } catch (err) {
      setError(cleanErrorMessage(err, 'Restaurarea a eșuat.'));
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  const formatWhen = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'medium' });
  };

  const formatSize = (bytes) => (
    Number.isFinite(bytes) ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : ''
  );

  return (
    <div className="card card--wide">
      <h1>Backup-uri locale</h1>
      <p className="subtitle">
        Copii ale bazei de date de pe acest calculator - una automată la fiecare 15 minute, plus cele făcute manual.
      </p>

      {error && <div className="error-box">{error}</div>}
      {notice && <div className="verify-box verify-box--ok">{notice}</div>}

      <div className="row" style={{ marginBottom: 16 }}>
        <button className="btn-secondary" onClick={onBack} type="button" disabled={busy}>
          Înapoi
        </button>
        <button className="btn-primary" onClick={handleCreate} type="button" disabled={busy}>
          {busy ? 'Se lucrează…' : 'Backup acum'}
        </button>
      </div>

      {loading ? (
        <p className="subtitle">Se încarcă…</p>
      ) : backups.length === 0 ? (
        <p className="subtitle">Niciun backup încă.</p>
      ) : (
        <ul className="event-list">
          {backups.map((backup) => (
            <li key={backup.filename} className="event-item event-item--stack">
              <div className="event-item-row" style={{ cursor: 'default' }}>
                <div>
                  <div className="event-name">{formatWhen(backup.created_at)}</div>
                  <div className="event-meta">
                    {backup.trigger || 'manual'}
                    {backup.size_bytes ? ` · ${formatSize(backup.size_bytes)}` : ''}
                  </div>
                </div>
                <button
                  className="btn-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(backup)}
                >
                  Restaurează
                </button>
              </div>
              {confirming?.filename === backup.filename && (
                <div className="detail-block">
                  <strong>
                    Înlocuiești toate datele de pe acest calculator cu cele din {formatWhen(backup.created_at)}?
                  </strong>
                  <span>
                    Tot ce s-a înregistrat după acel moment (meciuri, scoruri, cântăriri) se pierde.
                    Se face automat un backup de siguranță înainte, deci te poți întoarce.
                  </span>
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className="btn-secondary" type="button" onClick={() => setConfirming(null)} disabled={busy}>
                      Anulează
                    </button>
                    <button className="btn-primary" type="button" onClick={() => handleRestore(backup)} disabled={busy}>
                      {busy ? 'Se restaurează…' : 'Da, restaurează'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
