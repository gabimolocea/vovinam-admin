import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { competitionAPI } from '@shared/lib/api';
import { PageHeader, Card, StatusBadge, Spinner } from '@shared/components/ui';

export default function CompetitionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [comp, setComp] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      competitionAPI.get(id),
      competitionAPI.stats(id).catch(() => ({ data: null })),
    ]).then(([compRes, statsRes]) => {
      setComp(compRes.data);
      setStats(statsRes.data);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!comp) return <p className="py-20 text-center text-gray-500">Competition not found.</p>;

  return (
    <>
      <PageHeader title={comp.name} subtitle={comp.location}>
        <StatusBadge status={comp.status} />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Details card */}
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold">Details</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-gray-500">Start Date</dt>
              <dd className="font-medium">{comp.start_date}</dd>
            </div>
            <div>
              <dt className="text-gray-500">End Date</dt>
              <dd className="font-medium">{comp.end_date || '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Location</dt>
              <dd className="font-medium">{comp.location || '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Organizer</dt>
              <dd className="font-medium">{comp.organizer_name || '—'}</dd>
            </div>
          </dl>
          {comp.description && (
            <p className="mt-4 text-sm text-gray-600">{comp.description}</p>
          )}
        </Card>

        {/* Stats card */}
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Statistics</h2>
          {stats ? (
            <div className="space-y-3 text-sm">
              {Object.entries(stats).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="capitalize text-gray-500">{key.replace(/_/g, ' ')}</span>
                  <span className="font-semibold">{value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No statistics available.</p>
          )}
        </Card>
      </div>

      {/* Quick links */}
      <div className="mt-6 flex gap-3">
        <Link
          to={`/competitions/${id}/categories`}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Manage Categories
        </Link>
        <Link
          to={`/competitions/${id}/fields`}
          className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300"
        >
          Manage Fields
        </Link>
        <Link
          to={`/competitions/${id}/results`}
          className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300"
        >
          View Results
        </Link>
      </div>
    </>
  );
}
