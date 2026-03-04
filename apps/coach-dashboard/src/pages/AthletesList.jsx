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
    { key: 'name', label: 'Name', render: (r) => `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.full_name || '—' },
    { key: 'current_grade', label: 'Grade', render: (r) => r.current_grade_name || r.current_grade || '—' },
    { key: 'birth_date', label: 'Birth Date' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <>
      <PageHeader title="Club Athletes" subtitle="Athletes in your club" />
      {athletes.length === 0 ? (
        <EmptyState icon="🥋" title="No athletes" message="No athletes found in your club." />
      ) : (
        <DataTable columns={columns} rows={athletes} onRowClick={(r) => navigate(`/athletes/${r.id}`)} />
      )}
    </>
  );
}
