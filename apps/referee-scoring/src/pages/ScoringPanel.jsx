import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { categoryAPI, refereeAPI, enrollmentAPI, monitorAPI } from '@shared/lib/api';
import { useAuth } from '@shared';
import { Spinner } from '@shared/components/ui';

const POLL_INTERVAL = 2000;

export default function ScoringPanel() {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [category, setCategory] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [myScores, setMyScores] = useState([]); // CategoryRefereeScore[] for this referee
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draftScore, setDraftScore] = useState('');
  const [activeAthleteId, setActiveAthleteId] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);
  const pollRef = useRef(null);

  const myAthleteId = user?.athlete_id || user?.athlete?.id;

  const fetchAll = useCallback(async () => {
    try {
      const [catRes, athRes, scoresRes] = await Promise.all([
        categoryAPI.get(categoryId),
        enrollmentAPI.categoryAthletes.list({ category: categoryId }),
        refereeAPI.categoryScores.list({ category: categoryId }),
      ]);
      setCategory(catRes.data);
      const list = Array.isArray(athRes.data) ? athRes.data : athRes.data.results ?? [];
      setAthletes(list);
      const scores = Array.isArray(scoresRes.data) ? scoresRes.data : scoresRes.data.results ?? [];
      // Filter to only this referee's scores
      if (myAthleteId) {
        setMyScores(scores.filter(s => s.referee === myAthleteId));
      }

      // Fetch monitor session to detect active athlete
      if (catRes.data?.event) {
        const sessRes = await monitorAPI.sessions.list({ event_id: catRes.data.event });
        const sessions = Array.isArray(sessRes.data) ? sessRes.data : sessRes.data.results ?? [];
        const activeSess = sessions.find(s => s.current_category === parseInt(categoryId) && s.status !== 'idle');
        if (activeSess?.current_athlete) {
          setActiveAthleteId(activeSess.current_athlete);
        } else {
          setActiveAthleteId(null);
        }
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [categoryId, myAthleteId]);

  useEffect(() => {
    fetchAll();
    pollRef.current = setInterval(fetchAll, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [fetchAll]);

  // Clear success indicator after 3 seconds
  useEffect(() => {
    if (submitSuccess != null) {
      const t = setTimeout(() => setSubmitSuccess(null), 3000);
      return () => clearTimeout(t);
    }
  }, [submitSuccess]);

  const getMyScore = (athleteId) => {
    for (const s of myScores) {
      if (s.athlete === athleteId) return s;
    }
    return null;
  };

  const submitScore = async (athleteId) => {
    const scoreVal = parseFloat(draftScore);
    if (isNaN(scoreVal) || scoreVal < 0 || scoreVal > 100) {
      alert('Scorul trebuie să fie între 0 și 100');
      return;
    }
    setBusy(true);
    try {
      await refereeAPI.categoryScores.create({
        category: parseInt(categoryId),
        athlete: athleteId,
        score: scoreVal,
      });
      setDraftScore('');
      setSubmitSuccess(athleteId);
      fetchAll();
    } catch (err) {
      const d = err.response?.data;
      const msg = d?.detail || d?.error || (typeof d === 'object' ? JSON.stringify(d) : null) || 'Eroare la trimitere';
      alert(msg);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Spinner className="h-8 w-8 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!category) {
    return <p className="py-20 text-center text-gray-600 bg-gray-50 min-h-screen">Categoria nu a fost găsită.</p>;
  }

  const genderLabels = { male: 'Masculin', female: 'Feminin', mixt: 'Mixt' };

  return (
    <div className="flex flex-col bg-gray-50 text-gray-900" style={{ minHeight: '100dvh' }}>
      {/* ── Header ── */}
      <header className="flex items-center justify-between bg-gray-900 text-white px-3 py-2.5 shrink-0">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white text-sm font-bold flex items-center gap-1">&larr; ÎNAPOI</button>
        <h1 className="font-bold text-sm truncate">{category.name}</h1>
        <div className="w-8" />
      </header>

      {/* Category info tags */}
      <div className="flex items-center justify-center gap-2 px-3 py-2 bg-white border-b border-gray-200 shrink-0 flex-wrap">
        {category.group_name && <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-0.5">{category.group_name}</span>}
        {category.gender && <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-0.5">{genderLabels[category.gender] || category.gender}</span>}
        <span className="text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 uppercase">{category.type === 'teams' ? 'Echipe' : 'Solo'}</span>
      </div>

      {/* ── Athletes table ── */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: activeAthleteId && !getMyScore(activeAthleteId) ? '10rem' : '0' }}>
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-100">
              <th className="text-left px-3 py-2.5 text-xs font-bold text-gray-600 border-b-2 border-gray-300">#</th>
              <th className="text-left px-3 py-2.5 text-xs font-bold text-gray-600 border-b-2 border-gray-300">Sportiv</th>
              <th className="text-center px-3 py-2.5 text-xs font-bold text-gray-600 border-b-2 border-gray-300 w-20">Scor</th>
              <th className="text-center px-2 py-2.5 text-xs font-bold text-gray-600 border-b-2 border-gray-300 w-12">✓</th>
            </tr>
          </thead>
          <tbody>
            {athletes.length === 0 && (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400 italic">Niciun sportiv înscris.</td></tr>
            )}
            {athletes.map((entry, idx) => {
              const athleteId = entry.athlete || entry.id;
              const d = entry.athlete_details || {};
              const name = `${d.last_name || ''} ${d.first_name || ''}`.trim() || entry.athlete_name || entry.full_name || `Sportiv #${athleteId}`;
              const clubName = d.club?.name || d.club_name || entry.club_name || '';
              const isActive = athleteId === activeAthleteId;
              const existingScore = getMyScore(athleteId);
              const justSubmitted = submitSuccess === athleteId;

              return (
                <tr key={athleteId} className={`${
                  isActive ? 'bg-green-50 ring-2 ring-green-300 ring-inset' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                } transition`}>
                  <td className="px-3 py-3 border-b border-gray-200 text-gray-400 text-xs">{idx + 1}</td>
                  <td className="px-3 py-3 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      {isActive && (
                        <span className="relative flex h-2 w-2 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                        </span>
                      )}
                      <div>
                        <p className={`font-semibold ${isActive ? 'text-green-800' : 'text-gray-900'} text-sm`}>{name}</p>
                        {clubName && <p className="text-[10px] text-gray-400">{clubName}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 border-b border-gray-200 text-center">
                    {existingScore ? (
                      <span className="text-lg font-black text-gray-900 tabular-nums">{Number(existingScore.score).toFixed(1)}</span>
                    ) : (
                      <span className="text-gray-300 text-sm">—</span>
                    )}
                  </td>
                  <td className="px-2 py-3 border-b border-gray-200 text-center">
                    {existingScore || justSubmitted ? (
                      <span className="text-green-600 text-sm font-bold">✓</span>
                    ) : isActive ? (
                      <span className="text-xs text-green-600 font-bold animate-pulse">LIVE</span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Bottom: Active athlete scoring panel (fixed) ── */}
      {activeAthleteId && !getMyScore(activeAthleteId) && (() => {
        const entry = athletes.find(a => (a.athlete || a.id) === activeAthleteId);
        if (!entry) return null;
        const d = entry.athlete_details || {};
        const name = `${d.last_name || ''} ${d.first_name || ''}`.trim() || `Sportiv #${activeAthleteId}`;
        return (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-green-400 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] z-40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-green-600 font-bold uppercase">Prezintă acum</p>
                <p className="text-base font-black text-gray-900">{name}</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={draftScore}
                  onChange={(e) => setDraftScore(e.target.value)}
                  className="w-20 border-2 border-green-400 px-2 py-2.5 text-center text-xl font-black focus:border-green-600 focus:ring-1 focus:ring-green-600"
                  placeholder="0-100"
                  autoFocus
                />
                <button
                  onClick={() => submitScore(activeAthleteId)}
                  disabled={busy || !draftScore}
                  className="bg-green-600 text-white px-6 py-2.5 text-base font-black hover:bg-green-700 disabled:opacity-40 active:scale-95 transition"
                >Trimite</button>
              </div>
            </div>
            {/* Quick score buttons */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {[10, 20, 30, 40, 50, 60, 70, 80, 85, 90, 95, 100].map(v => (
                <button key={v} onClick={() => setDraftScore(String(v))}
                  className={`shrink-0 px-3 py-1.5 text-sm font-bold border transition ${
                    draftScore === String(v) ? 'bg-green-600 text-white border-green-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}>{v}</button>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
