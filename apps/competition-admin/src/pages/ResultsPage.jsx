import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { scoreAPI } from '@shared/lib/api';
import { PageHeader, Spinner, EmptyState, DataTable, StatusBadge } from '@shared/components/ui';

export default function ResultsPage() {
  const { id: eventId } = useParams();
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    scoreAPI.list({ competition: eventId }).then(({ data }) => {
      setScores(Array.isArray(data) ? data : data.results ?? []);
      setLoading(false);
    });
  }, [eventId]);

  const columns = [
    { key: 'athlete_name', label: 'Athlete', render: (r) => r.athlete_name || `Athlete #${r.athlete}` },
    { key: 'category_name', label: 'Category', render: (r) => r.category_name || `Cat #${r.category}` },
    { key: 'final_score', label: 'Score', render: (r) => r.final_score ?? '—' },
    { key: 'rank', label: 'Rank', render: (r) => r.rank ?? '—' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <>
      <PageHeader title="Results" subtitle={`Event #${eventId}`} />

      {scores.length === 0 ? (
        <EmptyState icon="📊" title="No results yet" message="Scores will appear here once referees submit them." />
      ) : (
        <DataTable columns={columns} rows={scores} />
      )}
    </>
  );
}
