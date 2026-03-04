import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { competitionAPI } from '@shared/lib/api';
import { PageHeader, Card, StatusBadge, Spinner, EmptyState } from '@shared/components/ui';

export default function CompetitionList() {
  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    competitionAPI.list().then(({ data }) => {
      setCompetitions(Array.isArray(data) ? data : data.results ?? []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <>
      <PageHeader title="Competitions" subtitle="Manage all competitions and events">
        <button
          onClick={() => navigate('/competitions/new')}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          + New Competition
        </button>
      </PageHeader>

      {competitions.length === 0 ? (
        <EmptyState icon="🏆" title="No competitions yet" message="Create your first competition to get started." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {competitions.map((comp) => (
            <Card
              key={comp.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
            >
              <div onClick={() => navigate(`/competitions/${comp.id}`)}>
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold text-gray-900">{comp.name}</h3>
                  <StatusBadge status={comp.status} />
                </div>
                <p className="mt-1 text-sm text-gray-500">{comp.location}</p>
                <div className="mt-3 flex gap-4 text-xs text-gray-400">
                  <span>📅 {comp.start_date}</span>
                  {comp.end_date && <span>→ {comp.end_date}</span>}
                </div>
              </div>
              <div className="mt-4 flex gap-2 border-t border-gray-100 pt-3">
                <button
                  onClick={() => navigate(`/competitions/${comp.id}/categories`)}
                  className="rounded bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                >
                  Categories
                </button>
                <button
                  onClick={() => navigate(`/competitions/${comp.id}/fields`)}
                  className="rounded bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                >
                  Fields
                </button>
                <button
                  onClick={() => navigate(`/competitions/${comp.id}/results`)}
                  className="rounded bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                >
                  Results
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
