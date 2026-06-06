import { useEffect, useState } from 'react';
import { enrollmentAPI } from '@shared/lib/api';
import { PageHeader, Spinner, EmptyState, DataTable } from '@shared/components/ui';

export default function MyEnrollments() {
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = () => {
    enrollmentAPI.categoryAthletes.list({ my: true }).then(({ data }) => {
      setEnrollments(Array.isArray(data) ? data : data.results ?? []);
      setLoading(false);
    });
  };

  useEffect(fetch, []);

  const handleWithdraw = async (id) => {
    if (!confirm('Withdraw from this category?')) return;
    await enrollmentAPI.categoryAthletes.delete(id);
    fetch();
  };

  const columns = [
    { key: 'event_name', label: 'Event', render: (r) => r.event_name || r.competition_name || '—' },
    { key: 'category_name', label: 'Category', render: (r) => r.category_name || '—' },
    { key: 'enrolled_date', label: 'Date', render: (r) => r.created_at?.split('T')[0] || '—' },
    {
      key: 'actions',
      label: '',
      render: (r) => (
        <button
          onClick={() => handleWithdraw(r.id)}
          className="text-xs text-red-500 hover:text-red-700"
        >
          Withdraw
        </button>
      ),
    },
  ];

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <>
      <PageHeader title="My Enrollments" subtitle="Categories you are registered for" />
      {enrollments.length === 0 ? (
        <EmptyState icon="📝" title="No enrollments" message="Browse events and enroll in categories." />
      ) : (
        <DataTable columns={columns} rows={enrollments} />
      )}
    </>
  );
}
