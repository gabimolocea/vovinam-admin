import { useEffect, useRef, useState } from 'react';
import { cleanErrorMessage } from '../lib/cleanError.js';

export default function SyncToCloudPage({ event, onBack, onDone }) {
  const [lines, setLines] = useState(['Se pregătește sincronizarea în cloud…']);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState('');
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

  // Just pushes results - safe to run again later in the day (another
  // batch of matches finished, a correction was made) without touching
  // the event's lock. Finalizing (below) is a deliberate, separate step.
  async function runSync() {
    setError('');
    setRunning(true);
    try {
      await window.launcher.syncToCloud(event.id);
      appendLine('Gata! Rezultatele au fost trimise în cloud.');
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

  // The actual one-way, one-time step: unlocks the event on cloud
  // (landing.models.Event.complete_local_sync) so it goes back to normal
  // cloud operation. After this, no more results can be pushed from this
  // machine for this event - only do it once the competition is truly over.
  async function completeAndFinish() {
    setCompleteError('');
    setCompleting(true);
    try {
      await window.launcher.completeSync(event.id);
      appendLine('Sincronizarea a fost finalizată - evenimentul a revenit în modul cloud.');
      await window.launcher.stopServices();
      onDone();
    } catch (err) {
      setCompleteError(cleanErrorMessage(err, 'Finalizarea sincronizării a eșuat.'));
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div className="card card--wide">
      <h1>Sincronizare în cloud</h1>
      <p className="subtitle">
        Se trimit rezultatele evenimentului „{event?.name}” înapoi în cloud.
      </p>

      {error && <div className="error-box">{error}</div>}
      {completeError && <div className="error-box">{completeError}</div>}

      <div className="progress-log" ref={logRef}>
        {lines.join('\n')}
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn-secondary" onClick={onBack} type="button" disabled={running || completing}>
          Înapoi
        </button>
        {error && (
          <button className="btn-primary" onClick={runSync} type="button" disabled={running}>
            Reîncearcă
          </button>
        )}
        {finished && !error && (
          <button className="btn-secondary" onClick={runSync} type="button" disabled={running}>
            Retrimite rezultatele
          </button>
        )}
      </div>

      {finished && (
        <>
          <p className="footer-note" style={{ marginTop: 16 }}>
            Poți retrimite rezultatele oricând mai apoi (ex. după alte meciuri terminate), fără riscuri.
            Apasă „Finalizează” <strong>doar</strong> când competiția s-a încheiat de tot - după aceea nu
            mai poți trimite rezultate pentru acest eveniment de pe acest calculator.
          </p>
          <div className="row">
            <button className="btn-primary" onClick={completeAndFinish} type="button" disabled={completing}>
              {completing ? 'Se finalizează…' : 'Finalizează și oprește stiva locală'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
