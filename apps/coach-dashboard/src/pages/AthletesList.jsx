import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { athleteAPI } from '@shared/lib/api';
import { PageHeader, Spinner, EmptyState, DataTable, StatusBadge } from '@shared/components/ui';

export default function AthletesList() {
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    athleteAPI.list({ my_club: true }).then(({ data }) => {
      setAthletes(Array.isArray(data) ? data : data.results ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const columns = [
    {
      key: 'photo',
      label: '',
      render: (r) => {
        const initials = `${(r.first_name?.[0] || '').toUpperCase()}${(r.last_name?.[0] || '').toUpperCase()}`;
        const colors = ['bg-blue-500','bg-emerald-500','bg-purple-500','bg-rose-500','bg-amber-500','bg-cyan-500','bg-indigo-500','bg-teal-500'];
        const colorIdx = (r.id || 0) % colors.length;
        return (
          <div className="w-9 h-9 rounded-full overflow-hidden shrink-0">
            {r.profile_image ? (
              <img src={r.profile_image} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className={`w-full h-full flex items-center justify-center text-white text-xs font-bold ${colors[colorIdx]}`}>
                {initials || '?'}
              </div>
            )}
          </div>
        );
      },
    },
    { key: 'name', label: 'Nume', render: (r) => `${r.last_name || ''} ${r.first_name || ''}`.trim() || r.full_name || '—' },
    { key: 'current_grade', label: 'Grad', render: (r) => r.current_grade?.name || r.current_grade_name || '—' },
    { key: 'date_of_birth', label: 'Data nașterii', render: (r) => r.date_of_birth || '—' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="p-6">
      <PageHeader title="Sportivi" subtitle="Sportivii din clubul tău">
        <button
          onClick={() => navigate('/athletes/new')}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
        >
          + Adaugă sportiv
        </button>
      </PageHeader>
      {athletes.length === 0 ? (
        <EmptyState icon="🥋" title="Fără sportivi" message="Nu au fost găsiți sportivi în clubul tău." />
      ) : (
        <DataTable columns={columns} rows={athletes} onRowClick={(r) => navigate(`/athletes/${r.id}`)} />
      )}
    </div>
  );
}
