import { useEffect, useRef, useState } from 'react';
import { cleanErrorMessage } from '../lib/cleanError.js';

export default function SyncToCloudPage({ event, onBack, onDone }) {
  const [lines, setLines] = useState(['Se pregătește sincronizarea în cloud…']);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const started = useRef(false);
  const logRef = useRef(null);

  function appendLine(line) {
    setLines((prev) => [...prev, line]);
  }

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines]);

  useEffect(() => {
    const offProgress = window.launcher.onSyncProgress(({ direction, message }) => {
      if (direction === 'cloud') appendLine(message);
    });
    return () => offProgress();
  }, []);

  async function runSync() {
    setError('');
    setRunning(true);
    try {
      await window.launcher.syncToCloud(event.id);
      appendLine('Gata! Rezultatele sunt în cloud, sincronizarea a fost finalizată.');
      setFinished(true);
    } catch (err) {
      setError(cleanErrorMessage(err, 'Sincronizarea în cloud a eșuat.'));
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

  async function finish() {
    await window.launcher.stopServices();
    onDone();
  }

  return (
    <div className="card card--wide">
      <h1>Sincronizare în cloud</h1>
      <p className="subtitle">
        Se trimit rezultatele evenimentului „{event?.name}” înapoi în cloud.
      </p>

      {error && <div className="error-box">{error}</div>}

      <div className="progress-log" ref={logRef}>
        {lines.join('\n')}
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn-secondary" onClick={onBack} type="button" disabled={running}>
          Înapoi
        </button>
        {error && !finished && (
          <button className="btn-primary" onClick={runSync} type="button">
            Reîncearcă
          </button>
        )}
        {finished && (
          <button className="btn-primary" onClick={finish} type="button">
            Oprește stiva locală și încheie
          </button>
        )}
      </div>
    </div>
  );
}
