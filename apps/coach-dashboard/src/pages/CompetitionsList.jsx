import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { competitionAPI } from '@shared/lib/api';
import { Spinner } from '@shared/components/ui';

const formatDate = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
};

function InfoChip({ children, tone = 'default' }) {
  const toneClass = tone === 'muted'
    ? 'border-gray-300 bg-gray-100 text-gray-600'
    : 'border-black bg-yellow-100 text-black';

  return (
    <span className={`inline-flex items-center border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${toneClass}`}>
      {children}
    </span>
  );
}

function CompetitionCard({ event, disabled = false, onOpen }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onOpen}
      disabled={disabled}
      title={disabled ? 'Competiția s-a încheiat — nu mai poți modifica înscrierile' : undefined}
      className={`w-full border-2 p-4 text-left transition sm:p-5 ${
        disabled
          ? 'cursor-not-allowed border-gray-300 bg-gray-100 text-gray-500 opacity-70'
          : 'border-black bg-white hover:bg-yellow-50'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className={`truncate text-base font-black ${disabled ? 'text-gray-500' : 'text-gray-900'}`}>
            {event.name}
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {event.start_date ? <InfoChip tone={disabled ? 'muted' : 'default'}>{formatDate(event.start_date)}</InfoChip> : null}
            {event.place ? <InfoChip tone={disabled ? 'muted' : 'default'}>{event.place}</InfoChip> : null}
          </div>
        </div>
        <div className="shrink-0">
          <span className={`inline-flex items-center border px-3 py-2 text-[11px] font-black uppercase tracking-wide ${
            disabled
              ? 'border-gray-300 bg-white text-gray-500'
              : 'border-black bg-yellow-300 text-black'
          }`}>
            {disabled ? 'Încheiat' : 'Deschide centralizator'}
          </span>
        </div>
      </div>
    </button>
  );
}

export default function CompetitionsList() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    competitionAPI.list().then(res => {
      const data = Array.isArray(res.data) ? res.data : res.data.results ?? [];
      setEvents(data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  if (events.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-4xl mb-3">🏆</div>
          <h2 className="text-base font-bold text-gray-700 mb-1">Fără competiții</h2>
          <p className="text-sm text-gray-500">Nu există competiții disponibile momentan.</p>
        </div>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  // Sort: upcoming first, then past (most recent first)
  const sorted = [...events].sort((a, b) => {
    const aEnd = a.end_date || a.start_date || '';
    const bEnd = b.end_date || b.start_date || '';
    const aPast = aEnd < today;
    const bPast = bEnd < today;
    if (aPast !== bPast) return aPast ? 1 : -1;
    // within same group, sort by start_date descending
    return (b.start_date || '').localeCompare(a.start_date || '');
  });

  const upcoming = sorted.filter(ev => (ev.end_date || ev.start_date || '') >= today);
  const past = sorted.filter(ev => (ev.end_date || ev.start_date || '') < today);

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 border-b-2 border-black pb-4">
        <h1 className="text-xl font-black uppercase tracking-wide text-black sm:text-2xl">Competiții</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <InfoChip>{upcoming.length} viitoare</InfoChip>
          <InfoChip tone="muted">{past.length} încheiate</InfoChip>
        </div>
      </div>

      {/* ── UPCOMING ── */}
      {upcoming.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Competiții viitoare</h2>
            <span className="text-xs font-semibold text-gray-400">Poți modifica înscrierile</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {upcoming.map(ev => (
              <CompetitionCard
                key={ev.id}
                event={ev}
                onOpen={() => navigate(`/competitions/${ev.id}`)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── PAST ── */}
      {past.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Competiții încheiate</h2>
            <span className="text-xs font-semibold text-gray-400">Doar vizualizare</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {past.map(ev => (
              <CompetitionCard
                key={ev.id}
                event={ev}
                disabled
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
