import { useEffect, useRef, useState } from 'react';
import { cleanErrorMessage } from '../lib/cleanError.js';

// One continuous flow: start (or reuse) the local stack, provision the
// local admin account to match the cloud login, then pull the event down.
// No separate local password to enter - see services.js#ensureLocalAdmin.
export default function SyncLocalPage({ event, onBack, onDone }) {
  const [lines, setLines] = useState(['Se pregătește sincronizarea locală…']);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const started = useRef(false);
  const logRef = useRef(null);

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

  async function runSync() {
    setError('');
    setRunning(true);
    try {
      const info = await window.launcher.startLocalStack();
      appendLine('Se descarcă evenimentul din cloud…');
      await window.launcher.startLocalSync(event.id);
      appendLine('Gata! Stiva locală rulează cu datele evenimentului.');
      onDone(info);
    } catch (err) {
      setError(cleanErrorMessage(err, 'Sincronizarea locală a eșuat.'));
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    runSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card card--wide">
      <h1>Sincronizare locală</h1>
      <p className="subtitle">
        Se descarcă „{event?.name}” din cloud și se pornesc aplicațiile pe acest calculator.
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
