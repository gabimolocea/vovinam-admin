import { useCallback, useEffect, useState } from 'react';
import { localBackupAPI, systemAPI } from '@shared/lib/api';
import { Card, Button, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui';

const TRIGGER_LABELS = {
  manual: { label: 'Manual', className: 'border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300' },
  scheduled: { label: 'Automat', className: 'border-transparent bg-muted text-muted-foreground' },
  pre_import: { label: 'Înainte de import', className: 'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300' },
  pre_restore_safety: { label: 'Siguranță (înainte de restaurare)', className: 'border-transparent bg-purple-100 text-purple-900 dark:bg-purple-950/40 dark:text-purple-300' },
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
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Backup &amp; restaurare (mașina timpului)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {intervalMinutes
              ? `Un backup automat se salvează la fiecare ${intervalMinutes} minute. `
              : ''}
            Poți oricând reveni la o versiune anterioară a bazei de date, dacă apare o greșeală.
          </p>
        </div>
        <Button onClick={handleBackupNow} disabled={busy}>
          Backup acum
        </Button>
      </div>

      {message && (
        <div className="mt-4 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          {message}
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        {backups.length ? (
          <Table className="min-w-[560px]">
            <TableHeader>
              <TableRow>
                <TableHead>Moment</TableHead>
                <TableHead>Tip</TableHead>
                <TableHead>Mărime</TableHead>
                <TableHead>Notă</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.map((backup) => {
                const trigger = TRIGGER_LABELS[backup.trigger] || { label: backup.trigger, className: 'border-transparent bg-muted text-muted-foreground' };
                return (
                  <TableRow key={backup.filename}>
                    <TableCell>
                      <div className="font-semibold text-foreground">{relativeTime(backup.created_at)}</div>
                      <div className="text-xs text-muted-foreground">{new Date(backup.created_at).toLocaleString('ro-RO')}</div>
                    </TableCell>
                    <TableCell>
                      <Badge className={trigger.className}>{trigger.label}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatSize(backup.size_bytes)}</TableCell>
                    <TableCell className="text-muted-foreground">{backup.label || '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="destructive" size="sm" onClick={() => handleRestore(backup)} disabled={busy}>
                        Restaurează
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">Nu există încă niciun backup. Apasă „Backup acum” pentru primul.</p>
        )}
      </div>
    </Card>
  );
}
