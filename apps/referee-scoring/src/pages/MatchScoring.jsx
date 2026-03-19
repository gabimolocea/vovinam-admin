import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { matchAPI, roundAPI, matchRefereeScoreAPI, matchEventAPI, refereeAPI } from '@shared/lib/api';
import { useAuth } from '@shared';
import { Spinner, formatGroupBadgeLabel } from '@shared/components/ui';

const POLL_INTERVAL = 2000;

const SCORE_BUTTON_BASE = 'flex w-full items-center justify-center border-2 border-black text-white font-black uppercase tracking-[0.18em] transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed';
const MODAL_ACTION_BASE = 'flex-1 border-2 border-black px-4 py-3 text-sm font-black uppercase tracking-[0.18em] transition active:scale-[0.98] disabled:opacity-40';
const REALTIME_BUTTON_BASE = 'flex min-h-[20dvh] w-full flex-col items-center justify-center border-2 border-black font-black text-white transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed';

export default function MatchScoring() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [match, setMatch] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [events, setEvents] = useState([]);
  const [refScores, setRefScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmWinner, setConfirmWinner] = useState(null);
  const pollRef = useRef(null);
  const [draftScores, setDraftScores] = useState({});

  const fetchAll = useCallback(async () => {
    try {
      const [mR, rR, eR, sR] = await Promise.all([
        matchAPI.get(matchId),
        roundAPI.list({ match_id: matchId }),
        matchEventAPI.list({ match_id: matchId }),
        matchRefereeScoreAPI.list({ match_id: matchId }),
      ]);
      setMatch(mR.data);
      const rArr = Array.isArray(rR.data) ? rR.data : rR.data?.results || [];
      setRounds(rArr.sort((a, b) => a.round_number - b.round_number));
      setEvents(Array.isArray(eR.data) ? eR.data : eR.data?.results || []);
      setRefScores(Array.isArray(sR.data) ? sR.data : sR.data?.results || []);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    fetchAll();
    pollRef.current = setInterval(fetchAll, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [fetchAll]);

  const prevScoreCountRef = useRef(0);
  useEffect(() => {
    if (prevScoreCountRef.current > 0 && refScores.length === 0) setDraftScores({});
    prevScoreCountRef.current = refScores.length;
  }, [refScores]);

  const allRoundsDone = rounds.length > 0 && rounds.every(r => r.status === 'completed');

  const myAthleteId = user?.athlete_id || user?.athlete?.id;
  const myRoundScores = refScores.filter(s => s.referee === myAthleteId && s.round != null);
  const myFinalScore = refScores.find(s => s.referee === myAthleteId && s.round == null);
  const getMyScoreForRound = (roundId) => myRoundScores.find(s => s.round === roundId);

  const saveScore = async (roundId, redScore, blueScore) => {
    setBusy(true);
    try {
      const existing = getMyScoreForRound(roundId);
      if (existing) {
        await matchRefereeScoreAPI.update(existing.id, { red_corner_score: redScore, blue_corner_score: blueScore });
      } else {
        await matchRefereeScoreAPI.create({ match: parseInt(matchId), round: roundId, red_corner_score: redScore, blue_corner_score: blueScore });
      }
      fetchAll();
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setBusy(false);
    }
  };

  const addPoint = async (corner, amount) => {
    if (!activeRoundData) return;
    if (match?.display_mode === 'real_time') {
      setBusy(true);
      try {
        await refereeAPI.pointEvents.create(matchId, {
          side: corner,
          points: amount,
          event_type: amount < 0 ? 'deduction' : 'score',
          metadata: {
            round: activeRoundData.round_number,
            round_id: activeRoundData.id,
            client_timestamp_ms: Date.now(),
            origin: 'referee_scoring_app',
          },
        });
        fetchAll();
      } catch (err) {
        console.error('Point event error:', err);
      } finally {
        setBusy(false);
      }
      return;
    }
    const roundId = activeRoundData.id;
    setDraftScores(prev => {
      const myScore = getMyScoreForRound(roundId);
      const current = prev[roundId]?.[corner] ?? (myScore ? Number(myScore[corner === 'red' ? 'red_corner_score' : 'blue_corner_score']) : 0);
      const newVal = Math.max(0, current + amount);
      const updated = { ...prev, [roundId]: { ...prev[roundId], [corner]: newVal } };
      const otherCorner = corner === 'red' ? 'blue' : 'red';
      const otherVal = updated[roundId]?.[otherCorner] ?? (myScore ? Number(myScore[otherCorner === 'red' ? 'red_corner_score' : 'blue_corner_score']) : 0);
      const redVal = corner === 'red' ? newVal : otherVal;
      const blueVal = corner === 'blue' ? newVal : otherVal;
      saveScore(roundId, redVal, blueVal);
      return updated;
    });
  };

  const submitFinalDecision = async (choice) => {
    setBusy(true);
    try {
      const redTotal = choice === 'red' ? 1 : 0;
      const blueTotal = choice === 'blue' ? 1 : 0;
      if (myFinalScore) {
        await matchRefereeScoreAPI.update(myFinalScore.id, { red_corner_score: redTotal, blue_corner_score: blueTotal });
      } else {
        await matchRefereeScoreAPI.create({ match: parseInt(matchId), round: null, red_corner_score: redTotal, blue_corner_score: blueTotal });
      }
      fetchAll();
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.error || JSON.stringify(err.response?.data) || 'Eroare la trimitere';
      alert(msg);
    } finally {
      setBusy(false);
      setConfirmWinner(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Spinner className="h-8 w-8 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!match) {
    return <p className="py-20 text-center text-gray-600 bg-gray-50 min-h-screen">Meciul nu a fost gasit.</p>;
  }

  // ── Compute ──
  const warningsRed = events.filter(e => e.event_type === 'warning_red').length;
  const warningsBlue = events.filter(e => e.event_type === 'warning_blue').length;
  const penaltyEventsRed = events.filter(e => e.event_type === 'penalty_red');
  const penaltyEventsBlue = events.filter(e => e.event_type === 'penalty_blue');
  const bonusEventsRed = events.filter(e => e.event_type === 'bonus_red');
  const bonusEventsBlue = events.filter(e => e.event_type === 'bonus_blue');
  const totalPenaltyRed = penaltyEventsRed.reduce((s, e) => s + (e.value || 0), 0);
  const totalPenaltyBlue = penaltyEventsBlue.reduce((s, e) => s + (e.value || 0), 0);
  const totalBonusRed = bonusEventsRed.reduce((s, e) => s + (e.value || 0), 0);
  const totalBonusBlue = bonusEventsBlue.reduce((s, e) => s + (e.value || 0), 0);
  const adjustRed = totalPenaltyRed + totalBonusRed + (warningsRed * -2);
  const adjustBlue = totalPenaltyBlue + totalBonusBlue + (warningsBlue * -2);

  const activeRoundData = rounds.find(r => r.status === 'active');
  const totalRounds = rounds.length;

  const myTotalRed = myRoundScores.reduce((s, sc) => s + Number(sc.red_corner_score || 0), 0);
  const myTotalBlue = myRoundScores.reduce((s, sc) => s + Number(sc.blue_corner_score || 0), 0);
  const myGrandTotalRed = myTotalRed + adjustRed;
  const myGrandTotalBlue = myTotalBlue + adjustBlue;

  const myFinalChoice = myFinalScore
    ? (myFinalScore.red_corner_score > myFinalScore.blue_corner_score ? 'red' : 'blue')
    : null;
  const suggestedWinner = myGrandTotalRed > myGrandTotalBlue ? 'red' : myGrandTotalBlue > myGrandTotalRed ? 'blue' : null;

  // Active round draft scores for bottom buttons display
  const activeDraftRed = activeRoundData ? (draftScores[activeRoundData.id]?.red ?? (getMyScoreForRound(activeRoundData.id) ? Number(getMyScoreForRound(activeRoundData.id).red_corner_score) : 0)) : 0;
  const activeDraftBlue = activeRoundData ? (draftScores[activeRoundData.id]?.blue ?? (getMyScoreForRound(activeRoundData.id) ? Number(getMyScoreForRound(activeRoundData.id).blue_corner_score) : 0)) : 0;
  const isRealTimeMode = match.display_mode === 'real_time';

  if (isRealTimeMode) {
    const isInBreak = !activeRoundData && rounds.some(r => r.status === 'completed') && rounds.some(r => r.status === 'scheduled');
    const isPaused = activeRoundData?.is_paused;
    const buttonsDisabled = busy || isPaused || isInBreak || !activeRoundData;

    return (
      <div className="flex min-h-screen flex-col bg-black text-white">
        <header className="flex items-center justify-between border-b-2 border-yellow-400 bg-black px-4 py-3">
          <button onClick={() => navigate('/')} className="text-sm font-bold uppercase tracking-[0.14em] text-yellow-100 hover:text-yellow-300">&larr; Înapoi</button>
          <div className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-yellow-200">Scor timp real</p>
            <h1 className="text-base font-black uppercase tracking-[0.18em]">Meci #{matchId}</h1>
          </div>
          <div className="text-right text-[11px] font-bold uppercase tracking-[0.18em] text-yellow-200">
            {activeRoundData ? `R${activeRoundData.round_number}` : 'Pauză'}
          </div>
        </header>

        <div className="border-b border-white/15 bg-zinc-950 px-4 py-3 text-center">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div>
              <h2 className="truncate text-xl font-black text-red-400">{match.red_corner_full_name || 'TBD'}</h2>
              <p className="text-xs text-red-200/80">{activeDraftRed}</p>
            </div>
            <div className="text-xs font-black uppercase tracking-[0.28em] text-yellow-200">VS</div>
            <div>
              <h2 className="truncate text-xl font-black text-blue-400">{match.blue_corner_full_name || 'TBD'}</h2>
              <p className="text-xs text-blue-200/80">{activeDraftBlue}</p>
            </div>
          </div>
          <p className={`mt-3 text-sm font-bold uppercase tracking-[0.16em] ${isPaused ? 'text-amber-300' : isInBreak ? 'text-orange-300' : activeRoundData ? 'text-green-300' : 'text-zinc-400'}`}>
            {isPaused ? 'Pauză de repriză' : isInBreak ? 'Pauză între reprize' : activeRoundData ? `Repriza ${activeRoundData.round_number} activă` : 'Aștept startul reprizei'}
          </p>
        </div>

        <div className="grid flex-1 grid-cols-2">
          <div className="grid grid-rows-2 border-r-2 border-black bg-red-950">
            <button onClick={() => addPoint('red', 1)} disabled={buttonsDisabled} className={`${REALTIME_BUTTON_BASE} bg-red-500 hover:bg-red-400`}>
              <span className="text-6xl leading-none">+1</span>
              <span className="mt-3 text-sm tracking-[0.22em]">ROȘU</span>
            </button>
            <button onClick={() => addPoint('red', 2)} disabled={buttonsDisabled} className={`${REALTIME_BUTTON_BASE} bg-red-600 hover:bg-red-500`}>
              <span className="text-6xl leading-none">+2</span>
              <span className="mt-3 text-sm tracking-[0.22em]">ROȘU</span>
            </button>
          </div>

          <div className="grid grid-rows-2 bg-blue-950">
            <button onClick={() => addPoint('blue', 1)} disabled={buttonsDisabled} className={`${REALTIME_BUTTON_BASE} bg-blue-500 hover:bg-blue-400`}>
              <span className="text-6xl leading-none">+1</span>
              <span className="mt-3 text-sm tracking-[0.22em]">ALBASTRU</span>
            </button>
            <button onClick={() => addPoint('blue', 2)} disabled={buttonsDisabled} className={`${REALTIME_BUTTON_BASE} bg-blue-600 hover:bg-blue-500`}>
              <span className="text-6xl leading-none">+2</span>
              <span className="mt-3 text-sm tracking-[0.22em]">ALBASTRU</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Winner names for confirmation
  const winnerName = confirmWinner === 'red' ? match.red_corner_full_name : match.blue_corner_full_name;
  const winnerPoints = confirmWinner === 'red' ? myGrandTotalRed : myGrandTotalBlue;

  return (
    <div className="flex flex-col bg-white text-gray-900" style={{ height: '100dvh' }}>
      {/* ── TOP: Header + VS ── */}
      <header className="flex items-center justify-between border-b-2 border-yellow-400 bg-black px-3 py-2 text-white shrink-0">
        <button onClick={() => navigate('/')} className="text-yellow-100 hover:text-yellow-300 text-sm font-bold flex items-center gap-1">&larr; INAPOI</button>
        <h1 className="font-black text-sm uppercase tracking-wide text-yellow-200">Meci #{matchId}</h1>
        <div className="w-8" />
      </header>

      {/* Category, Group, Match type */}
      {(match.category_name || match.group_name || match.round) && (
        <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-yellow-100 border-b-2 border-black shrink-0 flex-wrap">
          {match.category_name && <span className="frvv-chip">{match.category_name}</span>}
          {match.group_name && <span className="frvv-chip">{formatGroupBadgeLabel(match.group_name, match)}</span>}
          {match.round && <span className="frvv-chip capitalize">{match.round}</span>}
        </div>
      )}

      {/* VS — names side by side */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 px-3 py-2 bg-white border-b-2 border-black shrink-0">
        <div className="text-center">
          <h2 className="text-base font-black text-red-600 leading-tight truncate">{match.red_corner_full_name || 'TBD'}</h2>
          {match.red_corner_club_name && <p className="text-[10px] text-gray-400 truncate">{match.red_corner_club_name}</p>}
        </div>
        <span className="text-sm font-black text-gray-300">VS</span>
        <div className="text-center">
          <h2 className="text-base font-black text-blue-600 leading-tight truncate">{match.blue_corner_full_name || 'TBD'}</h2>
          {match.blue_corner_club_name && <p className="text-[10px] text-gray-400 truncate">{match.blue_corner_club_name}</p>}
        </div>
      </div>

      {/* ── MIDDLE: scrollable content ── */}
      <div className="flex-1 overflow-y-auto py-2 space-y-2 pb-[52dvh]">
        {/* Round scores — centralizator style table */}
        {rounds.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6 px-3">Se asteapta reprizele...</p>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left px-3 py-2 text-xs font-bold text-gray-600 border border-gray-300 w-16"></th>
                  <th className="text-center px-2 py-2 text-xs font-bold text-red-600 border border-gray-300">ROSU</th>
                  <th className="text-center px-2 py-2 text-xs font-bold text-blue-600 border border-gray-300">ALBASTRU</th>
                </tr>
              </thead>
              <tbody>
                {rounds.map((r) => {
                  const myScore = getMyScoreForRound(r.id);
                  const draft = draftScores[r.id] || {};
                  const scoreRed = draft.red ?? (myScore ? Number(myScore.red_corner_score) : 0);
                  const scoreBlue = draft.blue ?? (myScore ? Number(myScore.blue_corner_score) : 0);
                  const isActive = r.status === 'active';
                  const isCompleted = r.status === 'completed';
                  return (
                    <tr key={r.id} className={isActive ? 'bg-green-50' : 'bg-white'}>
                      <td className="px-3 py-2 text-xs font-black border border-gray-300 whitespace-nowrap">
                        <span className={isActive ? 'text-green-600' : isCompleted ? 'text-gray-600' : 'text-gray-300'}>
                          R{r.round_number}
                        </span>
                        {isActive && (
                          <span className="relative inline-flex h-1.5 w-1.5 ml-1 align-middle">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                          </span>
                        )}
                      </td>
                      <td className="text-center px-2 py-2 border border-gray-300">
                        <span className={`text-xl font-black tabular-nums ${
                          isActive ? 'text-red-600' : isCompleted ? 'text-red-500/70' : 'text-gray-300'
                        }`}>{isCompleted || isActive ? scoreRed : '—'}</span>
                      </td>
                      <td className="text-center px-2 py-2 border border-gray-300">
                        <span className={`text-xl font-black tabular-nums ${
                          isActive ? 'text-blue-600' : isCompleted ? 'text-blue-500/70' : 'text-gray-300'
                        }`}>{isCompleted || isActive ? scoreBlue : '—'}</span>
                      </td>
                    </tr>
                  );
                })}
                {/* TOTAL row — includes central adjustments inline */}
                <tr className="bg-gray-100 font-bold">
                  <td className="px-3 py-2.5 text-sm font-black text-gray-700 border border-gray-300 border-t-2 border-t-gray-500">TOTAL</td>
                  <td className="text-center px-2 py-2.5 border border-gray-300 border-t-2 border-t-gray-500">
                    <span className={`text-2xl font-black tabular-nums ${
                      myGrandTotalRed > myGrandTotalBlue ? 'text-red-600' : 'text-red-400'
                    }`}>{myTotalRed > 0 || adjustRed !== 0 ? myGrandTotalRed : '—'}</span>
                    {adjustRed !== 0 && (
                      <span className={`block text-[10px] font-bold ${adjustRed > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        ({adjustRed > 0 ? '+' : ''}{adjustRed} central)
                      </span>
                    )}
                  </td>
                  <td className="text-center px-2 py-2.5 border border-gray-300 border-t-2 border-t-gray-500">
                    <span className={`text-2xl font-black tabular-nums ${
                      myGrandTotalBlue > myGrandTotalRed ? 'text-blue-600' : 'text-blue-400'
                    }`}>{myTotalBlue > 0 || adjustBlue !== 0 ? myGrandTotalBlue : '—'}</span>
                    {adjustBlue !== 0 && (
                      <span className={`block text-[10px] font-bold ${adjustBlue > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        ({adjustBlue > 0 ? '+' : ''}{adjustBlue} central)
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* ── WINNER DECISION ── */}
        {allRoundsDone && (
          <div className="frvv-surface p-3 space-y-3 mx-3">
            <p className="text-xs text-gray-500 text-center uppercase font-bold tracking-wider">
              {myFinalChoice ? 'Decizia ta actuală' : 'Alege castigatorul'}
            </p>
            {myFinalChoice ? (
              <div className="text-center space-y-2">
                <span className={`inline-block border-2 border-black px-5 py-2.5 text-base font-black uppercase tracking-[0.18em] ${
                  myFinalChoice === 'red' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'
                }`}>{myFinalChoice === 'red' ? 'Rosu' : 'Albastru'}</span>
                <p className="text-[10px] text-gray-400 mt-1">Decizia poate fi trimisă din nou doar dacă este ștearsă de competition admin.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setConfirmWinner('red')} disabled={busy}
                    className={`min-h-[88px] border-2 text-lg font-black uppercase tracking-[0.18em] disabled:opacity-50 transition-all active:scale-95 ${
                      suggestedWinner === 'red' ? 'border-black bg-red-500 text-white ring-4 ring-red-300 animate-pulse' : 'border-red-300 bg-red-100 text-red-600'
                    }`}>
                    Rosu
                    {suggestedWinner === 'red' && <span className="block text-[10px] font-semibold mt-0.5 opacity-80">Scor mai mare</span>}
                  </button>
                  <button onClick={() => setConfirmWinner('blue')} disabled={busy}
                    className={`min-h-[88px] border-2 text-lg font-black uppercase tracking-[0.18em] disabled:opacity-50 transition-all active:scale-95 ${
                      suggestedWinner === 'blue' ? 'border-black bg-blue-500 text-white ring-4 ring-blue-300 animate-pulse' : 'border-blue-300 bg-blue-100 text-blue-600'
                    }`}>
                    Albastru
                    {suggestedWinner === 'blue' && <span className="block text-[10px] font-semibold mt-0.5 opacity-80">Scor mai mare</span>}
                  </button>
                </div>
                {suggestedWinner === null && myTotalRed > 0 && (
                  <p className="text-[10px] text-amber-600 text-center font-medium">Scor egal — alege castigatorul</p>
                )}
              </>
            )}
          </div>
        )}



        {/* Info message */}
        {!allRoundsDone && rounds.length > 0 && !activeRoundData && (
          <p className="text-[10px] text-gray-400 text-center py-1">Poti puncta doar in timpul reprizei active</p>
        )}
      </div>

      {/* ── BOTTOM: Fixed scoring buttons — half screen height ── */}
      {(() => {
        const isInBreak = !activeRoundData && rounds.some(r => r.status === 'completed') && rounds.some(r => r.status === 'scheduled');
        const isPaused = activeRoundData?.is_paused;
        const buttonsDisabled = busy || isPaused || isInBreak || !activeRoundData;
        const showPanel = activeRoundData || isInBreak;
        if (!showPanel) return null;
        return (
          <div className="fixed bottom-0 left-0 right-0 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.1)] z-40 flex flex-col" style={{ height: '50dvh' }}>
            {/* Active round indicator / break indicator */}
            <div className={`flex items-center justify-center gap-2 py-1.5 shrink-0 ${
              isInBreak ? 'bg-orange-50 border-b border-orange-200' :
              isPaused ? 'bg-amber-50 border-b border-amber-200' : 'bg-green-50 border-b border-green-200'
            }`}>
              {isInBreak ? (
                <span className="text-sm font-bold text-orange-600 animate-pulse">Pauza dintre reprize — asteptati...</span>
              ) : isPaused ? (
                <span className="text-sm font-bold text-amber-600 animate-pulse">Pe perioada pauzei nu se poate puncta!</span>
              ) : (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="text-sm font-bold text-green-700">Repriza {activeRoundData.round_number} — {activeDraftRed} : {activeDraftBlue}</span>
                </>
              )}
            </div>
            {/* Buttons grid — fills remaining space */}
            <div className="grid grid-cols-2 flex-1 min-h-0">
              {/* Red +1 / +2 */}
              <div className="grid grid-rows-2">
                <button onClick={() => addPoint('red', 1)} disabled={buttonsDisabled}
                  className={`${SCORE_BUTTON_BASE} border-b-[1px] bg-red-500 text-4xl hover:bg-red-600 active:bg-red-700`}>
                  <span className="flex flex-col items-center leading-none">
                    <span>+1</span>
                    <span className="mt-2 text-[11px] font-bold">ROȘU</span>
                  </span>
                </button>
                <button onClick={() => addPoint('red', 2)} disabled={buttonsDisabled}
                  className={`${SCORE_BUTTON_BASE} border-t-[1px] bg-red-600 text-3xl hover:bg-red-700 active:bg-red-800`}>
                  <span className="flex flex-col items-center leading-none">
                    <span>+2</span>
                    <span className="mt-2 text-[11px] font-bold">ROȘU</span>
                  </span>
                </button>
              </div>
              {/* Blue +1 / +2 */}
              <div className="grid grid-rows-2">
                <button onClick={() => addPoint('blue', 1)} disabled={buttonsDisabled}
                  className={`${SCORE_BUTTON_BASE} border-b-[1px] bg-blue-500 text-4xl hover:bg-blue-600 active:bg-blue-700`}>
                  <span className="flex flex-col items-center leading-none">
                    <span>+1</span>
                    <span className="mt-2 text-[11px] font-bold">ALBASTRU</span>
                  </span>
                </button>
                <button onClick={() => addPoint('blue', 2)} disabled={buttonsDisabled}
                  className={`${SCORE_BUTTON_BASE} border-t-[1px] bg-blue-600 text-3xl hover:bg-blue-700 active:bg-blue-800`}>
                  <span className="flex flex-col items-center leading-none">
                    <span>+2</span>
                    <span className="mt-2 text-[11px] font-bold">ALBASTRU</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── CONFIRM WINNER MODAL ── */}
      {confirmWinner && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setConfirmWinner(null)}>
          <div className="w-full max-w-sm overflow-hidden border-2 border-black bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="border-b-2 border-black bg-yellow-300 px-5 py-4 text-center">
              <h3 className="text-lg font-black text-gray-900">Confirmă câștigătorul</h3>
            </div>
            <div className="px-5 py-4 text-center">
              <p className="text-base text-gray-700">
              Câștigător:{' '}
              <span className={`font-black ${confirmWinner === 'red' ? 'text-red-600' : 'text-blue-600'}`}>
                {winnerName || (confirmWinner === 'red' ? 'Rosu' : 'Albastru')}
              </span>
              {' '}({winnerPoints} puncte)
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t-2 border-black bg-gray-50 px-5 py-4 sm:flex-row">
              <button onClick={() => setConfirmWinner(null)} className={`${MODAL_ACTION_BASE} bg-white text-gray-700 hover:bg-yellow-100`}>
                Anulează
              </button>
              <button onClick={() => submitFinalDecision(confirmWinner)} disabled={busy}
                className={`${MODAL_ACTION_BASE} text-white ${
                  confirmWinner === 'red' ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
                }`}>
                Confirmă
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
