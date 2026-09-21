import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { competitionAPI, offlineAPI } from '@shared/lib/api';
import { getSyncLockMeta, getSyncModeMeta, getSyncStatusMeta } from '@shared/lib/syncStatus';
import { PageHeader, Card, StatusBadge, Spinner, Badge, Button, Switch } from '../components/ui';
import { cn } from '../lib/utils';

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function CompetitionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [comp, setComp] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const syncStatusMeta = getSyncStatusMeta(comp);
  const syncModeMeta = getSyncModeMeta(comp);
  const syncLockMeta = getSyncLockMeta(comp);

  const loadCompetition = () => Promise.all([
    competitionAPI.get(id),
    competitionAPI.stats(id).catch(() => ({ data: null })),
  ]).then(([compRes, statsRes]) => {
    setComp(compRes.data);
    setStats(statsRes.data);
  });

  useEffect(() => {
    loadCompetition().finally(() => setLoading(false));
  }, [id]);

  const handleDownloadEventPack = async () => {
    setBusy(true);
    setMessage('');
    try {
      const { data } = await offlineAPI.eventPack(id);
      downloadJson(`event-pack-${id}.json`, data);
      await loadCompetition();
      setMessage('Event pack exportat cu succes. Evenimentul a fost blocat pentru operare locală.');
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Exportul event pack a eșuat.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadEventResults = async () => {
    setBusy(true);
    setMessage('');
    try {
      const { data } = await offlineAPI.eventResults(id);
      downloadJson(`event-results-${id}.json`, data);
      setMessage('Rezultatele locale au fost exportate cu succes.');
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Exportul rezultatelor a eșuat.');
    } finally {
      setBusy(false);
    }
  };

  const handleImportResults = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    setMessage('');
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      await offlineAPI.importEventResults(payload);
      await loadCompetition();
      setMessage('Rezultatele locale au fost importate în cloud.');
    } catch (error) {
      setMessage(error.response?.data?.detail || error.message || 'Importul rezultatelor a eșuat.');
    } finally {
      setBusy(false);
    }
  };

  const handleTogglePublicVisibility = async (checked) => {
    setBusy(true);
    setMessage('');
    try {
      await competitionAPI.update(id, { is_publicly_visible: checked });
      await loadCompetition();
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Schimbarea vizibilității a eșuat.');
    } finally {
      setBusy(false);
    }
  };

  const handleCompleteLocalSync = async () => {
    setBusy(true);
    setMessage('');
    try {
      await competitionAPI.completeLocalSync(id);
      await loadCompetition();
      setMessage('Sincronizarea locală a fost finalizată. Evenimentul a fost deblocat pentru cloud.');
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Finalizarea sincronizării a eșuat.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!comp) return <p className="py-20 text-center text-muted-foreground">Competition not found.</p>;

  const syncBadgeClass = 'rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide';

  return (
    <>
      <PageHeader title={comp.name} subtitle={comp.location}>
        <StatusBadge status={comp.status} />
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2">
        <Badge className={cn(syncBadgeClass, syncStatusMeta.className)}>{syncStatusMeta.label}</Badge>
        <Badge className={cn(syncBadgeClass, syncModeMeta.className)}>{syncModeMeta.label}</Badge>
        <Badge className={cn(syncBadgeClass, syncLockMeta.className)}>{syncLockMeta.label}</Badge>
      </div>

      {message && (
        <div className="mb-6 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          {typeof message === 'string' ? message : JSON.stringify(message)}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Details card */}
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Details</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Start Date</dt>
              <dd className="font-medium text-foreground">{comp.start_date}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">End Date</dt>
              <dd className="font-medium text-foreground">{comp.end_date || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Location</dt>
              <dd className="font-medium text-foreground">{comp.location || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Organizer</dt>
              <dd className="font-medium text-foreground">{comp.organizer_name || '—'}</dd>
            </div>
          </dl>
          {comp.description && (
            <p className="mt-4 text-sm text-muted-foreground">{comp.description}</p>
          )}
          <div className="mt-4 flex items-center justify-between rounded-md border border-border px-3 py-2.5">
            <div>
              <span className="block text-sm font-medium text-foreground">Vizibil public</span>
              <span className="text-xs text-muted-foreground">Afișează acest eveniment pe site-ul public.</span>
            </div>
            <Switch
              checked={comp.is_publicly_visible}
              disabled={busy}
              onCheckedChange={handleTogglePublicVisibility}
            />
          </div>
        </Card>

        {/* Stats card */}
        <Card className="p-5">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Statistics</h2>
          {stats ? (
            <div className="space-y-3 text-sm">
              {Object.entries(stats).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="capitalize text-muted-foreground">{key.replace(/_/g, ' ')}</span>
                  <span className="font-semibold text-foreground">{value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No statistics available.</p>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Local Sync</h2>
          <div className="space-y-2 text-sm text-foreground">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Mode</span>
              <Badge className={cn('rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide', syncModeMeta.className)}>{syncModeMeta.label}</Badge>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Locked</span>
              <Badge className={cn('rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide', syncLockMeta.className)}>{syncLockMeta.label}</Badge>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Sync status</span>
              <Badge className={cn('rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide', syncStatusMeta.className)}>{syncStatusMeta.label}</Badge>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{syncStatusMeta.description}</p>

          <div className="mt-5 space-y-3">
            <Button onClick={handleDownloadEventPack} disabled={busy} className="w-full bg-blue-600 text-white hover:bg-blue-700">
              Export Event Pack
            </Button>
            <Button onClick={handleDownloadEventResults} disabled={busy} variant="secondary" className="w-full">
              Export Local Results
            </Button>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Import Results JSON</span>
              <input
                type="file"
                accept="application/json"
                onChange={handleImportResults}
                disabled={busy}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-secondary-foreground hover:file:bg-secondary/80"
              />
            </label>
            <Button
              onClick={handleCompleteLocalSync}
              disabled={busy || !['results_uploaded', 'completed'].includes(comp.local_sync_status)}
              className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Complete Sync &amp; Unlock
            </Button>
          </div>
        </Card>
      </div>

      {/* Quick links */}
      <div className="mt-6 flex gap-3">
        <Button as={Link} to={`/competitions/${id}/categories`} className="bg-blue-600 text-white hover:bg-blue-700">
          Manage Categories
        </Button>
        <Button as={Link} to={`/competitions/${id}/fields`} variant="secondary">
          Manage Fields
        </Button>
        <Button as={Link} to={`/competitions/${id}/categories/sync`} variant="secondary">
          Sync Center
        </Button>
        <Button as={Link} to={`/competitions/${id}/results`} variant="secondary">
          View Results
        </Button>
      </div>
    </>
  );
}
