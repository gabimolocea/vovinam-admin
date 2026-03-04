import { useEffect, useState } from 'react';
import { scoreAPI } from '@shared/lib/api';
import { PageHeader, Spinner, EmptyState, DataTable, StatusBadge } from '@shared/components/ui';

export default function MyResults() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    scoreAPI.myResults().then(({ data }) => {
      setResults(Array.isArray(data) ? data : data.results ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const columns = [
    { key: 'competition_name', label: 'Event', render: (r) => r.competition_name || '—' },
    { key: 'category_name', label: 'Category', render: (r) => r.category_name || '—' },
    { key: 'final_score', label: 'Score', render: (r) => r.final_score ?? '—' },
    { key: 'rank', label: 'Rank', render: (r) => r.rank ?? '—' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <>
      <PageHeader title="My Results" subtitle="Your competition scores and rankings" />
      {results.length === 0 ? (
        <EmptyState icon="📊" title="No results yet" message="Compete in events to see your results here." />
      ) : (
        <DataTable columns={columns} rows={results} />
      )}
    </>
  );
}
