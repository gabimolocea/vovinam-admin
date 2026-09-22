import { useEffect, useState } from 'react';
import { cleanErrorMessage } from '../lib/cleanError.js';

const SYNC_LABELS = {
  idle: 'Neîncepută',
  exported: 'Exportată (blocată)',
  local_in_progress: 'În desfășurare local',
  results_uploaded: 'Rezultate încărcate',
  completed: 'Finalizată',
};

export default function EventPickerPage({ onBack, onSelect }) {
  const [events, setEvents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    window.launcher
      .listEvents()
      .then((list) => {
        if (!cancelled) setEvents(list);
      })
      .catch((err) => {
        if (!cancelled) setError(cleanErrorMessage(err, 'Nu s-au putut încărca evenimentele.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = events.find((ev) => ev.id === selectedId) || null;
  const alreadyLocked = selected?.sync_locked;
  // These two statuses mean a local machine (this one, most likely, if the
  // operator is back here after the launcher crashed/closed mid-event) has
  // real competition data - live scores, completed matches - that a fresh
  // cloud pull would overwrite with a stale pre-event snapshot. Only
  // 'exported' (locked, but the import never actually completed - e.g. an
  // earlier attempt failed before mark-local-in-progress ran) has nothing
  // local at risk yet, so a full sync stays the right, safe action there.
  const reconnectOnly = selected?.local_sync_status === 'local_in_progress'
    || selected?.local_sync_status === 'results_uploaded';

  return (
    <div className="card card--wide">
      <h1>Alege evenimentul</h1>
      <p className="subtitle">Selectează competiția care se desfășoară azi la această locație.</p>

      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <p>Se încarcă…</p>
      ) : events.length === 0 ? (
        <p>Nu există competiții disponibile.</p>
      ) : (
        <ul className="event-list">
          {events.map((ev) => (
            <li
              key={ev.id}
              className={`event-item${selectedId === ev.id ? ' selected' : ''}`}
              onClick={() => setSelectedId(ev.id)}
            >
              <div>
                <div className="event-name">{ev.name}</div>
                <div className="event-meta">
                  {ev.city_name || ev.city || ev.place || '—'} · {ev.start_date}
                </div>
              </div>
              <span className="badge">{SYNC_LABELS[ev.local_sync_status] || ev.local_sync_status}</span>
            </li>
          ))}
        </ul>
      )}

      {selected?.sync_locked && (
        <div className="error-box" style={{ marginTop: 16 }}>
          {reconnectOnly ? (
            <>
              Acest eveniment rulează deja local (status: {SYNC_LABELS[selected.local_sync_status]}) - probabil
              aplicația a fost închisă sau a crăpat. „Reconectează-te” repornește aplicațiile pe acest calculator
              fără să descarce sau să suprascrie ceva din ce s-a înregistrat deja. Dacă evenimentul a fost de fapt
              exportat pe <strong>alt</strong> calculator, nu continua aici — mergi la acela.
            </>
          ) : (
            <>
              Acest eveniment este deja blocat pentru sincronizare locală (status: {SYNC_LABELS[selected.local_sync_status]}).
              Dacă a fost deja exportat pe alt calculator, continuă acolo — nu-l importa din nou aici.
            </>
          )}
        </div>
      )}

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn-secondary" onClick={onBack} type="button">
          Înapoi
        </button>
        <button
          className="btn-primary"
          disabled={!selected}
          onClick={() => onSelect(selected)}
          type="button"
        >
          {reconnectOnly ? 'Reconectează-te' : alreadyLocked ? 'Continuă oricum' : 'Sincronizează local'}
        </button>
      </div>
    </div>
  );
}
