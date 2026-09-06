import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { competitionAPI, offlineAPI, systemAPI } from '@shared/lib/api';
import { PageHeader, Card, Spinner } from '@shared/components/ui';
import { getSyncLockMeta, getSyncModeMeta, getSyncStatusMeta } from '@shared/lib/syncStatus';
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

function SyncStep({ title, description, done, active }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${active ? 'border-blue-500 bg-blue-50' : done ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-green-600 text-white' : active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
          {done ? '✓' : '•'}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="mt-1 text-sm text-gray-600">{description}</p>
        </div>
      </div>
    </div>
  );
}

function ActionButton({ children, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export default function SyncCenterPage() {
  const { id } = useParams();
  const [comp, setComp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [isLocalServer, setIsLocalServer] = useState(false);

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

  const history = useMemo(() => {
    if (!comp) return [];
    return [
      { label: 'Event pack exportat', value: comp.exported_to_local_at },
      { label: 'Rezultate importate în cloud', value: comp.results_uploaded_at },
      { label: 'Sync finalizat', value: comp.sync_completed_at },
    ].filter((entry) => entry.value);
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

  async function handlePullEventPackFromCloud() {
    const confirmed = window.confirm(
      'Se va prelua un event pack proaspăt direct din cloud (ex. cu un sportiv sau ' +
      'o categorie adăugată acolo de curând) și se va importa aici.\n\n' +
      'Înainte de import se salvează automat un backup de siguranță, deci poți ' +
      'oricând reveni dacă ceva nu e cum trebuie.\n\nContinui?'
    );
    if (!confirmed) return;

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
    }
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
      await offlineAPI.importEventResults(payload);
      await loadCompetition();
      setMessage('Rezultatele locale au fost importate în cloud.');
    } catch (error) {
      setMessage(error.response?.data?.detail || error.message || 'Importul rezultatelor a eșuat.');
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
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Finalizarea sincronizării a eșuat.');
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

  const quickGuide = [
    '1. Exportă event pack din cloud înainte de competiție.',
    '2. Rulează competiția local, în sală, pe LAN.',
    '3. Exportă rezultatele din local în format JSON.',
    '4. Încarcă JSON-ul aici și finalizează sincronizarea.',
  ];

  const visibleActions = useMemo(() => {
    if (currentStage === 'idle') {
      return {
        showExportPack: true,
        showMarkLocal: false,
        showExportResults: false,
        showImportResults: false,
        showComplete: false,
        helperText: 'Momentan ai nevoie doar de exportul event pack.',
      };
    }

    if (currentStage === 'exported') {
      return {
        showExportPack: true,
        showMarkLocal: true,
        showExportResults: false,
        showImportResults: false,
        showComplete: false,
        helperText: 'După export, poți confirma că ai început operarea locală.',
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
        showComplete: true,
        helperText: 'Poți reîncărca JSON-ul dacă ai o variantă corectată sau poți finaliza sync-ul.',
      };
    }

    return {
      showExportPack: true,
      showMarkLocal: false,
      showExportResults: false,
      showImportResults: false,
      showComplete: false,
      helperText: 'Sincronizarea este închisă. Dacă mai vrei modificări locale, începi un ciclu nou printr-un export nou de event pack.',
    };
  }, [currentStage]);

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!comp) return <p className="py-20 text-center text-gray-500">Competition not found.</p>;

  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-3 sm:p-4 md:p-6">
      <div className="space-y-6">
      <PageHeader title={`Sync Center · ${comp.name}`} subtitle="Ghid simplificat pentru mutarea competiției din cloud în local și înapoi" />

      <Card className="border-blue-200 bg-blue-50">
        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <h2 className="text-lg font-semibold text-blue-950">Cum procedezi, pe scurt</h2>
            <div className="mt-3 space-y-2">
              {quickGuide.map((item) => (
                <div key={item} className="rounded-lg bg-white/80 px-3 py-2 text-sm text-blue-950 ring-1 ring-blue-100">
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-blue-100">
              <div className="text-xs font-bold uppercase tracking-wide text-blue-700">Stare curentă</div>
              <div className={`mt-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${syncStatusMeta.className}`}>
                {syncStatusMeta.label}
              </div>
              <p className="mt-3 text-sm text-gray-700">{syncStatusMeta.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-blue-100">
                <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Mod</div>
                <div className="mt-2 text-sm font-semibold text-gray-900">{syncModeMeta.label}</div>
              </div>
              <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-blue-100">
                <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Blocare</div>
                <div className="mt-2 text-sm font-semibold text-gray-900">{syncLockMeta.label}</div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {message && (
        <div className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          {typeof message === 'string' ? message : JSON.stringify(message)}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Ce faci acum</h2>
              <p className="mt-1 text-sm text-gray-600">Urmează doar pasul recomandat mai jos. Restul acțiunilor rămân în secțiunea „Acțiuni utile”.</p>
            </div>
            <div className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${syncStatusMeta.className}`}>
              {syncStatusMeta.label}
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <h3 className="text-base font-semibold text-gray-900">{primaryAction.title}</h3>
            <p className="mt-2 text-sm leading-6 text-gray-700">{primaryAction.description}</p>
            <p className="mt-3 text-sm text-gray-500">{primaryAction.note}</p>

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
            <h3 className="mb-3 text-base font-semibold text-gray-900">Checklist vizual</h3>
            <div className="space-y-3">
              {steps.map((step) => (
                <SyncStep key={step.key} {...step} />
              ))}
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold text-gray-900">Acțiuni utile</h2>
            <p className="mt-1 text-sm text-gray-600">{visibleActions.helperText}</p>

            <div className="mt-4 space-y-3">
              {visibleActions.showExportPack ? (
                <ActionButton onClick={handleDownloadEventPack} disabled={busy} className="bg-blue-600 text-white hover:bg-blue-700">
                  Exportă event pack
                </ActionButton>
              ) : null}

              {currentStage === 'completed' && visibleActions.showExportPack ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
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
                <ActionButton onClick={handleDownloadEventResults} disabled={busy} className="bg-gray-900 text-white hover:bg-black">
                  Exportă rezultate locale
                </ActionButton>
              ) : null}

              {visibleActions.showImportResults ? (
                <label className="block rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-4">
                  <span className="block text-sm font-semibold text-gray-900">Încarcă rezultatele din local</span>
                  <span className="mt-1 block text-xs text-gray-500">Selectează fișierul JSON exportat din aplicația locală.</span>
                  <input
                    type="file"
                    accept="application/json"
                    onChange={handleImportResults}
                    disabled={busy}
                    className="mt-3 block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-200 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-gray-700 hover:file:bg-gray-300"
                  />
                </label>
              ) : null}

              {visibleActions.showComplete ? (
                <ActionButton
                  onClick={handleCompleteLocalSync}
                  disabled={busy || !['results_uploaded', 'completed'].includes(comp.local_sync_status)}
                  className="bg-green-600 text-white hover:bg-green-700"
                >
                  Finalizează sincronizarea și deblochează
                </ActionButton>
              ) : null}

              {!visibleActions.showExportPack && !visibleActions.showMarkLocal && !visibleActions.showExportResults && !visibleActions.showImportResults && !visibleActions.showComplete ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-500">
                  Nu există alte acțiuni necesare în acest moment.
                </div>
              ) : null}
            </div>
          </Card>

          {isLocalServer ? (
            <Card>
              <h2 className="text-lg font-semibold text-gray-900">Acest server local (import event pack)</h2>
              <p className="mt-1 text-sm text-gray-600">
                Folosește aceste acțiuni direct pe laptopul din sală, atunci când
                importi evenimentul pentru prima dată sau vrei să aduci sportivi/
                categorii noi adăugate între timp în cloud.
              </p>

              <div className="mt-4 space-y-3">
                <label className="block rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-4">
                  <span className="block text-sm font-semibold text-gray-900">Importă event pack (fișier)</span>
                  <span className="mt-1 block text-xs text-gray-500">
                    Selectează fișierul JSON descărcat din aplicația cloud. Sigur de repetat oricând.
                  </span>
                  <input
                    type="file"
                    accept="application/json"
                    onChange={handleImportEventPack}
                    disabled={busy}
                    className="mt-3 block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-200 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-gray-700 hover:file:bg-gray-300"
                  />
                </label>

                <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50 px-4 py-4">
                  <span className="block text-sm font-semibold text-blue-950">Resincronizează din cloud (fără fișier)</span>
                  <span className="mt-1 block text-xs text-blue-900">
                    Dacă ai internet chiar acum (ex. ai adăugat un sportiv nou sau o
                    categorie nouă direct în cloud), acest buton preia automat un
                    event pack proaspăt și îl importă aici, fără să mai descarci/
                    încarci manual un fișier. Necesită ca serverul local să aibă
                    configurate datele de conectare la cloud (vezi `.env.local`).
                  </span>
                  <button
                    type="button"
                    onClick={handlePullEventPackFromCloud}
                    disabled={busy}
                    className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Resincronizează din cloud
                  </button>
                </div>
              </div>
            </Card>
          ) : null}

          <Card>
            <h2 className="text-lg font-semibold text-gray-900">Repere rapide</h2>
            <div className="mt-4 space-y-3 text-sm text-gray-700">
              <div className="flex justify-between gap-3"><span className="text-gray-500">Exportat</span><span className="font-semibold text-right">{formatDateTime(comp.exported_to_local_at)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-500">Rezultate importate</span><span className="font-semibold text-right">{formatDateTime(comp.results_uploaded_at)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-500">Finalizat</span><span className="font-semibold text-right">{formatDateTime(comp.sync_completed_at)}</span></div>
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-gray-900">După sync</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link to={`/competitions/${id}/categories`} className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300">Înapoi la categorii</Link>
              <Link to={`/competitions/${id}/results`} className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300">Vezi rezultate</Link>
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Istoric sincronizare</h2>
        {history.length ? (
          <div className="grid gap-3 md:grid-cols-3">
            {history.map((item) => (
              <div key={item.label} className="rounded-lg border border-gray-200 px-4 py-3">
                <div className="text-sm font-semibold text-gray-900">{item.label}</div>
                <div className="mt-1 text-sm text-gray-600">{formatDateTime(item.value)}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Nu există încă evenimente în istoricul de sincronizare.</p>
        )}
      </Card>

      <LocalBackupPanel />
      </div>
    </div>
  );
}