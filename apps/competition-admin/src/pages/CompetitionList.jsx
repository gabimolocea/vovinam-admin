import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { competitionAPI } from '@shared/lib/api';
import { Spinner } from '@shared/components/ui';

export default function CompetitionList() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    competitionAPI.list().then(({ data }) => {
      const list = Array.isArray(data) ? data : data.results ?? [];
      setEvents(list);
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
          <button
            onClick={() => navigate('/competitions/new')}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            + Competiție nouă
          </button>
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
    return (b.start_date || '').localeCompare(a.start_date || '');
  });

  const upcoming = sorted.filter(ev => (ev.end_date || ev.start_date || '') >= today);
  const past = sorted.filter(ev => (ev.end_date || ev.start_date || '') < today);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Competiții</h1>
          <p className="text-sm text-gray-500">Administrează toate competițiile și evenimentele</p>
        </div>
        <button
          onClick={() => navigate('/competitions/new')}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          + Competiție nouă
        </button>
      </div>

      {/* ── UPCOMING / ACTIVE ── */}
      {upcoming.length > 0 && (
        <>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Competiții în desfășurare</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-8">
            {upcoming.map(ev => (
              <button
                key={ev.id}
                onClick={() => navigate(`/competitions/${ev.id}/categories`)}
                className="text-left rounded-xl border border-gray-200 bg-white p-4 hover:border-blue-400 hover:shadow-md transition-all group"
              >
                <h3 className="text-sm font-bold text-gray-900 group-hover:text-blue-700 truncate">
                  {ev.name}
                </h3>
                {ev.start_date && (
                  <p className="text-xs text-gray-500 mt-1">📅 {ev.start_date}{ev.end_date && ` → ${ev.end_date}`}</p>
                )}
                {(ev.location || ev.place) && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">📍 {ev.location || ev.place}</p>
                )}
                <span className="inline-block mt-2 text-[10px] text-blue-600 font-medium">
                  Deschide centralizator →
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── PAST / EXPIRED ── */}
      {past.length > 0 && (
        <>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Competiții încheiate</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {past.map(ev => (
              <button
                key={ev.id}
                onClick={() => navigate(`/competitions/${ev.id}/categories`)}
                className="text-left rounded-xl border border-gray-100 bg-gray-50 p-4 opacity-60 hover:opacity-80 transition-all"
              >
                <h3 className="text-sm font-medium text-gray-500 truncate">
                  {ev.name}
                </h3>
                {ev.start_date && (
                  <p className="text-[11px] text-gray-400 mt-1">📅 {ev.start_date}{ev.end_date && ` → ${ev.end_date}`}</p>
                )}
                {(ev.location || ev.place) && (
                  <p className="text-[11px] text-gray-400 mt-0.5 truncate">📍 {ev.location || ev.place}</p>
                )}
                <span className="inline-block mt-2 text-[10px] text-gray-400 font-medium">
                  Încheiat
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
