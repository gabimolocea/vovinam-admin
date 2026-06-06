import { useEffect, useState, useRef } from 'react';
import api from '@shared/lib/api';

const POLL_INTERVAL = 5000; // 5 seconds

export default function LiveScoreboard() {
  const [scores, setScores] = useState([]);
  const [matches, setMatches] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  const intervalRef = useRef(null);

  const fetchData = async () => {
    try {
      const [scoreRes, matchRes] = await Promise.all([
        api.get('/category-athlete-score/', { params: { status: 'approved', limit: 50, ordering: '-final_score' } }),
        api.get('/matches/', { params: { status: 'in_progress' } }),
      ]);
      setScores(Array.isArray(scoreRes.data) ? scoreRes.data : scoreRes.data.results ?? []);
      setMatches(Array.isArray(matchRes.data) ? matchRes.data : matchRes.data.results ?? []);
      setLastUpdate(new Date());
    } catch {
      /* network error — keep showing stale data */
    }
  };

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-gray-700 bg-gray-950 px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-black">🥋 FRVV</span>
          <span className="text-lg font-semibold text-gray-300">Live Scores</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
          <span className="text-xs text-gray-500">
            {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString()}` : 'Loading…'}
          </span>
        </div>
      </div>

      <div className="grid gap-6 p-6 lg:grid-cols-2">
        {/* Live Matches */}
        {matches.length > 0 && (
          <section>
            <h2 className="mb-4 text-xl font-bold text-yellow-400">🥊 Live Matches</h2>
            <div className="space-y-4">
              {matches.map((m) => (
                <div
                  key={m.id}
                  className="overflow-hidden rounded-xl bg-gray-800 ring-2 ring-yellow-500/30"
                >
                  <div className="grid grid-cols-3 items-center px-4 py-5">
                    {/* Athlete 1 */}
                    <div className="text-center">
                      <p className="text-sm font-medium text-red-300">RED</p>
                      <p className="text-lg font-bold">{m.athlete1_name || 'TBD'}</p>
                      <p className="mt-1 text-4xl font-black tabular-nums">
                        {m.athlete1_score ?? 0}
                      </p>
                    </div>

                    {/* VS */}
                    <div className="text-center">
                      <span className="text-2xl font-black text-gray-500">VS</span>
                      <p className="mt-1 text-xs text-gray-400">{m.category_name || ''}</p>
                    </div>

                    {/* Athlete 2 */}
                    <div className="text-center">
                      <p className="text-sm font-medium text-blue-300">BLUE</p>
                      <p className="text-lg font-bold">{m.athlete2_name || 'TBD'}</p>
                      <p className="mt-1 text-4xl font-black tabular-nums">
                        {m.athlete2_score ?? 0}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Category scores */}
        <section>
          <h2 className="mb-4 text-xl font-bold text-blue-400">📊 Category Rankings</h2>
          {scores.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl bg-gray-800 py-16">
              <span className="text-5xl">🏆</span>
              <p className="mt-3 text-lg text-gray-400">Waiting for scores…</p>
              <p className="mt-1 animate-pulse-slow text-sm text-gray-600">
                Results will appear live
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl bg-gray-800">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700 text-xs uppercase tracking-wider text-gray-400">
                    <th className="px-4 py-3 text-left">Rank</th>
                    <th className="px-4 py-3 text-left">Athlete</th>
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {scores.map((s, i) => (
                    <tr key={s.id} className="transition-colors hover:bg-gray-700/30">
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                            i === 0
                              ? 'bg-yellow-500 text-black'
                              : i === 1
                                ? 'bg-gray-300 text-black'
                                : i === 2
                                  ? 'bg-amber-700 text-white'
                                  : 'bg-gray-700 text-gray-300'
                          }`}
                        >
                          {s.rank ?? i + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {s.athlete_name || `#${s.athlete}`}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {s.category_name || '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-xl font-bold tabular-nums text-green-400">
                        {s.final_score ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
