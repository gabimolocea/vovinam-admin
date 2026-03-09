import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { competitionAPI } from '@shared/lib/api';
import { Spinner } from '@shared/components/ui';

function formatDate(value) {
  if (!value) return '—';
  const normalized = String(value).split('T')[0];
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getCompetitionStatus(ev, today) {
  const endDate = ev.end_date || ev.start_date || '';
  if (endDate && endDate < today) {
    return { label: 'Încheiată', className: 'bg-gray-100 text-gray-700 border border-gray-300' };
  }
  return { label: 'Activă / viitoare', className: 'bg-yellow-200 text-black border border-black' };
}

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
            className="frvv-btn-add mt-4"
          >
            <span className="frvv-btn-add-icon">+</span>
            Competiție nouă
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

  const renderPeriod = (ev) => (
    <>
      {formatDate(ev.start_date)}
      {ev.end_date && ev.end_date !== ev.start_date ? ` → ${formatDate(ev.end_date)}` : ''}
    </>
  );

  const renderLocation = (ev) => ev.city_name || '—';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button
          onClick={() => navigate('/competitions/new')}
          className="frvv-btn-add"
        >
          <span className="frvv-btn-add-icon">+</span>
          Competiție nouă
        </button>
      </div>

      <div className="space-y-3 md:hidden">
        {sorted.map((ev) => {
          const status = getCompetitionStatus(ev, today);
          return (
            <button
              key={ev.id}
              type="button"
              onClick={() => navigate(`/competitions/${ev.id}/categories`)}
              className="w-full border-2 border-black bg-white p-4 text-left shadow-sm transition hover:bg-yellow-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-black uppercase tracking-wide text-gray-900">{ev.name}</h2>
                </div>
                <span className={`shrink-0 inline-flex items-center px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${status.className}`}>
                  {status.label}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-gray-700">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Perioadă</p>
                  <p className="mt-1 font-medium">{renderPeriod(ev)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Oraș</p>
                  <p className="mt-1 font-medium">{renderLocation(ev)}</p>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <span className="frvv-btn-primary px-3 py-1.5 text-xs">Deschide</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto border-2 border-black bg-white md:block">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-black text-white">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-yellow-200">Competiție</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-yellow-200">Perioadă</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-yellow-200">Oraș</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-yellow-200">Status</th>
              <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-yellow-200">Acțiune</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((ev, index) => {
              const status = getCompetitionStatus(ev, today);
              return (
                <tr key={ev.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="border-t border-gray-200 px-4 py-3 align-top md:min-w-[320px]">
                    <div className="font-bold text-gray-900">{ev.name}</div>
                  </td>
                  <td className="border-t border-gray-200 px-4 py-3 align-top text-gray-700">
                    {renderPeriod(ev)}
                  </td>
                  <td className="border-t border-gray-200 px-4 py-3 align-top text-gray-700">
                    {renderLocation(ev)}
                  </td>
                  <td className="border-t border-gray-200 px-4 py-3 align-top">
                    <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${status.className}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="border-t border-gray-200 px-4 py-3 text-right align-top">
                    <button
                      onClick={() => navigate(`/competitions/${ev.id}/categories`)}
                      className="frvv-btn-primary px-3 py-1.5 text-xs"
                    >
                      Deschide
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}
