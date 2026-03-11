import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { categoryAPI, refereeAPI, enrollmentAPI, monitorAPI, refereePresenceAPI } from '@shared/lib/api';
import { useAuth } from '@shared';
import { Spinner, formatGroupBadgeLabel } from '@shared/components/ui';

const POLL_INTERVAL = 2000;
const MAX_SCORE = 100;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
const MODAL_SECONDARY_BUTTON = 'border border-black bg-white px-4 py-2.5 font-semibold text-gray-700 transition hover:bg-yellow-100 hover:text-black disabled:opacity-40';
const MODAL_SUCCESS_BUTTON = 'border border-black bg-green-600 px-4 py-2.5 font-bold text-white transition hover:bg-green-700 disabled:opacity-40';

function FullscreenStyleModal({ onClose, title, description, maxWidth = 'max-w-md', actions, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
      <div className={`w-full ${maxWidth} overflow-hidden border-2 border-black bg-white shadow-2xl`} onClick={e => e.stopPropagation()}>
        <div className="border-b-2 border-black bg-yellow-300 px-5 py-4">
          <div>
            <h3 className="text-xl font-black text-gray-900">{title}</h3>
            {description ? <p className="mt-1 text-sm text-gray-700">{description}</p> : null}
          </div>
        </div>
        {children ? <div className="space-y-4 px-5 py-4">{children}</div> : null}
        {actions ? (
          <div className="flex flex-col-reverse gap-2 border-t-2 border-black bg-gray-50 px-5 py-4 sm:flex-row sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ScoringPanel() {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [category, setCategory] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [myScores, setMyScores] = useState([]); // CategoryRefereeScore[] for this referee
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activeAthleteId, setActiveAthleteId] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);
  const [draftScore, setDraftScore] = useState(MAX_SCORE);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showFinishedPopup, setShowFinishedPopup] = useState(false);
  const finishedShownRef = useRef(false);
  const pollRef = useRef(null);

  const myAthleteId = user?.athlete_id || user?.athlete?.id;
  const isTeamCategory = ['team', 'teams'].includes(category?.type);

  const getEntryAthleteId = useCallback((entry) => {
    if (!entry) return null;
    if (isTeamCategory) {
      return entry.team_details?.members?.[0]?.id
        ?? entry.members?.[0]?.id
        ?? entry.athlete
        ?? entry.id
        ?? null;
    }
    return entry.athlete || entry.id || null;
  }, [isTeamCategory]);

  const getEntryTeamId = useCallback((entry) => {
    if (!entry || !isTeamCategory) return null;
    return entry.team || entry.team_details?.id || null;
  }, [isTeamCategory]);

  const getEntryName = useCallback((entry) => {
    if (!entry) return '';
    if (isTeamCategory) {
      return entry.team_name || entry.team_details?.name || `Echipă #${getEntryTeamId(entry) || entry.id}`;
    }
    const d = entry.athlete_details || {};
    return `${d.last_name || ''} ${d.first_name || ''}`.trim() || entry.athlete_name || entry.full_name || `Sportiv #${getEntryAthleteId(entry)}`;
  }, [getEntryAthleteId, getEntryTeamId, isTeamCategory]);

  const getEntryClubName = useCallback((entry) => {
    if (!entry) return '';
    if (isTeamCategory) {
      return entry.club_name || entry.team_details?.club_name || '';
    }
    const d = entry.athlete_details || {};
    return d.club?.name || d.club_name || entry.club_name || '';
  }, [isTeamCategory]);

  const clearPresence = useCallback(async () => {
    if (!myAthleteId || !categoryId) return;
    try {
      await refereePresenceAPI.clear({ category: parseInt(categoryId), referee: myAthleteId });
    } catch {}
  }, [categoryId, myAthleteId]);

  const clearPresenceBeacon = useCallback(() => {
    if (!myAthleteId || !categoryId) return;
    const token = localStorage.getItem('authToken');
    fetch(`${API_BASE_URL}/referee-presence/clear/`, {
      method: 'POST',
      keepalive: true,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ category: parseInt(categoryId), referee: myAthleteId }),
    }).catch(() => {});
  }, [categoryId, myAthleteId]);

  const fetchAll = useCallback(async () => {
    try {
      const catRes = await categoryAPI.get(categoryId);
      const categoryType = catRes.data?.type;
      const useTeams = categoryType === 'team' || categoryType === 'teams';
      const [athRes, scoresRes] = await Promise.all([
        useTeams
          ? enrollmentAPI.categoryTeams.list({ category: categoryId })
          : enrollmentAPI.categoryAthletes.list({ category: categoryId }),
        refereeAPI.categoryScores.list({ category: categoryId }),
      ]);
      setCategory(catRes.data);
      const list = Array.isArray(athRes.data) ? athRes.data : athRes.data.results ?? [];
      setAthletes(list);
      const scores = Array.isArray(scoresRes.data) ? scoresRes.data : scoresRes.data.results ?? [];
      // Filter to only this referee's scores
      if (myAthleteId) {
        setMyScores(scores.filter(s => s.referee === myAthleteId));
        // Heartbeat ping — report presence on this scoring page
        try { await refereePresenceAPI.ping({ category: parseInt(categoryId), referee: myAthleteId }); } catch {}
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

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handlePageHide = () => clearPresenceBeacon();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [clearPresenceBeacon]);

  useEffect(() => () => {
    clearPresenceBeacon();
  }, [clearPresenceBeacon]);

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

  const submitScore = async (entry) => {
    const athleteId = getEntryAthleteId(entry);
    const teamId = getEntryTeamId(entry);
    if (draftScore < 0 || draftScore > MAX_SCORE) {
      alert('Scorul trebuie să fie între 0 și 100');
      return;
    }
    if (!athleteId) {
      alert(isTeamCategory ? 'Nu s-a putut identifica echipa activă.' : 'Nu s-a putut identifica sportivul activ.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        category: parseInt(categoryId),
        score: draftScore,
      };
      if (isTeamCategory && teamId) {
        payload.team_id = teamId;
      } else {
        payload.athlete = athleteId;
      }
      await refereeAPI.categoryScores.create(payload);
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

  const genderLabels = { male: 'Masculin', female: 'Feminin', mixt: 'Mixt' };
  const hasActiveScoring = activeAthleteId && !getMyScore(activeAthleteId);
  const activeEntry = athletes.find(entry => getEntryAthleteId(entry) === activeAthleteId) || null;
  const allScored = athletes.length > 0 && athletes.every(entry => {
    const athleteId = getEntryAthleteId(entry);
    return athleteId ? !!getMyScore(athleteId) : false;
  });

  // Auto-show finished popup once when all athletes scored
  useEffect(() => {
    if (allScored && !finishedShownRef.current) {
      finishedShownRef.current = true;
      setShowFinishedPopup(true);
    }
  }, [allScored]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!category) {
    return <p className="py-20 text-center text-gray-600 bg-white min-h-screen">Categoria nu a fost găsită.</p>;
  }

  const handleBack = async () => {
    await clearPresence();
    navigate('/');
  };

  return (
    <div className="flex flex-col bg-white text-gray-900" style={{ height: '100dvh' }}>
      {/* ── Header — similar to MatchScoring ── */}
      <header className="flex items-center justify-between border-b-2 border-yellow-400 bg-black px-3 py-2 text-white shrink-0">
        <button onClick={handleBack} className="text-yellow-100 hover:text-yellow-300 text-sm font-bold flex items-center gap-1">&larr; ÎNAPOI</button>
        <h1 className="font-black text-sm uppercase tracking-wide text-yellow-200 truncate">{category.name}</h1>
        <div className={`flex items-center gap-1.5 px-2 py-1 border text-[11px] font-bold whitespace-nowrap ${isOnline ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          <span className={`inline-block w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
          {isOnline ? 'Conectat' : 'Fără conexiune'}
        </div>
      </header>

      {/* Category info tags */}
      <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-yellow-100 border-b-2 border-black shrink-0 flex-wrap">
        {category.group_name && <span className="frvv-chip">{formatGroupBadgeLabel(category.group_name, category)}</span>}
        {category.gender && <span className="frvv-chip">{genderLabels[category.gender] || category.gender}</span>}
        <span className="frvv-chip uppercase">{isTeamCategory ? 'Echipe' : 'Solo'}</span>
      </div>

      {/* ── Athletes table ── */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: '52dvh' }}>
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-100">
                <th className="text-center px-1.5 py-2 text-xs font-bold text-gray-600 border border-gray-300 w-8">#</th>
                <th className="text-left px-3 py-2 text-xs font-bold text-gray-600 border border-gray-300">{isTeamCategory ? 'Echipă' : 'Sportiv'}</th>
                <th className="text-center px-2 py-2 text-xs font-bold text-gray-600 border border-gray-300 w-16">Scor</th>
                <th className="text-center px-1.5 py-2 text-xs font-bold text-gray-600 border border-gray-300 w-10">✓</th>
              </tr>
            </thead>
            <tbody>
              {athletes.length === 0 && (
                <tr><td colSpan={4} className="text-center py-8 text-gray-400 italic">{isTeamCategory ? 'Nicio echipă înscrisă.' : 'Niciun sportiv înscris.'}</td></tr>
              )}
              {athletes.map((entry, idx) => {
                const athleteId = getEntryAthleteId(entry);
                const name = getEntryName(entry);
                const clubName = getEntryClubName(entry);
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

      {/* ── Bottom: Scoring panel (always visible, disabled when no active athlete) ── */}
      <div className={`fixed bottom-0 left-0 right-0 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.1)] z-40 flex flex-col ${!hasActiveScoring ? 'opacity-60' : ''}`} style={{ height: '50dvh' }}>
        {/* Status bar — like match UI */}
        <div className={`flex items-center justify-center gap-2 py-1.5 shrink-0 border-b ${
          hasActiveScoring ? 'bg-green-50 border-green-200' :
          allScored ? 'bg-green-50 border-green-200' :
          'bg-blue-50 border-blue-200'
        }`}>
          {hasActiveScoring ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-sm font-bold text-green-700">LIVE — Punctează acum</span>
            </>
          ) : allScored ? (
            <span className="text-sm font-bold text-green-600">✓ Toți sportivii au fost evaluați</span>
          ) : activeAthleteId && getMyScore(activeAthleteId) ? (
            <span className="text-sm font-bold text-blue-600 animate-pulse">Ai evaluat acest sportiv — se așteaptă următorul...</span>
          ) : (
            <span className="text-sm font-bold text-blue-600 animate-pulse">Se așteaptă următorul sportiv...</span>
          )}
        </div>
        {/* Score display — centered large score + small reset button */}
        <div className="relative flex items-center justify-center px-4 py-2 border-b-2 border-black bg-white shrink-0">
          <div className="text-center">
            <p className={`text-5xl font-black tabular-nums leading-none ${hasActiveScoring ? 'text-gray-900' : 'text-gray-400'}`}>{draftScore}</p>
          </div>
          <button onClick={() => setShowResetConfirm(true)} disabled={busy || !hasActiveScoring}
            className="absolute right-3 text-[10px] font-bold text-gray-500 bg-gray-200 hover:bg-gray-300 active:bg-gray-400 px-2 py-1 disabled:opacity-40 transition-all">
            Resetează Scor
          </button>
        </div>

        {/* Scoring buttons — fills remaining space */}
        <div className="flex-1 min-h-0 flex flex-col p-3 gap-2">
          {/* -1 / -2 buttons (top, larger) */}
          <div className="grid grid-cols-2 gap-2 flex-[3] min-h-0">
            <button onClick={() => adjustScore(-1)} disabled={!hasActiveScoring || busy || draftScore <= 0}
              className="bg-red-600 hover:bg-red-700 active:bg-red-800 active:scale-[0.98] text-white text-5xl font-black disabled:opacity-40 transition-all flex items-center justify-center">
              -1
            </button>
            <button onClick={() => adjustScore(-2)} disabled={!hasActiveScoring || busy || draftScore <= 0}
              className="bg-red-600 hover:bg-red-700 active:bg-red-800 active:scale-[0.98] text-white text-5xl font-black disabled:opacity-40 transition-all flex items-center justify-center">
              -2
            </button>
          </div>

          {/* +1 / +2 buttons (bottom, smaller) */}
          <div className="grid grid-cols-2 gap-2 flex-[1] min-h-0">
            <button onClick={() => adjustScore(1)} disabled={!hasActiveScoring || busy || draftScore >= MAX_SCORE}
              className="bg-green-600 hover:bg-green-700 active:bg-green-800 active:scale-[0.98] text-white text-2xl font-black disabled:opacity-40 transition-all flex items-center justify-center">
              +1
            </button>
            <button onClick={() => adjustScore(2)} disabled={!hasActiveScoring || busy || draftScore >= MAX_SCORE}
              className="bg-green-600 hover:bg-green-700 active:bg-green-800 active:scale-[0.98] text-white text-2xl font-black disabled:opacity-40 transition-all flex items-center justify-center">
              +2
            </button>
          </div>

          {/* Submit row */}
          <div className="shrink-0">
            <button onClick={() => setShowSubmitConfirm(true)} disabled={!hasActiveScoring || busy}
              className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white py-3 text-lg font-black disabled:opacity-40 transition-all active:scale-[0.98]">
              TRIMITE SCOR
            </button>
          </div>
        </div>
      </div>

      {/* Reset confirm modal */}
      {showResetConfirm && (
        <FullscreenStyleModal
          onClose={() => setShowResetConfirm(false)}
          title="Resetezi scorul?"
          description={`Revine la ${MAX_SCORE}.`}
          icon="!"
          actions={[
            <button key="cancel" onClick={() => setShowResetConfirm(false)} className={MODAL_SECONDARY_BUTTON}>Anulează</button>,
            <button key="confirm" onClick={() => { setShowResetConfirm(false); resetScore(); }} className="border border-black bg-yellow-300 px-4 py-2.5 font-bold text-black transition hover:bg-yellow-200 disabled:opacity-40">Resetează</button>,
          ]}
        />
      )}

      {/* Submit confirm modal */}
      {showSubmitConfirm && (
        <FullscreenStyleModal
          onClose={() => setShowSubmitConfirm(false)}
          title="Trimite scorul?"
          description="Verifică înainte de confirmare."
          icon="✓"
          actions={[
            <button key="cancel" onClick={() => setShowSubmitConfirm(false)} className={MODAL_SECONDARY_BUTTON}>Anulează</button>,
            <button key="confirm" onClick={() => { setShowSubmitConfirm(false); submitScore(activeEntry); }} className={MODAL_SUCCESS_BUTTON}>Trimite</button>,
          ]}
        >
          <div className="bg-gray-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600">{isTeamCategory ? 'Echipă' : 'Sportiv'}</p>
            <p className="mt-2 text-lg font-black text-gray-900">{activeEntry ? getEntryName(activeEntry) : 'Participant necunoscut'}</p>
            {activeEntry && getEntryClubName(activeEntry) ? (
              <p className="mt-1 text-sm text-gray-600">{getEntryClubName(activeEntry)}</p>
            ) : null}
          </div>
          <div className="bg-green-50 px-4 py-5 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-green-700">Scor</p>
            <p className="mt-2 text-5xl font-black leading-none text-gray-900 tabular-nums">{draftScore}</p>
          </div>
        </FullscreenStyleModal>
      )}

      {/* Finished popup — all athletes scored */}
      {showFinishedPopup && (
        <FullscreenStyleModal
          onClose={() => setShowFinishedPopup(false)}
          title="Mulțumim!"
          description="Ai terminat evaluarea."
          icon="✓"
          actions={[
            <button key="stay" onClick={() => setShowFinishedPopup(false)} className={MODAL_SECONDARY_BUTTON}>Rămâi pe această pagină</button>,
            <button key="home" onClick={() => { setShowFinishedPopup(false); navigate('/'); }} className={MODAL_SUCCESS_BUTTON}>Pagina principală</button>,
          ]}
        >
          <div className="bg-gray-50 p-4 text-center">
            <p className="text-lg font-black text-gray-900">Toți participanții au fost evaluați.</p>
          </div>
        </FullscreenStyleModal>
      )}
    </div>
  );
}
