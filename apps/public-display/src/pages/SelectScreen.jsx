import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { competitionAPI, fieldAPI } from '@shared/lib/api';
import Logo from '@shared/components/Logo';
import { Card, EmptyState, PageHeader, Spinner, StatusBadge } from '@shared/components/ui';

const ALLOWED_FIELD_NUMBERS = [1, 2];

function normalizeList(payload) {
  return Array.isArray(payload) ? payload : payload?.results ?? [];
}

function getCompetitionPhase(ev, today) {
  const start = ev?.start_date || '';
  const end = ev?.end_date || ev?.start_date || '';

  if (start && start <= today && end && end >= today) return 'ongoing';
  if (end && end < today) return 'past';
  return 'upcoming';
}

function pickPreferredCompetition(events) {
  if (!events.length) return null;

  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...events].sort((a, b) => {
    const phaseRank = { ongoing: 0, upcoming: 1, past: 2 };
    const aPhase = getCompetitionPhase(a, today);
    const bPhase = getCompetitionPhase(b, today);

    if (phaseRank[aPhase] !== phaseRank[bPhase]) return phaseRank[aPhase] - phaseRank[bPhase];

    if (aPhase === 'past') {
      return (b.end_date || b.start_date || '').localeCompare(a.end_date || a.start_date || '');
    }

    return (a.start_date || '').localeCompare(b.start_date || '');
  });

  return sorted[0] ?? null;
}

function dedupeByFieldNumber(fields) {
  const map = new Map();
  fields.forEach((field) => {
    const fieldNumber = Number(field.field_number);
    if (!ALLOWED_FIELD_NUMBERS.includes(fieldNumber) || map.has(fieldNumber)) return;
    map.set(fieldNumber, field);
  });
  return [...map.values()].sort((a, b) => Number(a.field_number) - Number(b.field_number));
}

export default function SelectScreen() {
  const navigate = useNavigate();
  const [fields, setFields] = useState([]);
  const [competition, setCompetition] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      competitionAPI.list().catch(() => ({ data: [] })),
      fieldAPI.list().catch(() => ({ data: [] })),
    ]).then(([competitionRes, fieldRes]) => {
      if (!isMounted) return;

      const competitions = normalizeList(competitionRes.data);
      const allFields = normalizeList(fieldRes.data);
      const preferredCompetition = pickPreferredCompetition(competitions);

      let visibleFields = [];
      if (preferredCompetition) {
        visibleFields = dedupeByFieldNumber(allFields.filter((field) => field.event === preferredCompetition.id));
      }

      if (visibleFields.length === 0) {
        visibleFields = dedupeByFieldNumber(allFields);
      }

      setCompetition(preferredCompetition);
      setFields(visibleFields);
      setLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const competitionStatus = useMemo(() => {
    if (!competition) return null;
    const phase = getCompetitionPhase(competition, new Date().toISOString().slice(0, 10));
    if (phase === 'ongoing') return { status: 'active', label: 'Competiție în desfășurare' };
    if (phase === 'upcoming') return { status: 'pending', label: 'Competiție viitoare' };
    return { status: 'completed', label: 'Competiție încheiată' };
  }, [competition]);

  return (
    <div className="frvv-shell">
      <header className="frvv-shell-header px-4 py-4">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-4">
          <Logo size={56} alt="FRVV Public Display" />
          <div>
            <h1 className="text-lg font-black uppercase tracking-wide text-yellow-200">FRVV Public Display</h1>
            <p className="text-sm text-yellow-100/80">Federația Română de Vovinam Viet-Vo-Dao</p>
          </div>
        </div>
      </header>

      <main className="frvv-shell-main">
        <div className="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-5xl items-center px-4 py-6 md:px-6">
          <Card className="w-full p-5 md:p-6">
            <PageHeader
              title="Selectare teren"
              subtitle={competition?.name || 'Alege ecranul pentru afișarea publică.'}
            >
              {competitionStatus ? <StatusBadge status={competitionStatus.status} label={competitionStatus.label} /> : null}
            </PageHeader>

            {competition && (
              <div className="mb-5 flex flex-wrap gap-2">
                <span className="frvv-chip">Competiție: {competition.name}</span>
                {competition.city_name ? <span className="frvv-chip">Oraș: {competition.city_name}</span> : null}
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-16">
                <Spinner />
              </div>
            ) : fields.length === 0 ? (
              <EmptyState
                icon="📺"
                title="Nu există terenuri disponibile"
                message="Nu există terenuri configurate pentru Teren 1 și Teren 2 în competiția selectată."
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {fields.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      document.documentElement.requestFullscreen?.();
                      navigate(`/display/${f.id}`);
                    }}
                    className="frvv-surface p-5 text-left transition hover:bg-yellow-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Ecran public</p>
                        <h2 className="mt-1 text-lg font-black uppercase tracking-wide text-gray-900">Teren {f.field_number}</h2>
                        <p className="mt-2 text-sm text-gray-600">{f.name || `Teren ${f.field_number}`}</p>
                      </div>
                      <span className="frvv-btn-primary px-3 py-1.5 text-xs">Deschide</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
