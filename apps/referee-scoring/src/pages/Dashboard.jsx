import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { refereeAPI } from '@shared/lib/api';
import { useAuth } from '@shared';
import { Spinner, Card, EmptyState } from '@shared/components/ui';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAssignments = () => {
      Promise.all([
        refereeAPI.assignedCategories().catch(() => ({ data: [] })),
        refereeAPI.assignedMatches().catch(() => ({ data: [] })),
      ]).then(([catRes, matchRes]) => {
        const allCats = Array.isArray(catRes.data) ? catRes.data : catRes.data.results ?? [];
        const allMatches = Array.isArray(matchRes.data) ? matchRes.data : matchRes.data.results ?? [];
        // Only show categories/matches that are currently in progress
        setCategories(allCats.filter(c => c.field_status === 'in_progress'));
        setMatches(allMatches.filter(m => m.field_status === 'in_progress'));
        setLoading(false);
      });
    };
    fetchAssignments();
    const interval = setInterval(fetchAssignments, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-blue-900 px-4 py-3 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">🥋 Referee Panel</h1>
            <p className="text-xs text-blue-200">{user?.first_name || user?.email}</p>
          </div>
          <button onClick={handleLogout} className="text-xs text-blue-200 hover:text-white">
            Logout
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-lg space-y-6 px-4 py-6">
        {/* Solo/Team Categories */}
        <section>
          <h2 className="mb-3 text-lg font-bold text-gray-900">📋 Assigned Categories</h2>
          {categories.length === 0 ? (
            <EmptyState icon="📋" title="No categories" message="No categories assigned to you yet." />
          ) : (
            <div className="space-y-2">
              {categories.map((cat) => (
                <Card
                  key={cat.id}
                  className="cursor-pointer transition-shadow hover:shadow-md active:bg-gray-50"
                >
                  <div onClick={() => navigate(`/category/${cat.id}/score`)}>
                    <h3 className="font-semibold text-gray-900">{cat.name || cat.category_name}</h3>
                    <p className="text-xs text-gray-500 capitalize">{cat.category_type} · {cat.gender}</p>
                    <p className="mt-2 text-sm font-medium text-blue-600">Tap to score →</p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Fight Matches */}
        <section>
          <h2 className="mb-3 text-lg font-bold text-gray-900">🥊 Assigned Matches</h2>
          {matches.length === 0 ? (
            <EmptyState icon="🥊" title="No matches" message="No fight matches assigned yet." />
          ) : (
            <div className="space-y-2">
              {matches.map((match) => (
                <Card
                  key={match.id}
                  className="cursor-pointer transition-shadow hover:shadow-md active:bg-gray-50"
                >
                  <div onClick={() => navigate(`/match/${match.id}/score`)}>
                    <h3 className="font-semibold text-gray-900">
                      <span className="text-red-600">{match.red_corner_full_name || 'TBD'}</span>
                      {' vs '}
                      <span className="text-blue-600">{match.blue_corner_full_name || 'TBD'}</span>
                    </h3>
                    <p className="text-xs text-gray-500">{match.category_name || `Meci #${match.id}`}</p>
                    <p className="mt-2 text-sm font-medium text-blue-600">Apasă pentru a puncta →</p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
