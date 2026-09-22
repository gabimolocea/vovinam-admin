import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { competitionAPI, offlineAPI, systemAPI } from '@shared/lib/api';
import { getSyncLockMeta, getSyncModeMeta, getSyncStatusMeta } from '@shared/lib/syncStatus';
import { PageHeader, Card, Spinner, Button, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui';
import { cn } from '../lib/utils';
import LocalBackupPanel from '../components/LocalBackupPanel';

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

function formatDateTime(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('ro-RO');
}

// Human labels for the per-section counts import_event_results returns -
// see backend/api/sync/import_event_results.py's `imported` dict.
const IMPORTED_SECTION_LABELS = {
  category_results: 'Rezultate categorii',
  category_athletes: 'Sportivi (loc/greutate)',
  category_teams: 'Echipe',
  matches: 'Meciuri',
  match_rounds: 'Reprize',
  match_events: 'Evenimente meci',
  point_events: 'Puncte arbitri',
  match_referee_scores: 'Scoruri arbitri',
  fight_athlete_weights: 'Cântăriri',
};

function SyncLogPanel({ entries }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Nu există încă acțiuni de sincronizare în această sesiune.</p>;
  }
  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div key={entry.id} className={cn(
          'rounded-lg border px-4 py-3',
          entry.ok ? 'border-border bg-card' : 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/10',
        )}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-foreground">{entry.title}</span>
            <span className="text-xs text-muted-foreground">{formatDateTime(entry.time)}</span>
          </div>
          {entry.counts ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(entry.counts).filter(([, n]) => n > 0).map(([key, n]) => (
                <span key={key} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                  {IMPORTED_SECTION_LABELS[key] || key}: {n}
                </span>
              ))}
              {Object.values(entry.counts).every((n) => !n) && (
                <span className="text-xs text-muted-foreground">Nimic nou de sincronizat.</span>
              )}
            </div>
          ) : entry.detail ? (
            <p className="mt-1 text-sm text-muted-foreground">{entry.detail}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function SyncStep({ title, description, done, active }) {
  return (
    <div className={cn(
      'rounded-lg border px-4 py-3',
      active ? 'border-blue-500 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20' : done ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20' : 'border-border bg-card',
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          'mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
          done ? 'bg-emerald-600 text-white' : active ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground',
        )}>
          {done ? '✓' : '•'}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

function ActionButton({ children, className = '', ...props }) {
  return (
    <Button type="button" className={cn('w-full py-3 text-sm', className)} {...props}>
      {children}
    </Button>
  );
}

export default function SyncCenterPage() {
  const { id } = useParams();
  const [comp, setComp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [isLocalServer, setIsLocalServer] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);
  // What actually got synced this session - most useful right after
  // uploading local results, so it's obvious at a glance whether matches/
  // placements/weights really landed in cloud instead of silently failing.
  const [syncLog, setSyncLog] = useState([]);
  const logSync = (title, { counts, detail, ok = true } = {}) => {
    setSyncLog((prev) => [{ id: `${Date.now()}-${Math.random()}`, title, time: new Date().toISOString(), counts, detail, ok }, ...prev]);
  };

  const loadCompetition = async () => {
    const { data } = await competitionAPI.get(id);
    setComp(data);
  };

  useEffect(() => {
    loadCompetition().finally(() => setLoading(false));
  }, [id]);

  // Only the local venue server has an "import" side (it consumes an event
  // pack) and can attempt a direct cloud pull. The cloud instance never
  // shows these — this is the same is_local_event_server check used by
  // LocalBackupPanel.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await systemAPI.info();
        if (!cancelled) setIsLocalServer(Boolean(data.is_local_event_server));
      } catch {
        if (!cancelled) setIsLocalServer(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const steps = useMemo(() => {
    const status = comp?.local_sync_status || 'idle';
    return [
      {
        key: 'exported',
        title: '1. Export din cloud',
        description: 'Generează event pack și blochează evenimentul pentru operare locală.',
        done: ['exported', 'local_in_progress', 'results_uploaded', 'completed'].includes(status),
        active: status === 'idle',
      },
      {
        key: 'local',
        title: '2. Operare locală',
        description: 'Rulează competiția pe LAN și colectează toate rezultatele pe serverul local.',
        done: ['results_uploaded', 'completed'].includes(status),
        active: ['exported', 'local_in_progress'].includes(status),
      },
      {
        key: 'uploaded',
        title: '3. Import rezultate în cloud',
        description: 'Încarcă JSON-ul de rezultate din local și actualizează evenimentul în cloud.',
        done: ['results_uploaded', 'completed'].includes(status),
        active: status === 'exported',
      },
      {
        key: 'completed',
        title: '4. Finalizare și deblocare',
        description: 'Verifică rezultatele și finalizează sincronizarea pentru a reveni în cloud mode.',
        done: status === 'completed',
        active: status === 'results_uploaded',
      },
    ];
  }, [comp]);

  const syncStatusMeta = useMemo(() => getSyncStatusMeta(comp), [comp]);
  const syncModeMeta = useMemo(() => getSyncModeMeta(comp), [comp]);
  const syncLockMeta = useMemo(() => getSyncLockMeta(comp), [comp]);

  async function handleDownloadEventPack() {
    setBusy(true);
    setMessage('');
    try {
      const { data } = await offlineAPI.eventPack(id);
      downloadJson(`event-pack-${id}.json`, data);
      await loadCompetition();
      setMessage('Event pack exportat cu succes. Dacă mai revii la lucru local după un sync complet, folosește doar pachetul nou exportat.');
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Exportul event pack a eșuat.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadEventResults() {
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
  }

  async function handleMarkLocalInProgress() {
    setBusy(true);
    setMessage('');
    try {
      await competitionAPI.markLocalInProgress(id);
      await loadCompetition();
      setMessage('Evenimentul a fost marcat ca în desfășurare locală.');
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Marcarea operării locale a eșuat.');
    } finally {
      setBusy(false);
    }
  }

  async function handleImportEventPack(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    setMessage('');
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      await offlineAPI.importEventPack(payload);
      await loadCompetition();
      setMessage('Event pack-ul a fost importat cu succes pe acest server local.');
    } catch (error) {
      setMessage(error.response?.data?.detail || error.message || 'Importul event pack-ului a eșuat.');
    } finally {
      setBusy(false);
    }
  }

  function handlePullEventPackFromCloud() {
    setConfirmModal({
      title: 'Resincronizează din cloud',
      message: 'Se va prelua un event pack proaspăt direct din cloud (ex. cu un sportiv sau ' +
        'o categorie adăugată acolo de curând) și se va importa aici. Continui?',
      detail: 'Înainte de import se salvează automat un backup de siguranță, deci poți ' +
        'oricând reveni dacă ceva nu e cum trebuie.',
      icon: '☁️',
      color: 'orange',
      confirmLabel: 'Resincronizează',
      onConfirm: async () => {
        setBusy(true);
        setMessage('');
        try {
          await offlineAPI.pullEventPackFromCloud(id);
          await loadCompetition();
          setMessage('Resincronizare reușită: event pack-ul din cloud a fost importat aici.');
        } catch (error) {
          setMessage(error.response?.data?.detail || error.message || 'Resincronizarea din cloud a eșuat.');
        } finally {
          setBusy(false);
          setConfirmModal(null);
        }
      },
    });
  }

  async function handleImportResults(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    setMessage('');
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const { data } = await offlineAPI.importEventResults(payload);
      await loadCompetition();
      setMessage('Rezultatele locale au fost importate în cloud.');
      logSync('Rezultate importate în cloud', { counts: data?.imported });
    } catch (error) {
      const detail = error.response?.data?.detail
        || (error.response?.data && JSON.stringify(error.response.data))
        || error.message
        || 'Importul rezultatelor a eșuat.';
      setMessage(detail);
      logSync('Import rezultate eșuat', { detail, ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function handleCompleteLocalSync() {
    setBusy(true);
    setMessage('');
    try {
      await competitionAPI.completeLocalSync(id);
      await loadCompetition();
      setMessage('Sincronizarea locală a fost finalizată. Dacă mai vrei modificări locale, pornește un ciclu nou printr-un export nou de event pack.');
      logSync('Sincronizare finalizată', { detail: 'Evenimentul a revenit în modul cloud.' });
    } catch (error) {
      const detail = error.response?.data?.detail || 'Finalizarea sincronizării a eșuat.';
      setMessage(detail);
      logSync('Finalizare eșuată', { detail, ok: false });
    } finally {
      setBusy(false);
    }
  }

  const currentStage = comp?.local_sync_status || 'idle';

  const primaryAction = useMemo(() => {
    if (!comp) return null;

    if (currentStage === 'idle') {
      return {
        title: 'Pasul 1: exportă competiția pentru lucru local',
        description: 'Apasă pe export, descarcă fișierul event pack și mută-l pe calculatorul sau serverul din sală. După acest pas, evenimentul se blochează în cloud ca să nu apară modificări paralele.',
        note: 'Folosește acest pas înainte să înceapă competiția locală.',
        actionLabel: '1. Exportă event pack',
        action: handleDownloadEventPack,
        disabled: busy,
        className: 'bg-blue-600 text-white hover:bg-blue-700',
      };
    }

    if (currentStage === 'exported') {
      return {
        title: 'Pasul 2: confirmă că a început lucrul local',
        description: 'După ce ai pornit aplicațiile din sală și lucrezi doar local, marchează competiția ca „în desfășurare local”. Asta clarifică faptul că operatorii folosesc varianta LAN.',
        note: 'Dacă nu ai început încă în sală, poți rămâne în acest pas.',
        actionLabel: '2. Marchează operarea locală',
        action: handleMarkLocalInProgress,
        disabled: busy,
        className: 'bg-amber-500 text-white hover:bg-amber-600',
      };
    }

    if (currentStage === 'local_in_progress') {
      return {
        title: 'Pasul 3: exportă rezultatele din local și încarcă-le aici',
        description: 'La finalul competiției, exportă din aplicația locală fișierul de rezultate JSON. Revii aici și îl încarci ca să aduci rezultatele în cloud.',
        note: 'Dacă ai deja JSON-ul exportat din local, folosește imediat zona de import de mai jos.',
        actionLabel: null,
      };
    }

    if (currentStage === 'results_uploaded') {
      return {
        title: 'Pasul 4: verifică și finalizează sincronizarea',
        description: 'Rezultatele au ajuns în cloud. Dacă sunt corecte, finalizează sincronizarea ca evenimentul să revină în modul normal de administrare.',
        note: 'Poți deschide și pagina de rezultate înainte de finalizare.',
        actionLabel: '4. Finalizează și deblochează',
        action: handleCompleteLocalSync,
        disabled: busy,
        className: 'bg-green-600 text-white hover:bg-green-700',
      };
    }

    return {
      title: 'Sincronizarea este terminată',
      description: 'Evenimentul a revenit în cloud. Poți verifica rezultatele, continua administrarea normală sau porni un nou ciclu de sync dacă mai vrei să lucrezi local.',
      note: 'Dacă vrei încă o rundă de lucru local, exportă din nou un event pack nou, apoi folosește doar acel pachet nou.',
      actionLabel: 'Pornește un nou ciclu de sync',
      action: handleDownloadEventPack,
      disabled: busy,
      className: 'bg-blue-600 text-white hover:bg-blue-700',
    };
  }, [busy, comp, currentStage]);

  // Only actions NOT already offered as the big primary-action button above
  // belong here - showing the exact same button twice on one page is the
  // opposite of simple.
  const visibleActions = useMemo(() => {
    if (currentStage === 'idle') {
      return {
        showExportPack: false,
        showMarkLocal: false,
        showExportResults: false,
        showImportResults: false,
        showComplete: false,
        helperText: 'Momentan ai nevoie doar de exportul event pack, mai sus.',
      };
    }

    if (currentStage === 'exported') {
      return {
        showExportPack: true,
        showMarkLocal: false,
        showExportResults: false,
        showImportResults: false,
        showComplete: false,
        helperText: 'Dacă trebuie să re-exporți pachetul (ex. a mai apărut un sportiv nou), fă-o aici.',
      };
    }

    if (currentStage === 'local_in_progress') {
      return {
        showExportPack: false,
        showMarkLocal: false,
        showExportResults: true,
        showImportResults: true,
        showComplete: false,
        helperText: 'Acum contează doar exportul și importul rezultatelor din local.',
      };
    }

    if (currentStage === 'results_uploaded') {
      return {
        showExportPack: false,
        showMarkLocal: false,
        showExportResults: false,
        showImportResults: true,
        showComplete: false,
        helperText: 'Poți reîncărca JSON-ul dacă ai o variantă corectată, înainte de a finaliza sync-ul mai sus.',
      };
    }

    return {
      showExportPack: false,
      showMarkLocal: false,
      showExportResults: false,
      showImportResults: false,
      showComplete: false,
      helperText: 'Sincronizarea este închisă. Dacă mai vrei modificări locale, pornește un ciclu nou mai sus.',
    };
  }, [currentStage]);

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!comp) return <p className="py-20 text-center text-muted-foreground">Competition not found.</p>;

  return (
    <div className="flex-1 overflow-auto bg-background p-3 sm:p-4 md:p-6">
      <div className="space-y-6">
      <PageHeader title={`Sync Center · ${comp.name}`} subtitle="Ghid simplificat pentru mutarea competiției din cloud în local și înapoi" />

      <Card className="border-blue-200 bg-blue-50 p-5 dark:border-blue-900/40 dark:bg-blue-950/10">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-blue-100 dark:ring-blue-900/40">
            <div className="text-xs font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">Stare curentă</div>
            <Badge className={cn('mt-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide', syncStatusMeta.className)}>
              {syncStatusMeta.label}
            </Badge>
            <p className="mt-3 text-sm text-muted-foreground">{syncStatusMeta.description}</p>
          </div>
          <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-blue-100 dark:ring-blue-900/40">
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Mod</div>
            <div className="mt-2 text-sm font-semibold text-foreground">{syncModeMeta.label}</div>
          </div>
          <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-blue-100 dark:ring-blue-900/40">
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Blocare</div>
            <div className="mt-2 text-sm font-semibold text-foreground">{syncLockMeta.label}</div>
          </div>
        </div>
      </Card>

      {message && (
        <div className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          {typeof message === 'string' ? message : JSON.stringify(message)}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Ce faci acum</h2>
              <p className="mt-1 text-sm text-muted-foreground">Urmează doar pasul recomandat mai jos. Restul acțiunilor rămân în secțiunea „Acțiuni utile”.</p>
            </div>
            <Badge className={cn('rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide', syncStatusMeta.className)}>
              {syncStatusMeta.label}
            </Badge>
          </div>

          <div className="mt-5 rounded-2xl border border-border bg-muted p-5">
            <h3 className="text-base font-semibold text-foreground">{primaryAction.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{primaryAction.description}</p>
            <p className="mt-3 text-sm text-muted-foreground">{primaryAction.note}</p>

            {primaryAction.actionLabel ? (
              <div className="mt-5 max-w-md">
                <ActionButton
                  onClick={primaryAction.action}
                  disabled={primaryAction.disabled}
                  className={primaryAction.className}
                >
                  {primaryAction.actionLabel}
                </ActionButton>
              </div>
            ) : null}
          </div>

          <div className="mt-6">
            <h3 className="mb-3 text-base font-semibold text-foreground">Checklist vizual</h3>
            <div className="space-y-3">
              {steps.map((step) => (
                <SyncStep key={step.key} {...step} />
              ))}
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-lg font-semibold text-foreground">Acțiuni utile</h2>
            <p className="mt-1 text-sm text-muted-foreground">{visibleActions.helperText}</p>

            <div className="mt-4 space-y-3">
              {visibleActions.showExportPack ? (
                <ActionButton onClick={handleDownloadEventPack} disabled={busy} className="bg-blue-600 text-white hover:bg-blue-700">
                  Exportă event pack
                </ActionButton>
              ) : null}

              {currentStage === 'completed' && visibleActions.showExportPack ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/10 dark:text-amber-300">
                  Un export nou pornește un ciclu nou de sync. Recomandat este să folosești doar fișierul nou exportat și să nu continui pe un pachet local mai vechi.
                </div>
              ) : null}

              {visibleActions.showMarkLocal ? (
                <ActionButton
                  onClick={handleMarkLocalInProgress}
                  disabled={busy || !['exported', 'local_in_progress'].includes(comp.local_sync_status)}
                  className="bg-amber-500 text-white hover:bg-amber-600"
                >
                  Marchează „operare locală începută”
                </ActionButton>
              ) : null}

              {visibleActions.showExportResults ? (
                <ActionButton onClick={handleDownloadEventResults} disabled={busy} variant="secondary">
                  Exportă rezultate locale
                </ActionButton>
              ) : null}

              {visibleActions.showImportResults ? (
                <label className="block rounded-xl border border-dashed border-border bg-muted px-4 py-4">
                  <span className="block text-sm font-semibold text-foreground">Încarcă rezultatele din local</span>
                  <span className="mt-1 block text-xs text-muted-foreground">Selectează fișierul JSON exportat din aplicația locală.</span>
                  <input
                    type="file"
                    accept="application/json"
                    onChange={handleImportResults}
                    disabled={busy}
                    className="mt-3 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-secondary-foreground hover:file:bg-secondary/80"
                  />
                </label>
              ) : null}

              {visibleActions.showComplete ? (
                <ActionButton
                  onClick={handleCompleteLocalSync}
                  disabled={busy || !['results_uploaded', 'completed'].includes(comp.local_sync_status)}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  Finalizează sincronizarea și deblochează
                </ActionButton>
              ) : null}

              {!visibleActions.showExportPack && !visibleActions.showMarkLocal && !visibleActions.showExportResults && !visibleActions.showImportResults && !visibleActions.showComplete ? (
                <div className="rounded-xl border border-border bg-muted px-4 py-4 text-sm text-muted-foreground">
                  Nu există alte acțiuni necesare în acest moment.
                </div>
              ) : null}
            </div>
          </Card>

          {isLocalServer ? (
            <Card className="p-5">
              <h2 className="text-lg font-semibold text-foreground">Acest server local (import event pack)</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Folosește aceste acțiuni direct pe laptopul din sală, atunci când
                importi evenimentul pentru prima dată sau vrei să aduci sportivi/
                categorii noi adăugate între timp în cloud.
              </p>

              <div className="mt-4 space-y-3">
                <label className="block rounded-xl border border-dashed border-border bg-muted px-4 py-4">
                  <span className="block text-sm font-semibold text-foreground">Importă event pack (fișier)</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Selectează fișierul JSON descărcat din aplicația cloud. Sigur de repetat oricând.
                  </span>
                  <input
                    type="file"
                    accept="application/json"
                    onChange={handleImportEventPack}
                    disabled={busy}
                    className="mt-3 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-secondary-foreground hover:file:bg-secondary/80"
                  />
                </label>

                <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50 px-4 py-4 dark:border-blue-900/40 dark:bg-blue-950/10">
                  <span className="block text-sm font-semibold text-blue-950 dark:text-blue-200">Resincronizează din cloud (fără fișier)</span>
                  <span className="mt-1 block text-xs text-blue-900 dark:text-blue-300">
                    Dacă ai internet chiar acum (ex. ai adăugat un sportiv nou sau o
                    categorie nouă direct în cloud), acest buton preia automat un
                    event pack proaspăt și îl importă aici, fără să mai descarci/
                    încarci manual un fișier. Necesită ca serverul local să aibă
                    configurate datele de conectare la cloud (vezi `.env.local`).
                  </span>
                  <Button onClick={handlePullEventPackFromCloud} disabled={busy} className="mt-3 bg-blue-600 text-white hover:bg-blue-700">
                    Resincronizează din cloud
                  </Button>
                </div>
              </div>
            </Card>
          ) : null}

          <Card className="p-5">
            <h2 className="text-lg font-semibold text-foreground">Repere rapide</h2>
            <div className="mt-4 space-y-3 text-sm text-foreground">
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Exportat</span><span className="font-semibold text-right">{formatDateTime(comp.exported_to_local_at)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Rezultate importate</span><span className="font-semibold text-right">{formatDateTime(comp.results_uploaded_at)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Finalizat</span><span className="font-semibold text-right">{formatDateTime(comp.sync_completed_at)}</span></div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-semibold text-foreground">După sync</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button as={Link} to={`/competitions/${id}/categories`} variant="secondary">Înapoi la categorii</Button>
              <Button as={Link} to={`/competitions/${id}/results`} variant="secondary">Vezi rezultate</Button>
            </div>
          </Card>
        </div>
      </div>

      <Card className="p-5">
        <h2 className="mb-1 text-lg font-semibold text-foreground">Jurnal sincronizare</h2>
        <p className="mb-4 text-sm text-muted-foreground">Ce s-a sincronizat efectiv pe cloud, în această sesiune - util pentru a confirma că meciurile, locurile și greutățile au ajuns cu adevărat.</p>
        <SyncLogPanel entries={syncLog} />
      </Card>

      <LocalBackupPanel />
      </div>

      <Dialog open={!!confirmModal} onOpenChange={(open) => { if (!open) setConfirmModal(null); }}>
        <DialogContent className="max-w-md">
          {confirmModal && (
            <>
              <DialogHeader><DialogTitle>{confirmModal.title}</DialogTitle></DialogHeader>
              <div>
                <p className="text-sm leading-relaxed text-foreground">{confirmModal.message}</p>
                {confirmModal.detail && (
                  <p className="mt-3 max-h-24 overflow-y-auto rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                    {confirmModal.detail}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setConfirmModal(null)}>Anulează</Button>
                <Button
                  onClick={confirmModal.onConfirm}
                  disabled={busy}
                  variant="destructive"
                  className={confirmModal.color === 'orange' ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : ''}
                >{confirmModal.confirmLabel || 'Confirmă'}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}