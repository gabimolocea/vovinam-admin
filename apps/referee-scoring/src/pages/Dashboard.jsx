import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { refereeAPI } from '@shared/lib/api';
import { useAuth } from '@shared';
import { Spinner } from '@shared/components/ui';

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

  const hasNothing = categories.length === 0 && matches.length === 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Panou Arbitraj</h1>
            <p className="text-xs text-gray-500">{user?.first_name || user?.email}</p>
          </div>
          <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-gray-700 font-medium">
            Deconectare
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 py-6">
        {hasNothing && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <span className="text-gray-400 text-2xl font-bold">?</span>
            </div>
            <p className="font-bold text-gray-700">Nicio probă activă</p>
            <p className="mt-1 text-sm text-gray-500">Nu aveți probe sau meciuri asignate momentan.</p>
          </div>
        )}

        {/* Categories */}
        {categories.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Categorii asignate</h2>
            <div className="grid gap-3">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => navigate(`/category/${cat.id}/score`)}
                  className="text-left rounded-xl border border-gray-200 bg-white p-4 hover:border-blue-400 hover:shadow-md transition-all group"
                >
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-blue-700 truncate">
                    {cat.name || cat.category_name}
                  </h3>
                  <p className="text-xs text-gray-500 capitalize mt-0.5">{cat.category_type} · {cat.gender}</p>
                  <span className="inline-block mt-2 text-[10px] text-blue-600 font-medium">
                    Punctează →
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Matches */}
        {matches.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Meciuri asignate</h2>
            <div className="grid gap-3">
              {matches.map((match) => (
                <button
                  key={match.id}
                  onClick={() => navigate(`/match/${match.id}/score`)}
                  className="text-left rounded-xl border border-gray-200 bg-white p-4 hover:border-blue-400 hover:shadow-md transition-all group"
                >
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-blue-700">
                    <span className="text-red-600">{match.red_corner_full_name || 'TBD'}</span>
                    {' vs '}
                    <span className="text-blue-600">{match.blue_corner_full_name || 'TBD'}</span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">{match.category_name || `Meci #${match.id}`}</p>
                  <span className="inline-block mt-2 text-[10px] text-blue-600 font-medium">
                    Punctează →
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
