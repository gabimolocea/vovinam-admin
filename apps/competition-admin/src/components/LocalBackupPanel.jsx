import { useCallback, useEffect, useState } from 'react';
import { localBackupAPI, systemAPI } from '@shared/lib/api';
import { Card } from '@shared/components/ui';

const TRIGGER_LABELS = {
  manual: { label: 'Manual', className: 'bg-blue-100 text-blue-800' },
  scheduled: { label: 'Automat', className: 'bg-gray-100 text-gray-700' },
  pre_import: { label: 'Înainte de import', className: 'bg-amber-100 text-amber-900' },
  pre_restore_safety: { label: 'Siguranță (înainte de restaurare)', className: 'bg-purple-100 text-purple-900' },
};

function relativeTime(isoString) {
  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) return isoString;
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'chiar acum';
  if (minutes < 60) return `acum ${minutes} minut${minutes === 1 ? '' : 'e'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `acum ${hours} ${hours === 1 ? 'oră' : 'ore'}`;
  const days = Math.round(hours / 24);
  return `acum ${days} zi${days === 1 ? '' : 'le'}`;
}

function formatSize(bytes) {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.round(bytes / 1024)} KB`;
  return `${mb.toFixed(1)} MB`;
}

/**
 * Backup & restore ("time travel") panel for the local venue/LAN server.
 * Renders nothing when the connected backend is not the local event server
 * (e.g. the normal cloud deployment), so it never shows up by accident.
 */
export default function LocalBackupPanel() {
  const [isLocalServer, setIsLocalServer] = useState(null); // null = not checked yet
  const [intervalMinutes, setIntervalMinutes] = useState(null);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const loadBackups = useCallback(async () => {
    try {
      const { data } = await localBackupAPI.list();
      setBackups(data.backups || []);
      setIntervalMinutes(data.interval_minutes);
    } catch {
      // Panel already checked is_local_event_server before rendering the list,
      // so a failure here just means "no backups yet" / transient error.
      setBackups([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await systemAPI.info();
        if (cancelled) return;
        setIsLocalServer(Boolean(data.is_local_event_server));
        if (data.is_local_event_server) {
          await loadBackups();
        }
      } catch {
        if (!cancelled) setIsLocalServer(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadBackups]);

  // Refresh the list periodically so scheduled/automatic backups show up
  // without the operator needing to reload the page.
  useEffect(() => {
    if (!isLocalServer) return undefined;
    const timer = setInterval(loadBackups, 30000);
    return () => clearInterval(timer);
  }, [isLocalServer, loadBackups]);

  async function handleBackupNow() {
    setBusy(true);
    setMessage('');
    try {
      await localBackupAPI.create('manual');
      await loadBackups();
      setMessage('Backup creat cu succes.');
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Backup-ul a eșuat.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore(backup) {
    const when = relativeTime(backup.created_at);
    const confirmed = window.confirm(
      `Sigur vrei să restaurezi baza de date la starea de ${when}?\n\n` +
      'Tot ce s-a întâmplat DUPĂ acel moment va fi înlocuit. ' +
      'Nu-ți face griji: înainte de restaurare se creează automat un backup de siguranță al stării actuale, ' +
      'așa că poți reveni oricând și la ea.'
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage('');
    try {
      const { data } = await localBackupAPI.restore(backup.filename);
      await loadBackups();
      setMessage(`Restaurare reușită la starea de ${when}. Backup de siguranță salvat: ${data.safety_backup}.`);
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Restaurarea a eșuat.');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !isLocalServer) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Backup &amp; restaurare (mașina timpului)</h2>
          <p className="mt-1 text-sm text-gray-600">
            {intervalMinutes
              ? `Un backup automat se salvează la fiecare ${intervalMinutes} minute. `
              : ''}
            Poți oricând reveni la o versiune anterioară a bazei de date, dacă apare o greșeală.
          </p>
        </div>
        <button
          type="button"
          onClick={handleBackupNow}
          disabled={busy}
          className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          Backup acum
        </button>
      </div>

      {message && (
        <div className="mt-4 rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          {message}
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        {backups.length ? (
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                <th className="pb-2 pr-3">Moment</th>
                <th className="pb-2 pr-3">Tip</th>
                <th className="pb-2 pr-3">Mărime</th>
                <th className="pb-2 pr-3">Notă</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {backups.map((backup) => {
                const trigger = TRIGGER_LABELS[backup.trigger] || { label: backup.trigger, className: 'bg-gray-100 text-gray-700' };
                return (
                  <tr key={backup.filename}>
                    <td className="py-2 pr-3">
                      <div className="font-semibold text-gray-900">{relativeTime(backup.created_at)}</div>
                      <div className="text-xs text-gray-500">{new Date(backup.created_at).toLocaleString('ro-RO')}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${trigger.className}`}>
                        {trigger.label}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-gray-700">{formatSize(backup.size_bytes)}</td>
                    <td className="py-2 pr-3 text-gray-500">{backup.label || '—'}</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleRestore(backup)}
                        disabled={busy}
                        className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Restaurează
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">Nu există încă niciun backup. Apasă „Backup acum” pentru primul.</p>
        )}
      </div>
    </Card>
  );
}
