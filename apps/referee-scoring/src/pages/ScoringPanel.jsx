import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { categoryAPI, refereeAPI, enrollmentAPI, monitorAPI } from '@shared/lib/api';
import { useAuth } from '@shared';
import { Spinner } from '@shared/components/ui';

const POLL_INTERVAL = 2000;
const MAX_SCORE = 100;

export default function ScoringPanel() {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [category, setCategory] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [myScores, setMyScores] = useState([]); // CategoryRefereeScore[] for this referee
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activeAthleteId, setActiveAthleteId] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);
  const [draftScore, setDraftScore] = useState(MAX_SCORE);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
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

  // Reset draft score when active athlete changes
  const prevActiveRef = useRef(null);
  useEffect(() => {
    if (activeAthleteId && activeAthleteId !== prevActiveRef.current) {
      const existing = myScores.find(s => s.athlete === activeAthleteId);
      setDraftScore(existing ? Math.round(Number(existing.score)) : MAX_SCORE);
    }
    prevActiveRef.current = activeAthleteId;
  }, [activeAthleteId, myScores]);

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

  const adjustScore = (amount) => {
    setDraftScore(prev => {
      const next = prev + amount;
      return Math.max(0, Math.min(MAX_SCORE, next));
    });
  };

  const resetScore = () => setDraftScore(MAX_SCORE);

  const submitScore = async (athleteId) => {
    if (draftScore < 0 || draftScore > MAX_SCORE) {
      alert('Scorul trebuie să fie între 0 și 100');
      return;
    }
    setBusy(true);
    try {
      await refereeAPI.categoryScores.create({
        category: parseInt(categoryId),
        athlete: athleteId,
        score: draftScore,
      });
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
  const hasActiveScoring = activeAthleteId && !getMyScore(activeAthleteId);

  return (
    <div className="flex flex-col bg-gray-50 text-gray-900" style={{ height: '100dvh' }}>
      {/* ── Header — similar to MatchScoring ── */}
      <header className="flex items-center justify-between bg-white border-b border-gray-200 px-3 py-2 shrink-0">
        <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-800 text-sm font-bold flex items-center gap-1">&larr; ÎNAPOI</button>
        <h1 className="font-bold text-sm text-gray-600 truncate">{category.name}</h1>
        <div className="w-8" />
      </header>

      {/* Category info tags */}
      <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-100 shrink-0 flex-wrap">
        {category.group_name && <span className="text-xs font-bold text-gray-600 bg-gray-200 px-2 py-0.5">{category.group_name}</span>}
        {category.gender && <span className="text-xs font-bold text-gray-600 bg-gray-200 px-2 py-0.5">{genderLabels[category.gender] || category.gender}</span>}
        <span className="text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 uppercase">{category.type === 'teams' ? 'Echipe' : 'Solo'}</span>
      </div>

      {/* ── Athletes table ── */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: hasActiveScoring ? '52dvh' : '0' }}>
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-100">
                <th className="text-center px-1.5 py-2 text-xs font-bold text-gray-600 border border-gray-300 w-8">#</th>
                <th className="text-left px-3 py-2 text-xs font-bold text-gray-600 border border-gray-300">Sportiv</th>
                <th className="text-center px-2 py-2 text-xs font-bold text-gray-600 border border-gray-300 w-16">Scor</th>
                <th className="text-center px-1.5 py-2 text-xs font-bold text-gray-600 border border-gray-300 w-10">✓</th>
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
                    isActive ? 'bg-green-50' : 'bg-white'
                  } transition`}>
                    <td className="px-1.5 py-2.5 border border-gray-300 text-center text-gray-400 text-xs tabular-nums">{idx + 1}</td>
                    <td className="px-3 py-2.5 border border-gray-300">
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
                    <td className="px-2 py-2.5 border border-gray-300 text-center">
                      {existingScore ? (
                        <span className="text-lg font-black text-gray-900 tabular-nums">{Math.round(Number(existingScore.score))}</span>
                      ) : (
                        <span className="text-gray-300 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-1.5 py-2.5 border border-gray-300 text-center">
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
      </div>

      {/* ── Bottom: Active athlete scoring panel (fixed, half screen) ── */}
      {hasActiveScoring && (() => {
        const entry = athletes.find(a => (a.athlete || a.id) === activeAthleteId);
        if (!entry) return null;
        const d = entry.athlete_details || {};
        const name = `${d.last_name || ''} ${d.first_name || ''}`.trim() || `Sportiv #${activeAthleteId}`;
        return (
          <div className="fixed bottom-0 left-0 right-0 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.1)] z-40 flex flex-col" style={{ height: '50dvh' }}>
            {/* Score display — centered large score + small reset button */}
            <div className="flex items-center justify-center gap-3 px-4 py-2 bg-green-50 border-b border-green-200 shrink-0">
              <div className="text-center">
                <p className="text-5xl font-black text-gray-900 tabular-nums leading-none">{draftScore}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">din {MAX_SCORE}</p>
              </div>
              <button onClick={() => setShowResetConfirm(true)} disabled={busy}
                className="text-[10px] font-bold text-gray-500 bg-gray-200 hover:bg-gray-300 active:bg-gray-400 px-2 py-1 disabled:opacity-40 transition-all">
                Resetează Scor
              </button>
            </div>

            {/* Scoring buttons — fills remaining space */}
            <div className="flex-1 min-h-0 flex flex-col p-3 gap-2">
              {/* -1 / -2 buttons (top, larger) */}
              <div className="grid grid-cols-2 gap-2 flex-[3] min-h-0">
                <button onClick={() => adjustScore(-1)} disabled={busy || draftScore <= 0}
                  className="bg-red-400 hover:bg-red-500 active:bg-red-600 active:scale-[0.98] text-white text-5xl font-black disabled:opacity-40 transition-all flex items-center justify-center">
                  -1
                </button>
                <button onClick={() => adjustScore(-2)} disabled={busy || draftScore <= 0}
                  className="bg-red-500 hover:bg-red-600 active:bg-red-700 active:scale-[0.98] text-white text-5xl font-black disabled:opacity-40 transition-all flex items-center justify-center">
                  -2
                </button>
              </div>

              {/* +1 / +2 buttons (bottom, smaller) */}
              <div className="grid grid-cols-2 gap-2 flex-[1] min-h-0">
                <button onClick={() => adjustScore(1)} disabled={busy || draftScore >= MAX_SCORE}
                  className="bg-green-400 hover:bg-green-500 active:bg-green-600 active:scale-[0.98] text-white text-2xl font-black disabled:opacity-40 transition-all flex items-center justify-center">
                  +1
                </button>
                <button onClick={() => adjustScore(2)} disabled={busy || draftScore >= MAX_SCORE}
                  className="bg-green-500 hover:bg-green-600 active:bg-green-700 active:scale-[0.98] text-white text-2xl font-black disabled:opacity-40 transition-all flex items-center justify-center">
                  +2
                </button>
              </div>

              {/* Submit row */}
              <div className="shrink-0">
                <button onClick={() => submitScore(activeAthleteId)} disabled={busy}
                  className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white py-3 text-lg font-black disabled:opacity-40 transition-all active:scale-[0.98]">
                  TRIMITE SCOR
                </button>
              </div>
            </div>
          </div>

          {/* Reset confirm modal */}
          {showResetConfirm && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowResetConfirm(false)}>
              <div className="bg-white shadow-2xl p-6 max-w-sm w-full text-center space-y-4" onClick={e => e.stopPropagation()}>
                <div className="w-14 h-14 bg-amber-100 flex items-center justify-center mx-auto">
                  <span className="text-amber-600 text-2xl font-black">!</span>
                </div>
                <h3 className="text-lg font-bold text-gray-900">Resetează scorul?</h3>
                <p className="text-sm text-gray-600">Scorul va fi resetat la <span className="font-bold">{MAX_SCORE}</span> puncte.</p>
                <div className="flex gap-2">
                  <button onClick={() => setShowResetConfirm(false)}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-3 font-bold text-base transition">
                    Anulează
                  </button>
                  <button onClick={() => { setShowResetConfirm(false); resetScore(); }}
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-3 font-bold text-base transition">
                    Resetează
                  </button>
                </div>
              </div>
            </div>
          )}
        );
      })()}
    </div>
  );
}
