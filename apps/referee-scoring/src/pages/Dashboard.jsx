import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { refereeAPI } from '@shared/lib/api';
import { useAuth } from '@shared';
import { Spinner, formatGroupBadgeLabel } from '@shared/components/ui';

const STATUS_CFG = {
  in_progress: { dot: 'bg-emerald-500 animate-pulse', border: 'border-black' },
};

const GENDER_LABELS = { male: 'Masculin', female: 'Feminin', mixt: 'Mixt' };
const MATCH_TYPE_LABELS = { qualifications: 'Calificări', 'quarter-finals': 'Sferturi', 'semi-finals': 'Semi-finală', finals: 'Finală', bronze: 'Bronz' };

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
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Spinner />
      </div>
    );
  }

  const hasNothing = categories.length === 0 && matches.length === 0;
  const activeStatus = STATUS_CFG.in_progress;

  return (
    <div className="frvv-shell">
      {/* Header */}
      <header className="frvv-shell-header px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black uppercase tracking-wide text-yellow-200">Panou Arbitraj</h1>
            <p className="text-xs text-yellow-100/75">{user?.first_name || user?.email}</p>
          </div>
          <button onClick={handleLogout} className="border border-yellow-400/50 px-2.5 py-1 text-xs font-semibold text-yellow-100 hover:bg-yellow-300 hover:text-black">
            Deconectare
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-4 py-6">
        {hasNothing && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center border-2 border-black bg-yellow-200">
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
                <div
                  key={cat.id}
                  className={`flex flex-wrap items-center gap-2 border px-3 py-2.5 transition sm:gap-2.5 sm:px-4 sm:py-3 ${activeStatus.border} bg-yellow-50/60 hover:shadow-sm`}
                >
                  <span className={`h-3.5 w-3.5 shrink-0 ${activeStatus.dot}`} />
                  <div className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-gray-900 md:text-base whitespace-normal break-words">{cat.name || cat.category_name}</span>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {cat.group_name && <span className="border border-black bg-white px-1.5 py-0.5 text-xs text-gray-500">{formatGroupBadgeLabel(cat.group_name, cat)}</span>}
                      {cat.gender && <span className="border border-black bg-yellow-100 px-1.5 py-0.5 text-xs text-gray-700">{GENDER_LABELS[cat.gender] || cat.gender}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/category/${cat.id}/score`)}
                    className="mt-2 w-full border border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 sm:mt-0 sm:w-auto sm:shrink-0"
                  >
                    PUNCTEAZĂ
                  </button>
                </div>
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
                <div
                  key={match.id}
                  className={`flex flex-wrap items-center gap-2 border px-3 py-2.5 transition sm:gap-2.5 sm:px-4 sm:py-3 ${activeStatus.border} bg-yellow-50/60 hover:shadow-sm`}
                >
                  <span className={`h-3.5 w-3.5 shrink-0 ${activeStatus.dot}`} />
                  <div className="flex-1 min-w-0">
                    <span className="block text-sm font-bold md:text-base whitespace-normal break-words">
                      <span className="text-gray-400 mr-1">ID {match.id}</span>
                      <span className="text-gray-900">{match.red_corner_full_name || 'TBD'}</span>
                      <span className="text-gray-400 mx-1">vs</span>
                      <span className="text-gray-700">{match.blue_corner_full_name || 'TBD'}</span>
                    </span>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {(match.category_name || `Meci #${match.id}`) && (
                        <span className="border border-black bg-white px-1.5 py-0.5 text-xs text-gray-500">{match.category_name || `Meci #${match.id}`}</span>
                      )}
                      {match.category_group_name && <span className="border border-black bg-white px-1.5 py-0.5 text-xs text-gray-500">{formatGroupBadgeLabel(match.category_group_name, match)}</span>}
                      {match.category_gender && <span className="border border-black bg-yellow-100 px-1.5 py-0.5 text-xs text-gray-700">{GENDER_LABELS[match.category_gender] || match.category_gender}</span>}
                    </div>
                    {match.match_type && (
                      <span className="block mt-1 text-xs text-gray-500 whitespace-normal break-words">
                        <span className="font-semibold text-gray-800">{MATCH_TYPE_LABELS[match.match_type] || match.match_type}</span>
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => navigate(`/match/${match.id}/score`)}
                    className="mt-2 w-full border border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 sm:mt-0 sm:w-auto sm:shrink-0"
                  >
                    PUNCTEAZĂ
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
