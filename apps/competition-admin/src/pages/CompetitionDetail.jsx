import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { competitionAPI, offlineAPI } from '@shared/lib/api';
import { PageHeader, Card, StatusBadge, Spinner } from '@shared/components/ui';
import { getSyncLockMeta, getSyncModeMeta, getSyncStatusMeta } from '@shared/lib/syncStatus';

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
  if (!comp) return <p className="py-20 text-center text-gray-500">Competition not found.</p>;

  return (
    <>
      <PageHeader title={comp.name} subtitle={comp.location}>
        <StatusBadge status={comp.status} />
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2">
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${syncStatusMeta.className}`}>
          {syncStatusMeta.label}
        </span>
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${syncModeMeta.className}`}>
          {syncModeMeta.label}
        </span>
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${syncLockMeta.className}`}>
          {syncLockMeta.label}
        </span>
      </div>

      {message && (
        <div className="mb-6 rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          {typeof message === 'string' ? message : JSON.stringify(message)}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Details card */}
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold">Details</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-gray-500">Start Date</dt>
              <dd className="font-medium">{comp.start_date}</dd>
            </div>
            <div>
              <dt className="text-gray-500">End Date</dt>
              <dd className="font-medium">{comp.end_date || '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Location</dt>
              <dd className="font-medium">{comp.location || '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Organizer</dt>
              <dd className="font-medium">{comp.organizer_name || '—'}</dd>
            </div>
          </dl>
          {comp.description && (
            <p className="mt-4 text-sm text-gray-600">{comp.description}</p>
          )}
        </Card>

        {/* Stats card */}
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Statistics</h2>
          {stats ? (
            <div className="space-y-3 text-sm">
              {Object.entries(stats).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="capitalize text-gray-500">{key.replace(/_/g, ' ')}</span>
                  <span className="font-semibold">{value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No statistics available.</p>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold">Local Sync</h2>
          <div className="space-y-2 text-sm text-gray-700">
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">Mode</span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${syncModeMeta.className}`}>{syncModeMeta.label}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">Locked</span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${syncLockMeta.className}`}>{syncLockMeta.label}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">Sync status</span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${syncStatusMeta.className}`}>{syncStatusMeta.label}</span>
            </div>
          </div>
          <p className="mt-4 text-sm text-gray-600">{syncStatusMeta.description}</p>

          <div className="mt-5 space-y-3">
            <button
              type="button"
              onClick={handleDownloadEventPack}
              disabled={busy}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Export Event Pack
            </button>
            <button
              type="button"
              onClick={handleDownloadEventResults}
              disabled={busy}
              className="w-full rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Export Local Results
            </button>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Import Results JSON</span>
              <input
                type="file"
                accept="application/json"
                onChange={handleImportResults}
                disabled={busy}
                className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-200 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-gray-700 hover:file:bg-gray-300"
              />
            </label>
            <button
              type="button"
              onClick={handleCompleteLocalSync}
              disabled={busy || !['results_uploaded', 'completed'].includes(comp.local_sync_status)}
              className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Complete Sync & Unlock
            </button>
          </div>
        </Card>
      </div>

      {/* Quick links */}
      <div className="mt-6 flex gap-3">
        <Link
          to={`/competitions/${id}/categories`}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Manage Categories
        </Link>
        <Link
          to={`/competitions/${id}/fields`}
          className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300"
        >
          Manage Fields
        </Link>
        <Link
          to={`/competitions/${id}/categories/sync`}
          className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300"
        >
          Sync Center
        </Link>
        <Link
          to={`/competitions/${id}/results`}
          className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300"
        >
          View Results
        </Link>
      </div>
    </>
  );
}
