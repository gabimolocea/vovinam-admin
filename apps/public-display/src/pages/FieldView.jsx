import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@shared/lib/api';

const POLL_INTERVAL = 3000;

export default function FieldView() {
  const { fieldId } = useParams();
  const navigate = useNavigate();
  const [field, setField] = useState(null);
  const [scores, setScores] = useState([]);
  const [matches, setMatches] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  const intervalRef = useRef(null);

  const fetchData = async () => {
    try {
      const [fieldRes, scoreRes, matchRes] = await Promise.all([
        api.get(`/competition-fields/${fieldId}/`),
        api.get('/category-athlete-score/', { params: { field: fieldId, ordering: '-final_score', limit: 20 } }),
        api.get('/matches/', { params: { field: fieldId, status: 'in_progress' } }),
      ]);
      setField(fieldRes.data);
      setScores(Array.isArray(scoreRes.data) ? scoreRes.data : scoreRes.data.results ?? []);
      setMatches(Array.isArray(matchRes.data) ? matchRes.data : matchRes.data.results ?? []);
      setLastUpdate(new Date());
    } catch {
      /* keep stale */
    }
  };

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [fieldId]);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-700 bg-gray-950 px-6 py-3">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="text-gray-500 hover:text-white">
            ← 
          </button>
          <div>
            <h1 className="text-xl font-bold">{field?.name || `Field #${fieldId}`}</h1>
            <p className="text-xs text-gray-500">
              {field?.competition_name || 'Loading…'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
          <span className="text-xs text-gray-500">
            {lastUpdate?.toLocaleTimeString() || '…'}
          </span>
        </div>
      </div>

      <div className="p-6">
        {/* Active match on this field */}
        {matches.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-yellow-400">
              🥊 Now Fighting
            </h2>
            {matches.map((m) => (
              <div
                key={m.id}
                className="grid grid-cols-3 items-center rounded-2xl bg-gray-800 px-6 py-8 ring-2 ring-yellow-500/40"
              >
                <div className="text-center">
                  <p className="text-xs font-medium text-red-400">RED</p>
                  <p className="mt-1 text-xl font-bold">{m.athlete1_name || 'TBD'}</p>
                  <p className="mt-2 text-6xl font-black tabular-nums">{m.athlete1_score ?? 0}</p>
                </div>
                <div className="text-center text-3xl font-black text-gray-600">VS</div>
                <div className="text-center">
                  <p className="text-xs font-medium text-blue-400">BLUE</p>
                  <p className="mt-1 text-xl font-bold">{m.athlete2_name || 'TBD'}</p>
                  <p className="mt-2 text-6xl font-black tabular-nums">{m.athlete2_score ?? 0}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Ranking table */}
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-blue-400">
          📊 Scores
        </h2>
        {scores.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-gray-500">
            <span className="text-4xl">🏆</span>
            <p className="mt-2">Waiting for scores…</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-gray-800">
            <table className="w-full text-lg">
              <thead>
                <tr className="border-b border-gray-700 text-xs uppercase tracking-wider text-gray-400">
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Athlete</th>
                  <th className="px-4 py-3 text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {scores.map((s, i) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-bold text-gray-400">{s.rank ?? i + 1}</td>
                    <td className="px-4 py-3 font-semibold">{s.athlete_name || `#${s.athlete}`}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-green-400">
                      {s.final_score ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
