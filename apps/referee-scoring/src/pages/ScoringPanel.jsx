import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { categoryAPI, refereeAPI, enrollmentAPI, monitorAPI, refereePresenceAPI, API_BASE_URL } from '@shared/lib/api';
import { useAuth } from '@shared';
import { Spinner, formatGroupBadgeLabel } from '../components/ui';

const POLL_INTERVAL = 2000;
const MAX_SCORE = 100;
const MODAL_SECONDARY_BUTTON = 'rounded-md border border-input bg-background px-4 py-2.5 font-medium text-foreground transition hover:bg-accent disabled:opacity-40';
const MODAL_SUCCESS_BUTTON = 'rounded-md bg-emerald-600 px-4 py-2.5 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-40';

// Hand-rolled overlay kept deliberately (not swapped for the Dialog
// primitive) - this screen drives live scoring during a real match, and
// the dvh-based fixed layout below is already carefully tuned; only the
// colors/radius are updated to the new tokens, not the interaction model.
function FullscreenStyleModal({ onClose, title, description, maxWidth = 'max-w-md', actions, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scoring-modal-title"
        className={`w-full ${maxWidth} overflow-hidden rounded-lg border border-border bg-card shadow-2xl`}
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-border bg-primary px-5 py-4 text-primary-foreground">
          <div>
            <h3 id="scoring-modal-title" className="font-display text-xl font-semibold">{title}</h3>
            {description ? <p className="mt-1 text-sm text-primary-foreground/80">{description}</p> : null}
          </div>
        </div>
        {children ? <div className="space-y-4 px-5 py-4">{children}</div> : null}
        {actions ? (
          <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted px-5 py-4 sm:flex-row sm:justify-end">
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
  // Ce s-a ales de nota mea dupa dezvaluire: a contat, sau a fost taiata
  // ca extrema. Vine de la server, pentru ca prin API un arbitru vede
  // doar propriile note - si asa trebuie sa ramana pana la dezvaluire.
  const [reveal, setReveal] = useState(null);
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

        if (activeSess?.status === 'scores_revealed') {
          try {
            const { data } = await refereeAPI.categoryScores.reveal({ category: parseInt(categoryId) });
            setReveal(data?.revealed ? data : null);
          } catch {
            setReveal(null);
          }
        } else {
          setReveal(null);
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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!category) {
    return <p className="min-h-screen bg-background py-20 text-center text-muted-foreground">Categoria nu a fost găsită.</p>;
  }

  const handleBack = async () => {
    await clearPresence();
    navigate('/');
  };

  return (
    <div className="flex flex-col bg-background text-foreground" style={{ height: '100dvh' }}>
      {/* ── Header — similar to MatchScoring ── */}
      <header className="flex items-center justify-between border-b border-sidebar-border bg-sidebar px-3 py-2 text-sidebar-foreground shrink-0">
        <button onClick={handleBack} className="text-sidebar-foreground/80 hover:text-sidebar-foreground text-sm font-semibold flex items-center gap-1">&larr; ÎNAPOI</button>
        <h1 className="font-display font-semibold text-sm uppercase tracking-wide truncate">{category.name}</h1>
        <div className={`flex items-center gap-1.5 rounded-full px-2 py-1 border text-[11px] font-semibold whitespace-nowrap ${isOnline ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          <span className={`inline-block w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
          {isOnline ? 'Conectat' : 'Fără conexiune'}
        </div>
      </header>

      {/* Category info tags */}
      <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-muted border-b border-border shrink-0 flex-wrap">
        {category.group_name && <span className="frvv-chip">{formatGroupBadgeLabel(category.group_name, category)}</span>}
        {category.gender && <span className="frvv-chip">{genderLabels[category.gender] || category.gender}</span>}
        <span className="frvv-chip uppercase">{isTeamCategory ? 'Echipe' : 'Solo'}</span>
      </div>

      {/* ── Athletes table ── */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: '52dvh' }}>
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse border border-border">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted">
                <th className="text-center px-1.5 py-2 text-xs font-semibold text-muted-foreground border border-border w-8">#</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground border border-border">{isTeamCategory ? 'Echipă' : 'Sportiv'}</th>
                <th className="text-center px-2 py-2 text-xs font-semibold text-muted-foreground border border-border w-16">Scor</th>
                <th className="text-center px-1.5 py-2 text-xs font-semibold text-muted-foreground border border-border w-10">✓</th>
              </tr>
            </thead>
            <tbody>
              {athletes.length === 0 && (
                <tr><td colSpan={4} className="text-center py-8 text-muted-foreground italic">{isTeamCategory ? 'Nicio echipă înscrisă.' : 'Niciun sportiv înscris.'}</td></tr>
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
                    isActive ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-card'
                  } transition`}>
                    <td className="px-1.5 py-2.5 border border-border text-center text-muted-foreground text-xs tabular-nums">{idx + 1}</td>
                    <td className="px-3 py-2.5 border border-border">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className={`font-semibold ${isActive ? 'text-emerald-800 dark:text-emerald-300' : 'text-foreground'} text-sm`}>{name}</p>
                          {clubName && <p className="text-[10px] text-muted-foreground">{clubName}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 border border-border text-center">
                      {existingScore ? (
                        <span className="text-lg font-bold text-foreground tabular-nums">{Math.round(Number(existingScore.score))}</span>
                      ) : (
                        <span className="text-muted-foreground/50 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-1.5 py-2.5 border border-border text-center">
                      {existingScore || justSubmitted ? (
                        <span className="text-emerald-600 text-sm font-bold">✓</span>
                      ) : isActive ? (
                        <span className="text-xs text-emerald-600 font-bold animate-pulse">LIVE</span>
                      ) : (
                        <span className="text-muted-foreground/50 text-xs">—</span>
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
      <div className={`fixed bottom-0 left-0 right-0 bg-card shadow-[0_-4px_20px_rgba(0,0,0,0.1)] z-40 flex flex-col ${!hasActiveScoring ? 'opacity-60' : ''}`} style={{ height: '50dvh' }}>
        {/* Status bar — like match UI */}
        <div className={`flex items-center justify-center gap-2 py-1.5 shrink-0 border-b ${
          hasActiveScoring ? 'bg-emerald-50 border-emerald-200' :
          allScored ? 'bg-emerald-50 border-emerald-200' :
          'bg-sky-50 border-sky-200'
        }`}>
          {hasActiveScoring ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-sm font-semibold text-emerald-700">LIVE — Punctează acum</span>
            </>
          ) : allScored ? (
            <span className="text-sm font-semibold text-emerald-600">✓ Toți sportivii au fost evaluați</span>
          ) : activeAthleteId && getMyScore(activeAthleteId) ? (
            <span className="text-sm font-semibold text-sky-600 animate-pulse">Ai evaluat acest sportiv — se așteaptă următorul...</span>
          ) : (
            <span className="text-sm font-semibold text-sky-600 animate-pulse">Se așteaptă următorul sportiv...</span>
          )}
        </div>
        {/* Ce s-a ales de nota mea, dupa dezvaluire. Pana acum arbitrul
            nu afla niciodata daca nota lui a intrat in total sau a cazut
            ca extrema - iar diferenta asta conteaza pentru el. */}
        {(() => {
          const mine = reveal?.scores?.find(row => row.mine);
          if (!mine) return null;
          const cut = mine.mark === 'low' || mine.mark === 'high';
          return (
            <div className={`px-4 py-2 border-b shrink-0 text-center ${cut ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50'}`}>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {reveal.athlete_name}
              </p>
              <p className={`text-sm font-bold ${cut ? 'text-amber-900' : 'text-emerald-900'}`}>
                Nota ta: <span className="tabular-nums text-lg">{Math.round(Number(mine.score))}</span>
                {cut
                  ? ` — tăiată (${mine.mark === 'low' ? 'cea mai mică' : 'cea mai mare'})`
                  : ' — a intrat în total'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Total sportiv: <span className="font-semibold tabular-nums">{Math.round(Number(reveal.total))}</span>
                {' · '}
                {reveal.scores.map(row => Math.round(Number(row.score))).join(' / ')}
              </p>
            </div>
          );
        })()}

        {/* Score display — centered large score + small reset button */}
        <div className="relative flex items-center justify-center px-4 py-2 border-b border-border bg-card shrink-0">
          <div className="text-center">
            <p className={`text-5xl font-bold tabular-nums leading-none ${hasActiveScoring ? 'text-foreground' : 'text-muted-foreground'}`}>{draftScore}</p>
          </div>
          <button onClick={() => setShowResetConfirm(true)} disabled={busy || !hasActiveScoring}
            className="absolute right-3 rounded-md text-[10px] font-semibold text-muted-foreground bg-muted hover:bg-accent active:bg-accent px-2 py-1 disabled:opacity-40 transition-all">
            Resetează Scor
          </button>
        </div>

        {/* Scoring buttons — fills remaining space */}
        <div className="flex-1 min-h-0 flex flex-col p-3 gap-2">
          {/* -1 / -2 buttons (top, larger) */}
          <div className="grid grid-cols-2 gap-2 flex-[3] min-h-0">
            <button onClick={() => adjustScore(-1)} disabled={!hasActiveScoring || busy || draftScore <= 0}
              className="rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 active:scale-[0.98] text-white text-5xl font-bold disabled:opacity-40 transition-all flex items-center justify-center">
              -1
            </button>
            <button onClick={() => adjustScore(-2)} disabled={!hasActiveScoring || busy || draftScore <= 0}
              className="rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 active:scale-[0.98] text-white text-5xl font-bold disabled:opacity-40 transition-all flex items-center justify-center">
              -2
            </button>
          </div>

          {/* +1 / +2 buttons (bottom, smaller) */}
          <div className="grid grid-cols-2 gap-2 flex-[1] min-h-0">
            <button onClick={() => adjustScore(1)} disabled={!hasActiveScoring || busy || draftScore >= MAX_SCORE}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 active:scale-[0.98] text-white text-2xl font-bold disabled:opacity-40 transition-all flex items-center justify-center">
              +1
            </button>
            <button onClick={() => adjustScore(2)} disabled={!hasActiveScoring || busy || draftScore >= MAX_SCORE}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 active:scale-[0.98] text-white text-2xl font-bold disabled:opacity-40 transition-all flex items-center justify-center">
              +2
            </button>
          </div>

          {/* Submit row */}
          <div className="shrink-0">
            <button onClick={() => setShowSubmitConfirm(true)} disabled={!hasActiveScoring || busy}
              className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white py-3 text-lg font-bold disabled:opacity-40 transition-all active:scale-[0.98]">
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
          actions={[
            <button key="cancel" onClick={() => setShowResetConfirm(false)} className={MODAL_SECONDARY_BUTTON}>Anulează</button>,
            <button key="confirm" onClick={() => { setShowResetConfirm(false); resetScore(); }} className="rounded-md bg-secondary px-4 py-2.5 font-semibold text-secondary-foreground transition hover:bg-secondary/80 disabled:opacity-40">Resetează</button>,
          ]}
        />
      )}

      {/* Submit confirm modal */}
      {showSubmitConfirm && (
        <FullscreenStyleModal
          onClose={() => setShowSubmitConfirm(false)}
          title="Trimite scorul?"
          description="Verifică înainte de confirmare."
          actions={[
            <button key="cancel" onClick={() => setShowSubmitConfirm(false)} className={MODAL_SECONDARY_BUTTON}>Anulează</button>,
            <button key="confirm" onClick={() => { setShowSubmitConfirm(false); submitScore(activeEntry); }} className={MODAL_SUCCESS_BUTTON}>Trimite</button>,
          ]}
        >
          <div className="rounded-md bg-muted p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{isTeamCategory ? 'Echipă' : 'Sportiv'}</p>
            <p className="mt-2 text-lg font-bold text-foreground">{activeEntry ? getEntryName(activeEntry) : 'Participant necunoscut'}</p>
            {activeEntry && getEntryClubName(activeEntry) ? (
              <p className="mt-1 text-sm text-muted-foreground">{getEntryClubName(activeEntry)}</p>
            ) : null}
          </div>
          <div className="rounded-md bg-emerald-50 px-4 py-5 text-center dark:bg-emerald-950/20">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">Scor</p>
            <p className="mt-2 text-5xl font-bold leading-none text-foreground tabular-nums">{draftScore}</p>
          </div>
        </FullscreenStyleModal>
      )}

      {/* Finished popup — all athletes scored */}
      {showFinishedPopup && (
        <FullscreenStyleModal
          onClose={() => setShowFinishedPopup(false)}
          title="Mulțumim!"
          description="Ai terminat evaluarea."
          actions={[
            <button key="stay" onClick={() => setShowFinishedPopup(false)} className={MODAL_SECONDARY_BUTTON}>Rămâi pe această pagină</button>,
            <button key="home" onClick={() => { setShowFinishedPopup(false); navigate('/'); }} className={MODAL_SUCCESS_BUTTON}>Pagina principală</button>,
          ]}
        >
          <div className="rounded-md bg-muted p-4 text-center">
            <p className="text-lg font-bold text-foreground">Toți participanții au fost evaluați.</p>
          </div>
        </FullscreenStyleModal>
      )}
    </div>
  );
}
