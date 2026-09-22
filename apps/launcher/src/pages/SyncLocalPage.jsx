import { useEffect, useRef, useState } from 'react';
import { cleanErrorMessage } from '../lib/cleanError.js';

// One continuous flow: (optionally choose a database engine, when Docker
// is available), start/reuse the local stack, provision the local admin
// account to match the cloud login, then pull the event down. No separate
// local password to enter - see services.js#ensureLocalAdmin.
export default function SyncLocalPage({ event, onBack, onDone }) {
  // See EventPickerPage's own reconnectOnly - an event already this far
  // along has real local competition data (live scores, completed
  // matches) that a fresh cloud pull would overwrite with a stale
  // pre-event snapshot. Reconnecting just restarts the local apps against
  // whatever's already on this machine, without touching cloud or local
  // data at all.
  const reconnectOnly = event?.local_sync_status === 'local_in_progress'
    || event?.local_sync_status === 'results_uploaded';

  const [lines, setLines] = useState([
    reconnectOnly ? 'Se repornesc aplicațiile locale…' : 'Se pregătește sincronizarea locală…',
  ]);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const started = useRef(false);
  const logRef = useRef(null);

  // Database choice - only offered when Docker is actually available.
  // null = still checking; false = Docker unavailable (SQLite only,
  // auto-starts as before); true = available, operator must pick.
  const [dockerAvailable, setDockerAvailable] = useState(null);
  const [useDocker, setUseDocker] = useState(true);
  const [choiceMade, setChoiceMade] = useState(false);

  function appendLine(line) {
    setLines((prev) => [...prev, line]);
  }

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines]);

  useEffect(() => {
    const offLog = window.launcher.onServiceLog(({ id, line }) => {
      const trimmed = line.trim();
      if (trimmed) appendLine(`[${id}] ${trimmed}`);
    });
    const offStatus = window.launcher.onServiceStatus(({ id, status }) => {
      appendLine(`[${id}] status: ${status}`);
    });
    const offProgress = window.launcher.onSyncProgress(({ direction, message }) => {
      if (direction === 'local') appendLine(message);
    });
    return () => {
      offLog();
      offStatus();
      offProgress();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    window.launcher.isDockerAvailable()
      .then((available) => { if (!cancelled) setDockerAvailable(available); })
      .catch(() => { if (!cancelled) setDockerAvailable(false); });
    return () => { cancelled = true; };
  }, []);

  async function runSync() {
    setError('');
    setRunning(true);
    try {
      const info = await window.launcher.startLocalStack(useDocker);
      if (reconnectOnly) {
        appendLine('Evenimentul rulează deja local — se sare peste descărcare și import, ca să nu se suprascrie ce e deja pe acest calculator.');
      } else {
        appendLine('Se descarcă evenimentul din cloud…');
        const outcome = await window.launcher.startLocalSync(event.id);
        // The cloud event's status said this was a fresh import, but the
        // local server reports a competition already under way here - the
        // import was refused rather than overwriting it.
        if (outcome?.status === 'skipped_local_results') {
          const details = Object.entries(outcome.summary || {})
            .filter(([, count]) => count)
            .map(([key, count]) => `${key}: ${count}`)
            .join(' · ');
          appendLine('Importul a fost oprit: acest calculator are deja rezultate pentru acest eveniment.');
          if (details) appendLine(`Găsit local: ${details}`);
          appendLine('S-a făcut reconectare la datele locale existente, fără să se suprascrie nimic.');
        }
      }
      appendLine('Gata! Stiva locală rulează cu datele evenimentului.');
      onDone(info);
    } catch (err) {
      setError(cleanErrorMessage(err, 'Sincronizarea locală a eșuat.'));
    } finally {
      setRunning(false);
    }
  }

  // Auto-start immediately once we know there's no real choice to make
  // (Docker unavailable → SQLite is the only option, same zero-friction
  // behavior as before this feature existed). When Docker IS available,
  // wait for the operator's explicit pick instead (see the choice screen
  // below) - a real event's database engine isn't a decision to make
  // silently on their behalf.
  useEffect(() => {
    if (started.current) return;
    if (dockerAvailable === null) return;
    if (dockerAvailable === false) {
      started.current = true;
      setUseDocker(false);
      runSync();
      return;
    }
    if (choiceMade) {
      started.current = true;
      runSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dockerAvailable, choiceMade]);

  if (dockerAvailable === null) {
    return (
      <div className="card card--wide">
        <h1>Sincronizare locală</h1>
        <p className="subtitle">Se verifică ce e disponibil pe acest calculator…</p>
      </div>
    );
  }

  if (dockerAvailable && !choiceMade) {
    return (
      <div className="card card--wide">
        <h1>Bază de date pentru acest eveniment</h1>
        <p className="subtitle">
          Docker e disponibil pe acest calculator. Alege ce bază de date folosește serverul local pentru „{event?.name}”.
        </p>
        {reconnectOnly && (
          <div className="error-box" style={{ marginBottom: 16 }}>
            Alege aceeași opțiune pe care ai folosit-o prima dată pentru acest eveniment pe acest calculator — dacă
            aplicațiile locale rulează deja, alegerea de aici nu contează (se reconectează la ce rulează); dacă nu
            mai rulează (ex. calculatorul a repornit), alegerea greșită pornește un server gol, fără datele evenimentului.
          </div>
        )}

        <div className="db-choice">
          <label className={`db-choice-option ${useDocker ? 'selected' : ''}`}>
            <input type="radio" name="db-engine" checked={useDocker} onChange={() => setUseDocker(true)} />
            <div>
              <strong>PostgreSQL (Docker) — recomandat</strong>
              <p>Aceeași versiune ca producția, backup automat la 15 minute. Recomandat pentru concursuri reale, cu mai multe terenuri active simultan.</p>
            </div>
          </label>
          <label className={`db-choice-option ${!useDocker ? 'selected' : ''}`}>
            <input type="radio" name="db-engine" checked={!useDocker} onChange={() => setUseDocker(false)} />
            <div>
              <strong>SQLite (simplu, rapid)</strong>
              <p>Fără nimic de pornit în plus. Suficient pentru teste sau un concurs mic, cu un singur teren activ la un moment dat.</p>
            </div>
          </label>
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn-secondary" onClick={onBack} type="button">
            Înapoi
          </button>
          <button className="btn-primary" onClick={() => setChoiceMade(true)} type="button">
            Continuă
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card card--wide">
      <h1>{reconnectOnly ? 'Reconectare' : 'Sincronizare locală'}</h1>
      <p className="subtitle">
        {reconnectOnly
          ? `Se repornesc aplicațiile pentru „${event?.name}” pe acest calculator, fără să se descarce sau suprascrie nimic`
          : `Se descarcă „${event?.name}” din cloud și se pornesc aplicațiile pe acest calculator`}
        {useDocker ? ' (PostgreSQL, prin Docker)' : ' (SQLite)'}.
      </p>

      {error && <div className="error-box">{error}</div>}

      <div className="progress-log" ref={logRef}>
        {lines.join('\n')}
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn-secondary" onClick={onBack} type="button" disabled={running}>
          Înapoi
        </button>
        {error && (
          <button className="btn-primary" onClick={runSync} type="button">
            Reîncearcă
          </button>
        )}
      </div>
    </div>
  );
}
