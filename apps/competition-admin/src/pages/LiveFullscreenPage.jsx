import React, { useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  fieldAPI, monitorAPI, roundAPI, matchAPI, scoreAPI,
  matchRefereeScoreAPI, matchFieldAssignmentAPI, refereeAPI,
  categoryRefereeAssignmentAPI, matchEventAPI, fieldBreakAPI,
  matchRefereeAssignmentAPI, groupAPI, categoryAPI,
} from '@shared/lib/api';

/* ═══════════════════════════════════════════════════════
   LIVE FULLSCREEN PAGE — full-screen view for a field
   panel (category or match), accessible via /competitions/:id/live-fullscreen
   ═══════════════════════════════════════════════════════ */

const PUBLIC_DISPLAY_PORT = 5177;

export default function LiveFullscreenPage() {
  const { id: eventId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fieldId = Number(searchParams.get('field'));
  const panelType = searchParams.get('panel'); // 'category' | 'match'

  const [fields, setFields] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [catAssignments, setCatAssignments] = useState([]);
  const [matchAssignments, setMatchAssignments] = useState([]);
  const [matches, setMatches] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [refScores, setRefScores] = useState([]);
  const [matchRefScores, setMatchRefScores] = useState([]);
  const [athleteScores, setAthleteScores] = useState([]);
  const [refAssignments, setRefAssignments] = useState([]);
  const [matchEvents, setMatchEvents] = useState([]);
  const [matchRefAssignments, setMatchRefAssignments] = useState([]);
  const [groups, setGroups] = useState([]);
  const [allCats, setAllCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showResetCategoryConfirm, setShowResetCategoryConfirm] = useState(false);
  const [showStopCategoryConfirm, setShowStopCategoryConfirm] = useState(false);
  const pollRef = useRef(null);

  const arr = r => r.data?.results || r.data || [];

  // Full initial load — called once
  const fetchData = useCallback(async () => {
    if (!eventId) return;
    try {
      const [fR, sR, caR, maR, mR, rR, rsR, mrsR, asR, raR, meR, mraR, gR, cR] = await Promise.all([
        fieldAPI.list({ event_id: eventId }),
        monitorAPI.sessions.list({ event_id: eventId }),
        fieldAPI.assignments.list({ event_id: eventId }),
        matchFieldAssignmentAPI.list({ event_id: eventId }),
        matchAPI.list({ event_id: eventId }),
        roundAPI.list({ event_id: eventId }),
        refereeAPI.categoryScores.list({ event_id: eventId }),
        matchRefereeScoreAPI.list({ event_id: eventId }),
        scoreAPI.list({ event_id: eventId }),
        categoryRefereeAssignmentAPI.list({ event_id: eventId }),
        matchEventAPI.list({ event_id: eventId }),
        matchRefereeAssignmentAPI.list({ event_id: eventId }),
        groupAPI.list({ event_id: eventId }),
        categoryAPI.list({ event_id: eventId }),
      ]);
      setFields(arr(fR));
      setSessions(arr(sR));
      setCatAssignments(arr(caR));
      setMatchAssignments(arr(maR));
      setMatches(arr(mR));
      setRounds(arr(rR));
      setRefScores(arr(rsR));
      setMatchRefScores(arr(mrsR));
      setAthleteScores(arr(asR));
      setRefAssignments(arr(raR));
      setMatchEvents(arr(meR));
      setMatchRefAssignments(arr(mraR));
      const gs = arr(gR);
      setGroups(gs);
      const cats = arr(cR).map(c => {
        const group = gs.find(g => g.id === c.group);
        return { ...c, groupName: group?.name || '' };
      });
      setAllCats(cats);
    } catch (err) {
      console.error('Fullscreen fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  // Lightweight fetch — match + category score state (polled every 2s)
  const fetchMatchState = useCallback(async () => {
    if (!eventId) return;
    try {
      const [rR, mrsR, meR, sR, mR, rsR, asR] = await Promise.all([
        roundAPI.list({ event_id: eventId }),
        matchRefereeScoreAPI.list({ event_id: eventId }),
        matchEventAPI.list({ event_id: eventId }),
        monitorAPI.sessions.list({ event_id: eventId }),
        matchAPI.list({ event_id: eventId }),
        refereeAPI.categoryScores.list({ event_id: eventId }),
        scoreAPI.list({ event_id: eventId }),
      ]);
      setRounds(arr(rR));
      setMatchRefScores(arr(mrsR));
      setMatchEvents(arr(meR));
      setSessions(arr(sR));
      setMatches(arr(mR));
      setRefScores(arr(rsR));
      setAthleteScores(arr(asR));
    } catch (err) {
      console.error('Match state fetch error:', err);
    }
  }, [eventId]);

  useEffect(() => {
    fetchData();
    pollRef.current = setInterval(fetchMatchState, 2000);
    return () => clearInterval(pollRef.current);
  }, [fetchData, fetchMatchState]);

  // ── Auto-pause: set session to idle when leaving fullscreen ──
  const sessionRef = useRef(null);
  useEffect(() => { sessionRef.current = sessions.find(s => s.field === fieldId); }, [sessions, fieldId]);
  useEffect(() => {
    return () => {
      const s = sessionRef.current;
      if (s && s.status !== 'idle') {
        monitorAPI.sessions.update(s.id, {
          current_category: null, current_match: null, current_athlete: null, status: 'idle',
        }).catch(console.error);
      }
    };
  }, [fieldId]);

  const field = fields.find(f => f.id === fieldId);
  const session = sessions.find(s => s.field === fieldId);
  const fieldCats = catAssignments
    .filter(a => a.field === fieldId)
    .map(a => allCats.find(c => c.id === a.category))
    .filter(Boolean);
  const fieldMatches = matchAssignments
    .filter(a => a.field === fieldId)
    .map(a => matches.find(m => m.id === a.match))
    .filter(Boolean);

  const currentCat = fieldCats.find(c => c.id === session?.current_category);
  const currentMatch = fieldMatches.find(m => m.id === session?.current_match)
                    || matches.find(m => m.id === session?.current_match);
  const matchRoundsForMatch = currentMatch
    ? rounds.filter(r => r.match === currentMatch.id).sort((a, b) => a.round_number - b.round_number)
    : [];
  const activeRound = matchRoundsForMatch.find(r => r.status === 'active');

  // ── API helpers ──
  const wrap = fn => async (...a) => {
    setBusy(true);
    try { await fn(...a); await fetchMatchState(); } catch(e) { console.error(e); }
    setBusy(false);
  };

  const switchDisplay = wrap(async (catId, matchId, athleteId, status = 'displaying') => {
    const data = { current_category: catId || null, current_match: matchId || null, current_athlete: athleteId || null, status };
    if (session) await monitorAPI.sessions.update(session.id, data);
    else await monitorAPI.sessions.create({ field: fieldId, ...data });
  });
  const setIdle = () => switchDisplay(null, null, null, 'idle');
  const revealScores = () => {
    if (session) switchDisplay(session.current_category, session.current_match, session.current_athlete, 'scores_revealed');
  };
  const revealDecisions = () => {
    if (session) switchDisplay(session.current_category, session.current_match, session.current_athlete, 'decisions_revealed');
  };
  const revealWinner = async () => {
    if (session) {
      await switchDisplay(session.current_category, session.current_match, session.current_athlete, 'winner_revealed');
      // Auto-finalize the match when winner is revealed
      const currentMatchId = session.current_match;
      if (currentMatchId) {
        try {
          await matchAPI.update(currentMatchId, { status: 'completed' });
          await fetchMatchState();
        } catch (e) { console.error('Auto-finalize error:', e); }
      }
    }
  };
  const startRound  = wrap(async id => { await roundAPI.update(id, { status: 'active', started_at: new Date().toISOString() }); });
  const endRound    = wrap(async id => { await roundAPI.update(id, { status: 'completed', ended_at: new Date().toISOString() }); });
  const resetRound  = wrap(async id => { await roundAPI.update(id, { status: 'scheduled', started_at: null, ended_at: null, paused_at: null, accumulated_pause_seconds: 0, extra_seconds: 0 }); });
  const createRounds = wrap(async (matchId, n = 3, dur = 180) => {
    for (let i = 1; i <= n; i++) await roundAPI.create({ match: matchId, round_number: i, duration_seconds: dur });
  });
  const pauseRound = wrap(async (matchId, roundId) => {
    await matchEventAPI.create({ match: matchId, round: roundId, event_type: 'pause' });
  });
  const resumeRound = wrap(async (matchId, roundId) => {
    await matchEventAPI.create({ match: matchId, round: roundId, event_type: 'resume' });
  });
  const addWarning = wrap(async (matchId, corner, roundId) => {
    await matchEventAPI.create({ match: matchId, round: roundId || null, event_type: corner === 'red' ? 'warning_red' : 'warning_blue', corner });
  });
  const addPenalty = wrap(async (matchId, corner, roundId, value = -2) => {
    await matchEventAPI.create({ match: matchId, round: roundId || null, event_type: corner === 'red' ? 'penalty_red' : 'penalty_blue', corner, value });
  });
  const addBonus = wrap(async (matchId, corner, roundId, value = 1) => {
    await matchEventAPI.create({ match: matchId, round: roundId || null, event_type: corner === 'red' ? 'bonus_red' : 'bonus_blue', corner, value });
  });
  const adjustTime = wrap(async (matchId, roundId, seconds) => {
    const event_type = seconds > 0 ? 'time_add' : 'time_remove';
    await matchEventAPI.create({ match: matchId, round: roundId, event_type, value: seconds });
  });
  const addInfraction = wrap(async (matchId, corner, roundId) => {
    await matchEventAPI.create({ match: matchId, round: roundId || null, event_type: corner === 'red' ? 'infraction_red' : 'infraction_blue', corner });
  });
  const addDisqualification = wrap(async (matchId, corner) => {
    await matchEventAPI.create({ match: matchId, event_type: corner === 'red' ? 'disqualify_red' : 'disqualify_blue', corner });
  });
  const removeLastEvent = wrap(async (matchId, eventType) => {
    // Find the last event of this type for this match and delete it
    const evts = matchEvents.filter(e => e.match === matchId && e.event_type === eventType);
    if (evts.length > 0) {
      const last = evts[evts.length - 1];
      await matchEventAPI.delete(last.id);
    }
  });
  const finalizeMatch = wrap(async (matchId) => {
    await matchAPI.update(matchId, { status: 'completed' });
  });
  const swapCorners = wrap(async (matchId) => {
    const m = matches.find(mm => mm.id === matchId);
    if (m) await matchAPI.update(matchId, { red_corner: m.blue_corner, blue_corner: m.red_corner });
  });
  const setDecision = wrap(async (matchId, refereeId, currentChoice) => {
    // Cycle: none → red → blue → none
    const existing = matchRefScores.find(s => s.match === matchId && s.referee === refereeId && s.round == null);
    if (!existing) {
      // Create red decision
      await matchRefereeScoreAPI.create({ match: matchId, referee: refereeId, round: null, red_corner_score: 10, blue_corner_score: 0 });
    } else if (currentChoice === 'red') {
      // Change to blue
      await matchRefereeScoreAPI.update(existing.id, { red_corner_score: 0, blue_corner_score: 10 });
    } else {
      // Delete (back to none)
      await matchRefereeScoreAPI.delete(existing.id);
    }
  });
  const resetMatch = wrap(async (matchId) => {
    const mrs = matchRoundsForMatch;
    for (const r of mrs) {
      await roundAPI.update(r.id, { status: 'scheduled', started_at: null, ended_at: null, paused_at: null, accumulated_pause_seconds: 0, extra_seconds: 0 });
    }
    const evts = matchEvents.filter(e => e.match === matchId);
    for (const ev of evts) {
      try { await matchEventAPI.delete(ev.id); } catch {}
    }
    // Also delete all referee scores for this match
    const scores = matchRefScores.filter(s => s.match === matchId);
    for (const sc of scores) {
      try { await matchRefereeScoreAPI.delete(sc.id); } catch {}
    }
  });

  if (loading) {
    return <div className="h-screen flex items-center justify-center bg-gray-100 text-gray-400 text-lg">Se încarcă...</div>;
  }

  if (!field) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-100 text-gray-500 gap-4">
        <p>Tatami negăsit.</p>
        <button onClick={() => navigate(-1)} className="text-sm bg-indigo-600 text-white px-4 py-2 ">← Înapoi</button>
      </div>
    );
  }

  const goBack = () => navigate(`/competitions/${eventId}/categories/live`);

  return (
    <div className="h-screen w-screen flex flex-col bg-white overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between bg-gray-800 text-white px-5 py-2.5 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={goBack} className="text-sm bg-gray-700 hover:bg-gray-600 px-4 py-2  font-medium transition"><span className="inline-block mr-1">&larr;</span> Inapoi</button>
          <span className="text-xl font-bold">{field.name}</span>
          {/* Live indicator in top nav */}
          {panelType === 'match' && currentMatch && (
            <span className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full  bg-green-400 opacity-75"></span>
                <span className="relative inline-flex  h-3 w-3 bg-green-500"></span>
              </span>
              <span className="text-sm font-semibold text-green-400 uppercase">Live</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Match control buttons in top nav */}
          {panelType === 'match' && currentMatch && (
            <>
              <button onClick={() => setShowResetConfirm(true)} disabled={busy} className="text-sm bg-gray-700 hover:bg-gray-600 text-white px-4 py-2  font-medium disabled:opacity-40 transition">Resetare meci</button>
              <button onClick={() => setShowStopConfirm(true)} disabled={busy} className="text-sm bg-gray-700 hover:bg-gray-600 text-white px-4 py-2  font-medium disabled:opacity-40 transition">Opreste</button>
            </>
          )}
          {/* Category control buttons in top nav */}
          {panelType === 'category' && currentCat && currentCat.type !== 'fight' && (
            <>
              <button onClick={() => setShowResetCategoryConfirm(true)} disabled={busy} className="text-sm bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 font-medium disabled:opacity-40 transition">Resetează Proba</button>
              <button onClick={() => setShowStopCategoryConfirm(true)} disabled={busy} className="text-sm bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 font-medium disabled:opacity-40 transition">Oprește</button>
            </>
          )}
          <a href={`http://localhost:${PUBLIC_DISPLAY_PORT}/display/${fieldId}`} target="_blank" rel="noopener noreferrer"
            className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2  font-medium transition">
            Public Display
          </a>
        </div>
      </div>

      {/* Reset match confirm (parent level) */}
      {showResetConfirm && currentMatch && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setShowResetConfirm(false)}>
          <div className="bg-white  shadow-2xl p-8 max-w-md text-center space-y-4" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16  bg-amber-100 flex items-center justify-center mx-auto">
              <span className="text-amber-600 text-2xl font-black">!</span>
            </div>
            <h3 className="text-xl font-bold text-gray-900">Resetare meci</h3>
            <p className="text-base text-gray-600">Esti sigur ca vrei sa resetezi tot meciul? Toate reprizele, evenimentele si scorurile vor fi sterse. Actiunea este ireversibila.</p>
            <div className="flex gap-3 justify-center pt-2">
              <button onClick={() => setShowResetConfirm(false)} className="text-sm bg-gray-200 text-gray-700 px-6 py-2.5  font-medium hover:bg-gray-300">Anuleaza</button>
              <button onClick={async () => { setShowResetConfirm(false); await resetMatch(currentMatch.id); }} disabled={busy} className="text-sm bg-red-600 text-white px-6 py-2.5  font-bold hover:bg-red-700 disabled:opacity-40">Reseteaza tot</button>
            </div>
          </div>
        </div>
      )}

      {/* Stop match confirm (parent level) */}
      {showStopConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setShowStopConfirm(false)}>
          <div className="bg-white  shadow-2xl p-8 max-w-md text-center space-y-4" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16  bg-red-100 flex items-center justify-center mx-auto">
              <span className="text-red-600 text-2xl font-black">!</span>
            </div>
            <h3 className="text-xl font-bold text-gray-900">Opreste meciul</h3>
            <p className="text-base text-gray-600">Acest buton va opri afisarea meciului pe tatami si va reveni la ecranul de asteptare. Meciul nu va fi sters — reprizele, scorurile si evenimentele raman salvate.</p>
            <div className="flex gap-3 justify-center pt-2">
              <button onClick={() => setShowStopConfirm(false)} className="text-sm bg-gray-200 text-gray-700 px-6 py-2.5  font-medium hover:bg-gray-300">Anuleaza</button>
              <button onClick={() => { setShowStopConfirm(false); setIdle(); }} disabled={busy} className="text-sm bg-red-600 text-white px-6 py-2.5  font-bold hover:bg-red-700 disabled:opacity-40">Opreste</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset category confirm */}
      {showResetCategoryConfirm && currentCat && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setShowResetCategoryConfirm(false)}>
          <div className="bg-white shadow-2xl p-8 max-w-md text-center space-y-4" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-amber-100 flex items-center justify-center mx-auto">
              <span className="text-amber-600 text-2xl font-black">!</span>
            </div>
            <h3 className="text-xl font-bold text-gray-900">Resetează proba</h3>
            <p className="text-base text-gray-600">Ești sigur că vrei să resetezi toate scorurile din această probă? Toate scorurile arbitrilor vor fi șterse. Acțiunea este ireversibilă.</p>
            <div className="flex gap-3 justify-center pt-2">
              <button onClick={() => setShowResetCategoryConfirm(false)} className="text-sm bg-gray-200 text-gray-700 px-6 py-2.5 font-medium hover:bg-gray-300">Anulează</button>
              <button onClick={async () => {
                setShowResetCategoryConfirm(false);
                setBusy(true);
                try {
                  const catScores = refScores.filter(rs => {
                    const as = athleteScores.find(a => a.id === rs.athlete_score);
                    return as && as.category === currentCat.id;
                  });
                  for (const s of catScores) { try { await refereeAPI.categoryScores.delete(s.id); } catch {} }
                  await fetchMatchState();
                } catch(e) { console.error(e); }
                setBusy(false);
              }} disabled={busy} className="text-sm bg-red-600 text-white px-6 py-2.5 font-bold hover:bg-red-700 disabled:opacity-40">Resetează tot</button>
            </div>
          </div>
        </div>
      )}

      {/* Stop category confirm */}
      {showStopCategoryConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setShowStopCategoryConfirm(false)}>
          <div className="bg-white shadow-2xl p-8 max-w-md text-center space-y-4" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-red-100 flex items-center justify-center mx-auto">
              <span className="text-red-600 text-2xl font-black">!</span>
            </div>
            <h3 className="text-xl font-bold text-gray-900">Oprește proba</h3>
            <p className="text-base text-gray-600">Acest buton va opri afișarea probei pe tatami și va reveni la ecranul de așteptare. Scorurile rămân salvate.</p>
            <div className="flex gap-3 justify-center pt-2">
              <button onClick={() => setShowStopCategoryConfirm(false)} className="text-sm bg-gray-200 text-gray-700 px-6 py-2.5 font-medium hover:bg-gray-300">Anulează</button>
              <button onClick={() => { setShowStopCategoryConfirm(false); setIdle(); }} disabled={busy} className="text-sm bg-red-600 text-white px-6 py-2.5 font-bold hover:bg-red-700 disabled:opacity-40">Oprește</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 overflow-auto p-4">
        {panelType === 'category' && currentCat && currentCat.type !== 'fight' ? (
          <FullscreenCategoryPanel
            cat={currentCat}
            session={session}
            refAssignment={refAssignments.find(ra => ra.category === currentCat.id)}
            athleteScores={athleteScores.filter(as => as.category === currentCat.id)}
            refScores={refScores}
            busy={busy}
            switchDisplay={switchDisplay}
            setIdle={setIdle}
            revealScores={revealScores}
            onRefresh={fetchMatchState}
          />
        ) : panelType === 'match' && currentMatch ? (
          <FullscreenMatchPanel
            match={currentMatch}
            session={session}
            matchRounds={matchRoundsForMatch}
            activeRound={activeRound}
            matchRefScores={matchRefScores.filter(s => s.match === currentMatch.id)}
            matchEvents={matchEvents.filter(e => e.match === currentMatch.id)}
            matchRefAssignment={matchRefAssignments.find(a => a.match === currentMatch.id)}
            allCats={allCats}
            busy={busy}
            setIdle={setIdle}
            startRound={startRound}
            endRound={endRound}
            resetRound={resetRound}
            createRounds={createRounds}
            pauseRound={pauseRound}
            resumeRound={resumeRound}
            addWarning={addWarning}
            addPenalty={addPenalty}
            addBonus={addBonus}
            addInfraction={addInfraction}
            addDisqualification={addDisqualification}
            removeLastEvent={removeLastEvent}
            adjustTime={adjustTime}
            resetMatch={resetMatch}
            finalizeMatch={finalizeMatch}
            revealDecisions={revealDecisions}
            revealWinner={revealWinner}
            switchDisplay={switchDisplay}
            swapCorners={swapCorners}
            setDecision={setDecision}
            onRefresh={fetchMatchState}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400 text-lg italic">
            <div className="text-center">
              <span className="text-6xl block mb-3">&mdash;</span>
              Nicio proba in desfasurare pe acest tatami.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   FULLSCREEN CATEGORY PANEL — solo/team scoring
   ═══════════════════════════════════════════════════════ */
function FullscreenCategoryPanel({ cat, session, refAssignment, athleteScores, refScores, busy, switchDisplay, setIdle, revealScores, onRefresh }) {
  const enrolled = cat.enrolled_athletes || [];
  const genderLabels = { male: 'Masculin', female: 'Feminin', mixt: 'Mixt' };

  // Modal state for admin score input per referee
  const [catRefModalData, setCatRefModalData] = useState(null); // { refId, refName, refPos, athleteId, athleteName, currentScore, existingScoreId }
  const [catScoreInput, setCatScoreInput] = useState('');

  // Build referee list from category referee assignment
  const referees = [];
  if (refAssignment) {
    for (let i = 1; i <= 5; i++) {
      const id = refAssignment[`referee_${i}`];
      const name = refAssignment[`referee_${i}_name`];
      if (id) referees.push({ pos: i, id, name: name || `A${i}` });
    }
  }
  const refCols = referees.length > 0 ? referees : [1,2,3,4,5].map(i => ({ pos: i, id: null, name: `A${i}` }));

  // Build rows with scores per referee
  const rows = enrolled.map(ea => {
    const athleteId = ea.athlete;
    const d = ea.athlete_details || {};
    const athleteName = `${d.last_name || ''} ${d.first_name || ''}`.trim() || `#${athleteId}`;
    const clubName = d.club_name || '';
    const catScore = athleteScores.find(as => (as.athlete?.id ?? as.athlete) === athleteId);
    const catScoreId = catScore?.id;
    const rScores = catScoreId ? refScores.filter(rs => rs.athlete_score === catScoreId) : [];
    const scoreByRef = {};
    const scoreIdByRef = {};
    for (const rs of rScores) { scoreByRef[rs.referee] = rs.score; scoreIdByRef[rs.referee] = rs.id; }
    const vals = refCols.map(r => r.id ? scoreByRef[r.id] : undefined);
    const scoreIds = refCols.map(r => r.id ? scoreIdByRef[r.id] : undefined);
    const numericVals = vals.filter(v => v != null).map(Number);
    let marks = vals.map(() => 'mid');
    let total = null;
    if (numericVals.length >= 5) {
      const sorted = [...numericVals].sort((a, b) => a - b);
      const low = sorted[0]; const high = sorted[sorted.length - 1];
      let foundLow = false, foundHigh = false;
      marks = vals.map(v => { if (v == null) return 'empty'; const n = Number(v); if (!foundLow && n === low) { foundLow = true; return 'low'; } if (!foundHigh && n === high) { foundHigh = true; return 'high'; } return 'mid'; });
      total = sorted.slice(1, 4).reduce((s, v) => s + v, 0);
    } else if (numericVals.length > 0) { total = numericVals.reduce((s, v) => s + v, 0); }
    const allScoresIn = numericVals.length >= 5;
    const isActive = session?.current_athlete === athleteId;
    const isRevealed = isActive && session?.status === 'scores_revealed';
    return { athleteId, athleteName, clubName, vals, marks, total, allScoresIn, scoreCount: numericVals.length, isActive, isRevealed, scoreIds, catScoreId };
  });

  // Sort by total descending for ranking
  const sortedRows = [...rows].filter(r => r.total != null).sort((a, b) => (b.total || 0) - (a.total || 0));
  const getRank = (athleteId) => { const idx = sortedRows.findIndex(r => r.athleteId === athleteId); return idx >= 0 ? idx + 1 : null; };

  // Check if active athlete has all scores
  const activeRow = rows.find(r => r.isActive);

  // Reset single athlete scores
  const resetAthleteScores = async (row) => {
    try {
      for (const sid of row.scoreIds) {
        if (sid) { try { await refereeAPI.categoryScores.delete(sid); } catch {} }
      }
      await onRefresh();
    } catch(e) { console.error(e); }
  };

  // Submit admin score for a referee
  const submitCatRefScore = async () => {
    if (!catRefModalData) return;
    const val = parseFloat(catScoreInput);
    if (isNaN(val) || val < 0 || val > 100) return;
    try {
      if (catRefModalData.existingScoreId) {
        await refereeAPI.categoryScores.update(catRefModalData.existingScoreId, { score: val });
      } else {
        await refereeAPI.categoryScores.create({
          category: cat.id,
          athlete: catRefModalData.athleteId,
          referee: catRefModalData.refId,
          score: val,
        });
      }
      setCatRefModalData(null);
      setCatScoreInput('');
      await onRefresh();
    } catch(e) { console.error(e); }
  };

  // Delete a referee's score
  const deleteCatRefScore = async () => {
    if (!catRefModalData?.existingScoreId) return;
    try {
      await refereeAPI.categoryScores.delete(catRefModalData.existingScoreId);
      setCatRefModalData(null);
      setCatScoreInput('');
      await onRefresh();
    } catch(e) { console.error(e); }
  };

  return (
    <div className="w-full space-y-4">
      {/* ── Category info header (like match info tags) ── */}
      <div className="border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          {/* Left: title + tags */}
          <div>
            <h1 className="text-2xl font-black text-gray-900">{cat.name}</h1>
            <div className="flex flex-wrap gap-2 mt-2">
              {cat.groupName && <span className="text-xs font-bold bg-gray-100 border border-gray-200 text-gray-600 px-2.5 py-1">{cat.groupName}</span>}
              {cat.gender && <span className="text-xs font-bold bg-gray-100 border border-gray-200 text-gray-600 px-2.5 py-1">{genderLabels[cat.gender] || cat.gender}</span>}
              <span className="text-xs font-bold bg-indigo-100 border border-indigo-200 text-indigo-700 px-2.5 py-1 uppercase">{cat.type === 'teams' ? 'Echipe' : 'Solo'}</span>
            </div>
          </div>
          {/* Right: referee badges */}
          <div className="flex flex-col items-end gap-2">
            {referees.length > 0 && (
              <div className="flex flex-wrap gap-1.5 justify-end">
                {referees.map(r => (
                  <span key={r.pos} className="text-xs bg-gray-50 border border-gray-200 px-2.5 py-1 font-medium text-gray-600">
                    A{r.pos}: <span className="text-gray-900 font-bold">{r.name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Active athlete card — highlighted like match VS section ── */}
      {activeRow && (
        <div className={`border-2 p-4 shadow-sm ${activeRow.isRevealed ? 'border-yellow-400 bg-yellow-50' : 'border-green-400 bg-green-50'}`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${activeRow.isRevealed ? 'text-yellow-600' : 'text-green-600'}`}>
                {activeRow.isRevealed ? '✓ Scoruri afișate pe TV' : 'Prezintă acum'}
              </p>
              <h2 className="text-xl font-black text-gray-900">{activeRow.athleteName} {activeRow.clubName && <span className="text-base font-medium text-gray-500">({activeRow.clubName})</span>}</h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-gray-500 mb-1">Scoruri primite</p>
                <p className="text-2xl font-black tabular-nums text-gray-700">{activeRow.scoreCount} / 5</p>
              </div>
              {/* Reveal button for active athlete */}
              {activeRow.isRevealed ? (
                <span className="text-sm bg-green-100 text-green-700 px-4 py-2 font-bold border border-green-300">✓ Afișat</span>
              ) : (
                <button
                  onClick={() => switchDisplay(cat.id, null, activeRow.athleteId, 'scores_revealed')}
                  disabled={busy}
                  className="text-sm bg-yellow-500 hover:bg-yellow-600 text-black px-5 py-2.5 font-bold disabled:opacity-40 transition"
                >
                  🏆 Afișează rezultate
                </button>
              )}
            </div>
          </div>
          {/* Active athlete referee scores boxes — CLICKABLE for admin score input */}
          <div className="grid grid-cols-5 gap-2">
            {refCols.map((r, i) => {
              const v = activeRow.vals[i];
              const mark = activeRow.marks[i];
              const isCancelled = mark === 'low' || mark === 'high';
              const hasScore = v != null;
              const scoreId = activeRow.scoreIds[i];
              return (
                <button
                  key={i}
                  onClick={() => {
                    if (!r.id) return;
                    setCatRefModalData({
                      refId: r.id,
                      refName: r.name,
                      refPos: r.pos,
                      athleteId: activeRow.athleteId,
                      athleteName: activeRow.athleteName,
                      currentScore: hasScore ? Number(v) : null,
                      existingScoreId: scoreId || null,
                    });
                    setCatScoreInput(hasScore ? Number(v).toString() : '');
                  }}
                  className={`flex flex-col items-center justify-center py-3 border-2 transition-all cursor-pointer hover:ring-2 hover:ring-indigo-400 ${
                    hasScore
                      ? isCancelled ? 'border-red-300 bg-red-50' : 'border-green-400 bg-white'
                      : 'border-gray-200 bg-gray-50 border-dashed'
                  }`}
                >
                  <span className="text-xs font-bold text-gray-400 mb-1">A{r.pos}</span>
                  <span className={`text-xl font-black tabular-nums ${
                    isCancelled ? 'text-red-400 line-through' : hasScore ? 'text-gray-900' : 'text-gray-300'
                  }`}>{hasScore ? Number(v).toFixed(1) : '—'}</span>
                  <span className="text-[10px] text-indigo-400 mt-1">click = editează</span>
                </button>
              );
            })}
          </div>
          {/* Total for active athlete */}
          {activeRow.total != null && (
            <div className="text-center mt-3 pt-3 border-t border-green-300">
              <span className="text-sm text-gray-500 font-bold uppercase mr-2">TOTAL:</span>
              <span className="text-2xl font-black text-green-700 tabular-nums">{activeRow.total.toFixed(1)}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Admin referee score input modal ── */}
      {catRefModalData && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => { setCatRefModalData(null); setCatScoreInput(''); }}>
          <div className="bg-white shadow-2xl p-6 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 text-center">A{catRefModalData.refPos} — {catRefModalData.refName}</h3>
            <p className="text-sm text-gray-500 text-center">Scor pentru: <span className="font-bold text-gray-800">{catRefModalData.athleteName}</span></p>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-600">Scor (0 – 100)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={catScoreInput}
                onChange={e => setCatScoreInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitCatRefScore(); }}
                autoFocus
                className="w-full border-2 border-gray-300 px-4 py-3 text-2xl font-black text-center tabular-nums focus:border-indigo-500 focus:outline-none"
                placeholder="ex: 8.5"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={submitCatRefScore}
                disabled={!catScoreInput || isNaN(parseFloat(catScoreInput)) || parseFloat(catScoreInput) < 0 || parseFloat(catScoreInput) > 100}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 font-bold text-base disabled:opacity-40 transition"
              >
                {catRefModalData.existingScoreId ? 'Actualizează' : 'Salvează'}
              </button>
              {catRefModalData.existingScoreId && (
                <button
                  onClick={deleteCatRefScore}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-3 font-bold text-base transition"
                >
                  Șterge
                </button>
              )}
            </div>
            <button onClick={() => { setCatRefModalData(null); setCatScoreInput(''); }} className="w-full text-sm text-gray-500 hover:text-gray-700 py-2 font-medium">Închide</button>
          </div>
        </div>
      )}

      {/* ── Athletes table — all participants ── */}
      <div className="border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-100 border-b border-gray-200">
          <p className="text-sm font-bold text-gray-600 uppercase tracking-wide">Toți sportivii ({enrolled.length})</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-3 py-2.5 font-bold text-gray-600 border-b-2 border-gray-300 w-10">#</th>
                <th className="text-left px-3 py-2.5 font-bold text-gray-600 border-b-2 border-gray-300">Sportiv</th>
                {refCols.map(r => (<th key={r.pos} className="text-center px-2 py-2.5 font-bold text-gray-600 border-b-2 border-gray-300 w-16">A{r.pos}</th>))}
                <th className="text-center px-3 py-2.5 font-bold text-gray-600 border-b-2 border-gray-300 w-20">TOTAL</th>
                <th className="text-center px-2 py-2.5 font-bold text-gray-600 border-b-2 border-gray-300 w-12">Loc</th>
                <th className="text-center px-2 py-2.5 border-b-2 border-gray-300 w-36">Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const rank = getRank(row.athleteId);
                return (
                  <tr key={row.athleteId} className={`${
                    row.isRevealed ? 'bg-yellow-50 ring-2 ring-yellow-300 ring-inset' : row.isActive ? 'bg-green-100 ring-2 ring-green-300 ring-inset' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                  } hover:bg-yellow-50/50 transition`}>
                    <td className="px-3 py-2.5 border-b border-gray-200 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="px-3 py-2.5 border-b border-gray-200">
                      <span className="text-gray-900 font-semibold">{row.athleteName}</span>
                      {row.clubName && <span className="text-gray-400 text-xs ml-1">({row.clubName})</span>}
                    </td>
                    {row.vals.map((v, ri) => {
                      const mark = row.marks[ri]; const isCancelled = mark === 'low' || mark === 'high';
                      return (<td key={ri} className={`text-center px-2 py-2.5 border-b border-gray-200 tabular-nums text-sm ${isCancelled ? 'text-red-400 line-through' : v != null ? 'text-gray-900 font-medium' : 'text-gray-300'}`}>{v != null ? Number(v).toFixed(1) : '—'}</td>);
                    })}
                    <td className="text-center px-3 py-2.5 border-b border-gray-200 font-bold text-gray-900 tabular-nums">{row.total != null ? row.total.toFixed(1) : '—'}</td>
                    <td className="text-center px-2 py-2.5 border-b border-gray-200">
                      {rank && rank <= 3 ? (
                        <span className={`text-xs font-black px-2 py-0.5 ${rank === 1 ? 'bg-yellow-100 text-yellow-700' : rank === 2 ? 'bg-gray-200 text-gray-600' : 'bg-orange-100 text-orange-600'}`}>{rank}</span>
                      ) : rank ? <span className="text-xs text-gray-400">{rank}</span> : '—'}
                    </td>
                    <td className="text-center px-2 py-2.5 border-b border-gray-200">
                      <div className="flex items-center justify-center gap-1">
                        {/* TV button — switch display to this athlete */}
                        <button onClick={() => switchDisplay(cat.id, null, row.athleteId)} disabled={busy}
                          className={`text-xs px-2 py-1 font-bold disabled:opacity-40 ${row.isActive ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}>
                          {row.isActive ? '●' : 'START'}
                        </button>
                        {/* Reveal button — switch to athlete + reveal scores on TV */}
                        {row.allScoresIn && (
                          <button
                            onClick={() => switchDisplay(cat.id, null, row.athleteId, 'scores_revealed')}
                            disabled={busy}
                            className={`text-xs px-2 py-1 font-bold disabled:opacity-40 ${
                              row.isRevealed ? 'bg-yellow-400 text-black' : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                            }`}
                            title="Reveal scoruri pe TV"
                          >
                            {row.isRevealed ? '✓' : '👁'}
                          </button>
                        )}
                        {/* Reset button — delete this athlete's scores */}
                        {row.scoreCount > 0 && (
                          <button
                            onClick={() => resetAthleteScores(row)}
                            disabled={busy}
                            className="text-xs px-2 py-1 font-bold bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-40"
                            title="Resetează scorurile acestui sportiv"
                          >
                            ↺
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   FULLSCREEN MATCH PANEL
   ═══════════════════════════════════════════════════════ */
function FullscreenMatchPanel({
  match, session, matchRounds, activeRound, matchRefScores, matchEvents,
  matchRefAssignment, allCats, busy, setIdle, startRound, endRound, resetRound, createRounds,
  pauseRound, resumeRound, addWarning, addPenalty, addBonus, addInfraction, addDisqualification,
  removeLastEvent, adjustTime, resetMatch, finalizeMatch, revealDecisions, revealWinner, switchDisplay, swapCorners, setDecision, onRefresh,
}) {
  const [showRoundResetConfirm, setShowRoundResetConfirm] = useState(null); // round id
  const [showStopRoundConfirm, setShowStopRoundConfirm] = useState(null); // round id for stop confirm
  const [showWinnerConfirm, setShowWinnerConfirm] = useState(false);
  const [breakTimers, setBreakTimers] = useState({});
  const [refModalData, setRefModalData] = useState(null); // { ref, matchId }
  const prevRoundStatusRef = useRef({});

  // Build referee list from match referee assignment
  const matchReferees = [];
  if (matchRefAssignment) {
    for (let i = 1; i <= 5; i++) {
      const id = matchRefAssignment[`referee_${i}`];
      const name = matchRefAssignment[`referee_${i}_name`];
      if (id) matchReferees.push({ pos: i, id, name: name || `A${i}` });
    }
  }

  // ── Compute stats from events ──
  const infractionsRed = matchEvents.filter(e => e.event_type === 'infraction_red').length;
  const infractionsBlue = matchEvents.filter(e => e.event_type === 'infraction_blue').length;
  const warningsRed = matchEvents.filter(e => e.event_type === 'warning_red').length;
  const warningsBlue = matchEvents.filter(e => e.event_type === 'warning_blue').length;
  const disqualifiedRed = matchEvents.some(e => e.event_type === 'disqualify_red');
  const disqualifiedBlue = matchEvents.some(e => e.event_type === 'disqualify_blue');
  const penaltyEventsRed = matchEvents.filter(e => e.event_type === 'penalty_red');
  const penaltyEventsBlue = matchEvents.filter(e => e.event_type === 'penalty_blue');
  const bonusEventsRed = matchEvents.filter(e => e.event_type === 'bonus_red');
  const bonusEventsBlue = matchEvents.filter(e => e.event_type === 'bonus_blue');
  const totalPenaltyRed = penaltyEventsRed.reduce((s, e) => s + (e.value || 0), 0);
  const totalPenaltyBlue = penaltyEventsBlue.reduce((s, e) => s + (e.value || 0), 0);
  const totalBonusRed = bonusEventsRed.reduce((s, e) => s + (e.value || 0), 0);
  const totalBonusBlue = bonusEventsBlue.reduce((s, e) => s + (e.value || 0), 0);
  // Warnings auto-add -2p each
  const warningPenaltyRed = warningsRed * -2;
  const warningPenaltyBlue = warningsBlue * -2;
  const adjustRed = totalPenaltyRed + totalBonusRed + warningPenaltyRed;
  const adjustBlue = totalPenaltyBlue + totalBonusBlue + warningPenaltyBlue;
  // Infractions that haven't yet been converted (mod 3)
  const currentInfractionsRed = infractionsRed % 3;
  const currentInfractionsBlue = infractionsBlue % 3;

  const allRoundsCompleted = matchRounds.length > 0 && matchRounds.every(r => r.status === 'completed');
  const matchStarted = matchRounds.some(r => r.status === 'active' || r.status === 'completed');
  const decisionsSubmitted = matchRefScores.filter(s => s.winner_choice && s.round == null);
  const allRefereesDecided = allRoundsCompleted && (
    // Case 1: known referees from assignment — all have decided
    (matchReferees.length > 0 && matchReferees.every(ref => {
      return matchRefScores.filter(s => s.referee === ref.id && s.round == null).some(s => s.winner_choice);
    }))
    // Case 2: no assignment, but at least one decision exists
    || (matchReferees.length === 0 && decisionsSubmitted.length > 0)
  );
  const totalRounds = matchRounds.length;
  const isMatchFinalized = match.status === 'completed';

  // Determine winner corner from referee decisions
  const redVotes = decisionsSubmitted.filter(s => s.winner_choice === 'red').length;
  const blueVotes = decisionsSubmitted.filter(s => s.winner_choice === 'blue').length;
  const matchWinner = disqualifiedRed ? 'blue' : disqualifiedBlue ? 'red' : redVotes > blueVotes ? 'red' : blueVotes > redVotes ? 'blue' : null;

  // ── Infraction handler: auto-converts 3 infractions → 1 warning ──
  const handleInfraction = async (corner) => {
    await addInfraction(match.id, corner, activeRound?.id);
    // After adding, check if we just hit a multiple of 3
    // We need +1 because the event hasn't been polled yet
    const currentCount = corner === 'red' ? infractionsRed + 1 : infractionsBlue + 1;
    if (currentCount % 3 === 0) {
      // Auto-add warning (-2p) 
      await addWarning(match.id, corner, activeRound?.id);
      // Check if this is the 3rd warning → auto-disqualify
      const currentWarnings = (corner === 'red' ? warningsRed : warningsBlue) + 1;
      if (currentWarnings >= 3) {
        await addDisqualification(match.id, corner);
      }
    }
  };

  // Auto-start break when a round completes
  useEffect(() => {
    matchRounds.forEach((r, idx) => {
      const prevStatus = prevRoundStatusRef.current[r.id];
      if (prevStatus === 'active' && r.status === 'completed' && idx < matchRounds.length - 1) {
        setBreakTimers(prev => ({ ...prev, [idx]: true }));
      }
    });
    const statusMap = {};
    matchRounds.forEach(r => { statusMap[r.id] = r.status; });
    prevRoundStatusRef.current = statusMap;
  }, [matchRounds]);

  const handleConfirmRoundReset = async () => {
    if (showRoundResetConfirm) {
      await resetRound(showRoundResetConfirm);
    }
    setShowRoundResetConfirm(null);
  };

  const dismissBreak = (idx) => {
    setBreakTimers(prev => { const n = { ...prev }; delete n[idx]; return n; });
  };

  return (
    <div className="w-full space-y-4 relative">
      {/* Finalized alert */}
      {isMatchFinalized && (
        <div className="w-full bg-green-100 border border-green-400 px-5 py-3 flex items-center gap-3">
          <span className="text-green-700 text-lg">✓</span>
          <span className="text-sm font-bold text-green-800">Meci finalizat — rezultatele au fost salvate</span>
        </div>
      )}

      {/* Reset round confirm dialog */}
      {showStopRoundConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setShowStopRoundConfirm(null)}>
          <div className="bg-white p-6 max-w-md w-full mx-4 shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900">Oprire repriza</h3>
            <p className="text-base text-gray-600">Esti sigur ca vrei sa opresti repriza? Repriza va fi marcata ca finalizata si nu va mai putea fi continuata.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowStopRoundConfirm(null)} className="text-sm bg-gray-200 text-gray-700 px-6 py-2.5 font-medium hover:bg-gray-300">Anuleaza</button>
              <button onClick={() => { endRound(showStopRoundConfirm); setShowStopRoundConfirm(null); }} disabled={busy} className="text-sm bg-red-600 text-white px-6 py-2.5 font-bold hover:bg-red-700 disabled:opacity-40">Opreste Repriza</button>
            </div>
          </div>
        </div>
      )}

      {showRoundResetConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setShowRoundResetConfirm(null)}>
          <div className="bg-white  shadow-2xl p-8 max-w-md text-center space-y-4" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16  bg-amber-100 flex items-center justify-center mx-auto">
              <span className="text-amber-600 text-2xl font-black">!</span>
            </div>
            <h3 className="text-xl font-bold text-gray-900">Resetare repriza</h3>
            <p className="text-base text-gray-600">Esti sigur ca vrei sa resetezi aceasta repriza? Timpul si statusul vor fi resetate.</p>
            <div className="flex gap-3 justify-center pt-2">
              <button onClick={() => setShowRoundResetConfirm(null)} className="text-sm bg-gray-200 text-gray-700 px-6 py-2.5  font-medium hover:bg-gray-300">Anuleaza</button>
              <button onClick={handleConfirmRoundReset} disabled={busy} className="text-sm bg-orange-600 text-white px-6 py-2.5  font-bold hover:bg-orange-700 disabled:opacity-40">Reseteaza repriza</button>
            </div>
          </div>
        </div>
      )}

      {/* Winner reveal confirmation modal — when not all referees have submitted */}
      {showWinnerConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setShowWinnerConfirm(false)}>
          <div className="bg-white shadow-2xl p-8 max-w-md text-center space-y-4" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-amber-100 flex items-center justify-center mx-auto">
              <span className="text-amber-600 text-2xl font-black">!</span>
            </div>
            <h3 className="text-xl font-bold text-gray-900">Nu toți arbitrii au trimis decizia</h3>
            <p className="text-base text-gray-600">
              Doar {matchRefScores.filter(s => s.winner_choice && s.round == null).length} din {matchReferees.length || 5} arbitri au trimis decizia. Ești sigur că vrei să afișezi câștigătorul?
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <button onClick={() => setShowWinnerConfirm(false)} className="text-sm bg-gray-200 text-gray-700 px-6 py-2.5 font-medium hover:bg-gray-300">Anuleaza</button>
              <button onClick={() => { setShowWinnerConfirm(false); revealWinner(); }} disabled={busy} className="text-sm bg-yellow-500 text-black px-6 py-2.5 font-bold hover:bg-yellow-600 disabled:opacity-40">🏆 Afișează oricum</button>
            </div>
          </div>
        </div>
      )}

      {/* Referee decision modal — shows scores and lets admin pick winner */}
      {refModalData && (() => {
        const ref = refModalData.ref;
        const refScoresForRef = matchRefScores.filter(s => s.referee === ref.id);
        const roundScores = refScoresForRef.filter(s => s.round != null);
        const totalRedRef = roundScores.reduce((s, sc) => s + Number(sc.red_corner_score || 0), 0);
        const totalBlueRef = roundScores.reduce((s, sc) => s + Number(sc.blue_corner_score || 0), 0);
        const grandTotalRedRef = totalRedRef + adjustRed;
        const grandTotalBlueRef = totalBlueRef + adjustBlue;
        return (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setRefModalData(null)}>
            <div className="bg-white  shadow-2xl p-6 max-w-lg w-full space-y-4" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-900 text-center">{ref.name} — Scoruri per reprize</h3>
              {/* Scores table */}
              <table className="w-full border-collapse border border-gray-300 text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="px-3 py-2 border border-gray-300 text-left">Repriza</th>
                    <th className="px-3 py-2 border border-gray-300 text-center text-red-600">Roșu</th>
                    <th className="px-3 py-2 border border-gray-300 text-center text-blue-600">Albastru</th>
                  </tr>
                </thead>
                <tbody>
                  {matchRounds.map(r => {
                    const rs = roundScores.find(s => s.round === r.id);
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 border border-gray-300 font-medium">R{r.round_number}</td>
                        <td className="px-3 py-2 border border-gray-300 text-center font-bold text-red-600 tabular-nums">{rs?.red_corner_score != null ? Number(rs.red_corner_score) : '—'}</td>
                        <td className="px-3 py-2 border border-gray-300 text-center font-bold text-blue-600 tabular-nums">{rs?.blue_corner_score != null ? Number(rs.blue_corner_score) : '—'}</td>
                      </tr>
                    );
                  })}
                  {adjustRed !== 0 || adjustBlue !== 0 ? (
                    <tr className="bg-gray-100 font-bold">
                      <td className="px-3 py-2 border border-gray-300">Total</td>
                      <td className="px-3 py-2 border border-gray-300 text-center text-red-700 tabular-nums">{grandTotalRedRef} <span className={`text-xs font-medium ${adjustRed > 0 ? 'text-green-600' : 'text-red-500'}`}>({adjustRed > 0 ? '+' : ''}{adjustRed})</span></td>
                      <td className="px-3 py-2 border border-gray-300 text-center text-blue-700 tabular-nums">{grandTotalBlueRef} <span className={`text-xs font-medium ${adjustBlue > 0 ? 'text-green-600' : 'text-red-500'}`}>({adjustBlue > 0 ? '+' : ''}{adjustBlue})</span></td>
                    </tr>
                  ) : (
                    <tr className="bg-gray-100 font-bold">
                      <td className="px-3 py-2 border border-gray-300">Total</td>
                      <td className="px-3 py-2 border border-gray-300 text-center text-red-700 tabular-nums">{grandTotalRedRef}</td>
                      <td className="px-3 py-2 border border-gray-300 text-center text-blue-700 tabular-nums">{grandTotalBlueRef}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {/* Choose winner buttons */}
              <p className="text-sm text-gray-500 text-center">Alege câștigătorul pentru {ref.name}:</p>
              <div className="flex gap-3 justify-center">
                <button onClick={async () => {
                  const existing = matchRefScores.find(s => s.match === refModalData.matchId && s.referee === ref.id && s.round == null);
                  if (existing) await matchRefereeScoreAPI.update(existing.id, { red_corner_score: 10, blue_corner_score: 0 });
                  else await matchRefereeScoreAPI.create({ match: refModalData.matchId, referee: ref.id, round: null, red_corner_score: 10, blue_corner_score: 0 });
                  setRefModalData(null);
                  onRefresh();
                }} disabled={busy}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-3  font-bold text-base disabled:opacity-40 transition">
                  {match.red_corner_full_name || 'Roșu'}
                </button>
                <button onClick={async () => {
                  const existing = matchRefScores.find(s => s.match === refModalData.matchId && s.referee === ref.id && s.round == null);
                  if (existing) await matchRefereeScoreAPI.update(existing.id, { red_corner_score: 0, blue_corner_score: 10 });
                  else await matchRefereeScoreAPI.create({ match: refModalData.matchId, referee: ref.id, round: null, red_corner_score: 0, blue_corner_score: 10 });
                  setRefModalData(null);
                  onRefresh();
                }} disabled={busy}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3  font-bold text-base disabled:opacity-40 transition">
                  {match.blue_corner_full_name || 'Albastru'}
                </button>
              </div>
              <button onClick={() => setRefModalData(null)} className="w-full text-sm text-gray-500 hover:text-gray-700 py-2 font-medium">Închide</button>
            </div>
          </div>
        );
      })()}

      {/* ── ATHLETE NAMES HEADER (only names, centered) + match info on right ── */}
      {(() => {
        const matchCat = allCats?.find(c => c.id === match.category);
        const matchTypeLabels = { 'qualifications': 'Calificări', 'quarter-finals': 'Sferturi', 'semi-finals': 'Semi-finală', 'finals': 'Finală', 'bronze': 'Bronz' };
        const genderLabels = { 'male': 'Masculin', 'female': 'Feminin', 'mixt': 'Mixt' };
        return matchCat ? (
          <div className="flex items-center justify-end gap-2 px-4 py-1 text-xs text-gray-500 font-medium">
            <span className="bg-gray-100 border border-gray-200 px-2 py-0.5">{matchCat.name}</span>
            {matchCat.groupName && <span className="bg-gray-100 border border-gray-200 px-2 py-0.5">{matchCat.groupName}</span>}
            <span className="bg-gray-100 border border-gray-200 px-2 py-0.5">{genderLabels[matchCat.gender] || matchCat.gender}</span>
            <span className="bg-indigo-100 border border-indigo-200 text-indigo-700 px-2 py-0.5 font-bold">{matchTypeLabels[match.match_type] || match.match_type}</span>
          </div>
        ) : null;
      })()}
      <div className="flex items-center justify-center gap-6 py-3">
        <div className={`text-center px-4 py-2 ${isMatchFinalized && matchWinner === 'red' ? 'border-4 border-green-500 bg-green-50 shadow-lg' : ''}`}>
          {isMatchFinalized && matchWinner === 'red' && <span className="block text-xs font-bold text-green-600 mb-1">CÂȘTIGĂTOR</span>}
          <span className="text-3xl font-black text-red-600">{match.red_corner_full_name || 'TBD'}</span>
          {match.red_corner_club_name && <p className="text-sm text-gray-500 font-medium">({match.red_corner_club_name})</p>}
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-2xl font-black text-gray-300">vs</span>
          <button onClick={() => swapCorners(match.id)} disabled={busy || matchStarted}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-500 px-2 py-1 font-medium disabled:opacity-40 transition" title={matchStarted ? 'Nu se poate schimba după începerea meciului' : 'Inversează colțurile'}>
            ⇄ Swap
          </button>
        </div>
        <div className={`text-center px-4 py-2 ${isMatchFinalized && matchWinner === 'blue' ? 'border-4 border-green-500 bg-green-50 shadow-lg' : ''}`}>
          {isMatchFinalized && matchWinner === 'blue' && <span className="block text-xs font-bold text-green-600 mb-1">CÂȘTIGĂTOR</span>}
          <span className="text-3xl font-black text-blue-600">{match.blue_corner_full_name || 'TBD'}</span>
          {match.blue_corner_club_name && <p className="text-sm text-gray-500 font-medium">({match.blue_corner_club_name})</p>}
        </div>
      </div>

      {/* ── SCOREBOARD — no dot, no ROSU/ALBASTRU label ── */}
      <div className="grid grid-cols-2 gap-4">
        {/* RED corner */}
        <div className={` p-4 space-y-3 ${disqualifiedRed ? 'bg-gray-100 opacity-60' : 'bg-red-100'}`}>
          {disqualifiedRed && <span className="text-sm font-bold text-red-600 bg-red-100 px-3 py-1 ">DESCALIFICAT</span>}
          {/* Indicators: Abateri, Avertismente, Puncte */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-gray-600">Abateri:</span>
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <button key={i} disabled={busy || i >= currentInfractionsRed} onClick={() => removeLastEvent(match.id, 'infraction_red')}
                    className={`w-6 h-6  border-2 text-[10px] font-bold flex items-center justify-center transition cursor-pointer disabled:cursor-default ${
                      i < currentInfractionsRed ? 'border-yellow-500 bg-yellow-400 text-yellow-900 hover:bg-yellow-300 hover:border-yellow-400' : 'border-gray-300 bg-white text-gray-300'
                    }`}>{i + 1}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-gray-600">Avertismente:</span>
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <button key={i} disabled={busy || i >= warningsRed} onClick={() => removeLastEvent(match.id, 'warning_red')}
                    className={`w-6 h-6  border-2 text-[10px] font-bold flex items-center justify-center transition cursor-pointer disabled:cursor-default ${
                      i < warningsRed ? 'border-orange-500 bg-orange-400 text-white hover:bg-orange-300 hover:border-orange-400' : 'border-gray-300 bg-white text-gray-300'
                    }`}>{i + 1}</button>
                ))}
              </div>
              {warningsRed > 0 && <span className="text-xs text-red-500 font-medium">({warningPenaltyRed})</span>}
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-sm text-gray-600">Puncte:</span>
              <span className={`text-xl font-black tabular-nums ${adjustRed > 0 ? 'text-green-600' : adjustRed < 0 ? 'text-red-600' : 'text-gray-400'}`}>{adjustRed > 0 ? '+' : ''}{adjustRed}</span>
            </div>
          </div>
          {/* Point buttons: -2 -1 +1 +2 */}
          <div className="grid grid-cols-4 gap-2">
            <button onClick={() => addPenalty(match.id, 'red', activeRound?.id, -2)} disabled={busy || disqualifiedRed} className="text-base bg-white/80 text-red-700 px-3 py-2  font-black hover:bg-white disabled:opacity-40">-2</button>
            <button onClick={() => addPenalty(match.id, 'red', activeRound?.id, -1)} disabled={busy || disqualifiedRed} className="text-base bg-white/80 text-red-600 px-3 py-2  font-black hover:bg-white disabled:opacity-40">-1</button>
            <button onClick={() => addBonus(match.id, 'red', activeRound?.id, 1)} disabled={busy || disqualifiedRed} className="text-base bg-white/80 text-green-700 px-3 py-2  font-black hover:bg-white disabled:opacity-40">+1</button>
            <button onClick={() => addBonus(match.id, 'red', activeRound?.id, 2)} disabled={busy || disqualifiedRed} className="text-base bg-white/80 text-green-700 px-3 py-2  font-black hover:bg-white disabled:opacity-40">+2</button>
          </div>
          {/* Action buttons: +1 Abatere, +1 Avertisment */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => handleInfraction('red')} disabled={busy || disqualifiedRed} className="text-sm bg-white/80 text-gray-700 px-3 py-2  font-bold hover:bg-white disabled:opacity-40">+1 Abatere</button>
            <button onClick={() => { addWarning(match.id, 'red', activeRound?.id); if (warningsRed + 1 >= 3 && !disqualifiedRed) addDisqualification(match.id, 'red'); }} disabled={busy || disqualifiedRed} className="text-sm bg-white/80 text-gray-700 px-3 py-2  font-bold hover:bg-white disabled:opacity-40">+1 Avertisment</button>
          </div>
        </div>
        {/* BLUE corner */}
        <div className={` p-4 space-y-3 ${disqualifiedBlue ? 'bg-gray-100 opacity-60' : 'bg-blue-100'}`}>
          {disqualifiedBlue && <span className="text-sm font-bold text-red-600 bg-red-100 px-3 py-1 ">DESCALIFICAT</span>}
          {/* Indicators: Abateri, Avertismente, Puncte */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-gray-600">Abateri:</span>
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <button key={i} disabled={busy || i >= currentInfractionsBlue} onClick={() => removeLastEvent(match.id, 'infraction_blue')}
                    className={`w-6 h-6  border-2 text-[10px] font-bold flex items-center justify-center transition cursor-pointer disabled:cursor-default ${
                      i < currentInfractionsBlue ? 'border-yellow-500 bg-yellow-400 text-yellow-900 hover:bg-yellow-300 hover:border-yellow-400' : 'border-gray-300 bg-white text-gray-300'
                    }`}>{i + 1}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-gray-600">Avertismente:</span>
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <button key={i} disabled={busy || i >= warningsBlue} onClick={() => removeLastEvent(match.id, 'warning_blue')}
                    className={`w-6 h-6  border-2 text-[10px] font-bold flex items-center justify-center transition cursor-pointer disabled:cursor-default ${
                      i < warningsBlue ? 'border-orange-500 bg-orange-400 text-white hover:bg-orange-300 hover:border-orange-400' : 'border-gray-300 bg-white text-gray-300'
                    }`}>{i + 1}</button>
                ))}
              </div>
              {warningsBlue > 0 && <span className="text-xs text-red-500 font-medium">({warningPenaltyBlue})</span>}
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-sm text-gray-600">Puncte:</span>
              <span className={`text-xl font-black tabular-nums ${adjustBlue > 0 ? 'text-green-600' : adjustBlue < 0 ? 'text-red-600' : 'text-gray-400'}`}>{adjustBlue > 0 ? '+' : ''}{adjustBlue}</span>
            </div>
          </div>
          {/* Point buttons: -2 -1 +1 +2 */}
          <div className="grid grid-cols-4 gap-2">
            <button onClick={() => addPenalty(match.id, 'blue', activeRound?.id, -2)} disabled={busy || disqualifiedBlue} className="text-base bg-white/80 text-red-700 px-3 py-2  font-black hover:bg-white disabled:opacity-40">-2</button>
            <button onClick={() => addPenalty(match.id, 'blue', activeRound?.id, -1)} disabled={busy || disqualifiedBlue} className="text-base bg-white/80 text-red-600 px-3 py-2  font-black hover:bg-white disabled:opacity-40">-1</button>
            <button onClick={() => addBonus(match.id, 'blue', activeRound?.id, 1)} disabled={busy || disqualifiedBlue} className="text-base bg-white/80 text-green-700 px-3 py-2  font-black hover:bg-white disabled:opacity-40">+1</button>
            <button onClick={() => addBonus(match.id, 'blue', activeRound?.id, 2)} disabled={busy || disqualifiedBlue} className="text-base bg-white/80 text-green-700 px-3 py-2  font-black hover:bg-white disabled:opacity-40">+2</button>
          </div>
          {/* Action buttons: +1 Abatere, +1 Avertisment */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => handleInfraction('blue')} disabled={busy || disqualifiedBlue} className="text-sm bg-white/80 text-gray-700 px-3 py-2  font-bold hover:bg-white disabled:opacity-40">+1 Abatere</button>
            <button onClick={() => { addWarning(match.id, 'blue', activeRound?.id); if (warningsBlue + 1 >= 3 && !disqualifiedBlue) addDisqualification(match.id, 'blue'); }} disabled={busy || disqualifiedBlue} className="text-sm bg-white/80 text-gray-700 px-3 py-2  font-bold hover:bg-white disabled:opacity-40">+1 Avertisment</button>
          </div>
        </div>
      </div>

      {/* ── ROUNDS — responsive: horizontal on desktop, vertical on mobile/tablet ── */}
      <div className="space-y-3">
        <p className="text-sm font-bold text-gray-600 uppercase tracking-wide">Reprize</p>
        {matchRounds.length === 0 ? (
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm text-gray-500">Nu exista reprize.</span>
            <button onClick={() => createRounds(match.id, 3, 180)} disabled={busy} className="text-sm bg-blue-600 text-white px-5 py-2.5  font-semibold hover:bg-blue-700 disabled:opacity-40">+ 3 x 3min</button>
            <button onClick={() => createRounds(match.id, 2, 120)} disabled={busy} className="text-sm bg-blue-600 text-white px-5 py-2.5  font-semibold hover:bg-blue-700 disabled:opacity-40">+ 2 x 2min</button>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row items-stretch gap-0">
            {matchRounds.map((r, idx) => {
              const isActive = r.status === 'active';
              const isRoundPaused = r.is_paused;
              const isCompleted = r.status === 'completed';
              const showBreak = breakTimers[idx] && !isActive && idx < totalRounds - 1;
              const showBreakPlaceholder = !showBreak && isCompleted && idx < totalRounds - 1
                && matchRounds[idx + 1]?.status !== 'active' && matchRounds[idx + 1]?.status !== 'completed';

              return (
                <React.Fragment key={r.id}>
                  {/* Round card */}
                  <div className={`flex flex-col items-center md:flex-1 md:min-w-0 border border-gray-300 p-2`}>
                    {/* Step indicator circle */}
                    <div className={`w-auto px-3 h-10  flex items-center justify-center text-sm font-bold border-2 shrink-0 ${
                      isActive && isRoundPaused ? 'border-yellow-400 bg-yellow-100 text-yellow-800' :
                      isActive ? 'border-green-400 bg-green-500 text-white ring-4 ring-green-200' :
                      isCompleted ? 'border-green-400 bg-green-100 text-green-600' :
                      'border-gray-300 bg-white text-gray-400'
                    }`}>
                      REPRIZA {r.round_number}
                    </div>
                    {/* Round body — collapsed if completed */}
                    {isCompleted ? (
                      <div className="mt-1.5 w-full text-center">
                        <span className="text-[10px] text-green-500 font-medium">Finalizat</span>
                        <button onClick={() => setShowRoundResetConfirm(r.id)} disabled={busy} className="block mx-auto text-[10px] text-gray-400 hover:text-orange-500 mt-0.5">Reset</button>
                      </div>
                    ) : (
                      <div className={`mt-2 w-full  border px-3 py-2.5 space-y-2 ${
                        isActive && isRoundPaused ? 'border-yellow-300 bg-yellow-50' :
                        isActive ? 'border-green-300 bg-green-50' :
                        'border-gray-200 bg-white'
                      }`}>
                        {/* Timer / Status */}
                        <div className="flex items-center justify-center gap-2 min-h-[28px]">
                          {isActive && <LiveTimer round={r} onTimeUp={() => endRound(r.id)} />}
                          {!isActive && r.status === 'scheduled' && <span className="text-xs text-gray-400">{r.duration_seconds}s</span>}
                          {isActive && isRoundPaused && <span className="text-xs font-bold text-yellow-700 bg-yellow-200 px-2 py-0.5 animate-pulse">PAUZA</span>}
                        </div>
                        {r.extra_seconds !== 0 && (
                          <div className="text-center">
                            <span className={`text-xs font-medium px-2 py-0.5 ${r.extra_seconds > 0 ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'}`}>
                              {r.extra_seconds > 0 ? '+' : ''}{r.extra_seconds}s
                            </span>
                          </div>
                        )}
                        {/* Action buttons */}
                        <div className="flex flex-wrap gap-2 justify-center">
                          {r.status === 'scheduled' && (
                            <button onClick={() => { if (idx > 0 && breakTimers[idx - 1]) dismissBreak(idx - 1); startRound(r.id); }} disabled={busy || !!activeRound} className={`text-sm text-white px-5 py-2.5 font-semibold disabled:opacity-40 ${
                              idx > 0 && matchRounds[idx - 1]?.status === 'completed' && !breakTimers[idx - 1]
                                ? 'bg-green-600 hover:bg-green-700 ring-2 ring-green-300 animate-pulse'
                                : 'bg-green-600 hover:bg-green-700'
                            }`}>Start Repriza</button>
                          )}
                          {isActive && !isRoundPaused && (
                            <button onClick={() => pauseRound(match.id, r.id)} disabled={busy} className="text-sm bg-yellow-500 text-white px-5 py-2.5 font-semibold hover:bg-yellow-600 disabled:opacity-40">Pauza</button>
                          )}
                          {isActive && isRoundPaused && (
                            <button onClick={() => resumeRound(match.id, r.id)} disabled={busy} className="text-sm bg-green-600 text-white px-5 py-2.5 font-semibold hover:bg-green-700 disabled:opacity-40">Reluare</button>
                          )}
                          {isActive && (
                            <button onClick={() => setShowStopRoundConfirm(r.id)} disabled={busy} className="text-sm bg-red-600 text-white px-5 py-2.5 font-semibold hover:bg-red-700 disabled:opacity-40">Stop</button>
                          )}
                          <button onClick={() => setShowRoundResetConfirm(r.id)} disabled={busy} className="text-sm text-gray-400 hover:text-orange-600 disabled:opacity-40 px-3 py-2 hover:bg-orange-50 transition">Reset</button>
                        </div>
                        {/* Time adjust buttons */}
                        {isActive && (
                          <div className="flex items-center gap-2 justify-center border-t border-gray-200 pt-2">
                            <button onClick={() => adjustTime(match.id, r.id, -10)} disabled={busy} className="text-sm bg-gray-200 text-gray-600 px-3 py-1.5 hover:bg-gray-300 disabled:opacity-40">-10s</button>
                            <button onClick={() => adjustTime(match.id, r.id, 10)} disabled={busy} className="text-sm bg-gray-200 text-gray-600 px-3 py-1.5 hover:bg-gray-300 disabled:opacity-40">+10s</button>
                            <button onClick={() => adjustTime(match.id, r.id, 30)} disabled={busy} className="text-sm bg-gray-200 text-gray-600 px-3 py-1.5 hover:bg-gray-300 disabled:opacity-40">+30s</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Break timer BETWEEN rounds */}
                  {idx < totalRounds - 1 && (
                    (showBreak || (showBreakPlaceholder && !breakTimers[idx])) ? (
                      <div className="flex flex-col items-center md:flex-1 md:min-w-0 border border-gray-300 p-2">
                        {/* PAUZA indicator on top — matches round pill style */}
                        <div className="w-auto px-3 h-10 flex items-center justify-center text-sm font-bold border-2 border-orange-300 bg-orange-100 text-orange-700 shrink-0">
                          PAUZA
                        </div>
                        {/* Break timer body */}
                        {showBreak && (
                          <div className="mt-2 w-full">
                            <BreakTimer
                              onDone={() => dismissBreak(idx)}
                              busy={busy}
                              autoStart
                              endedAt={r.ended_at}
                              sessionId={session?.id}
                              nextRoundId={matchRounds[idx + 1]?.id}
                              startRound={startRound}
                            />
                          </div>
                        )}
                        {/* Break placeholder — start button */}
                        {showBreakPlaceholder && !breakTimers[idx] && (
                          <button onClick={() => setBreakTimers(prev => ({ ...prev, [idx]: true }))} className="mt-2 w-full flex items-center justify-center py-3 border border-dashed border-orange-300 bg-orange-50/50 hover:bg-orange-100 hover:border-orange-400 transition cursor-pointer">
                            <span className="text-sm text-orange-400 font-bold uppercase tracking-wider">Start Pauza</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col md:flex-row items-center justify-center py-2 md:py-0 md:pt-3 px-1" style={{ minWidth: '24px' }}>
                        <div className={`hidden md:block w-full h-0.5 mt-2 ${isCompleted ? 'bg-green-300' : 'bg-gray-200'}`} />
                        <div className={`md:hidden w-0.5 h-6 ${isCompleted ? 'bg-green-300' : 'bg-gray-200'}`} />
                      </div>
                    )
                  )}
                </React.Fragment>
              );
            })}

            {/* Decizia Arbitrilor step — visible after all rounds completed */}
            {allRoundsCompleted && (
            <>
            <div className="flex flex-col md:flex-row items-center justify-center py-2 md:py-0 md:pt-3 px-1" style={{ minWidth: '24px' }}>
              <div className="hidden md:block w-full h-0.5 mt-2 bg-purple-300" />
              <div className="md:hidden w-0.5 h-6 bg-purple-300" />
            </div>
            <div className="flex flex-col items-center md:flex-1 md:min-w-0 border border-gray-300 p-2">
              {/* DECIZIA ARBITRILOR indicator on top — matches round pill style */}
              <div className="w-auto px-3 h-10 flex items-center justify-center text-sm font-bold border-2 border-purple-300 bg-purple-100 text-purple-700 shrink-0">
                DECIZIA ARBITRILOR
              </div>
              <div className="mt-2 w-full border border-gray-200 bg-white px-3 py-3 space-y-3">
                <span className="block text-xs text-gray-400 text-center">
                  {matchRefScores.filter(s => s.winner_choice && s.round == null).length}/{matchReferees.length || 5} decizii
                </span>
                {/* Big A1-A5 boxes */}
                <div className="flex gap-2 justify-center">
                  {(matchReferees.length > 0 ? matchReferees : [1,2,3,4,5].map(i => ({ pos: i, id: null, name: `A${i}` }))).map((ref) => {
                    const choice = matchRefScores.filter(s => s.referee === ref.id && s.round == null).find(s => s.winner_choice)?.winner_choice;
                    return (
                      <button key={ref.pos} disabled={busy || !ref.id}
                        onClick={() => {
                          if (!ref.id) return;
                          if (choice) {
                            setDecision(match.id, ref.id, choice);
                          } else {
                            setRefModalData({ ref, matchId: match.id });
                          }
                        }}
                        className={`w-14 h-16 flex flex-col items-center justify-center text-sm font-black cursor-pointer transition hover:opacity-80 disabled:cursor-default border-2 ${
                        choice === 'red' ? 'bg-red-500 text-white border-red-400' :
                        choice === 'blue' ? 'bg-blue-500 text-white border-blue-400' :
                        'bg-gray-200 text-gray-500 border-gray-300 hover:bg-gray-300'
                      }`} title={`${ref.name}: click to set/view decision`}>
                        <span className="text-lg font-black">A{ref.pos}</span>
                        <span className="text-[9px] mt-0.5">{choice === 'red' ? 'ROȘU' : choice === 'blue' ? 'ALB' : '—'}</span>
                      </button>
                    );
                  })}
                </div>
                {/* Afișează / Ascunde câștigătorul */}
                <div className="flex justify-center">
                  {allRoundsCompleted && session?.status !== 'winner_revealed' && (
                    <button onClick={() => {
                      const submitted = matchRefScores.filter(s => s.winner_choice && s.round == null).length;
                      const total = matchReferees.length || 5;
                      if (submitted < total) {
                        setShowWinnerConfirm(true);
                      } else {
                        revealWinner();
                      }
                    }} disabled={busy}
                      className="text-base bg-yellow-500 hover:bg-yellow-600 text-black px-8 py-3 font-bold shadow-sm disabled:opacity-40 transition whitespace-nowrap">
                      🏆 Afișează câștigătorul
                    </button>
                  )}
                  {session?.status === 'winner_revealed' && (
                    <button onClick={() => { if (session) switchDisplay(session.current_category, session.current_match, session.current_athlete, 'displaying'); }} disabled={busy}
                      className="text-base bg-gray-500 hover:bg-gray-600 text-white px-8 py-3 font-bold shadow-sm disabled:opacity-40 transition whitespace-nowrap">
                      ← Ascunde câștigătorul
                    </button>
                  )}
                </div>
              </div>
            </div>
            </>
            )}
          </div>
        )}
      </div>

      {/* ── REFEREE LIVE SCORES TABLE — full width, centralizator style ── */}
      {matchRounds.length > 0 && (
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="text-left px-4 py-3 text-sm font-bold text-gray-700 border border-gray-300 w-40">Arbitru</th>
                {matchRounds.map((r, rIdx) => (
                  <th key={r.id} colSpan={2} className={`text-center px-2 py-3 text-sm font-bold text-gray-700 border border-gray-300 ${rIdx > 0 ? 'border-l-[3px] border-l-gray-500' : ''}`}>
                    R{r.round_number}
                  </th>
                ))}
                <th colSpan={2} className="text-center px-2 py-3 text-sm font-bold text-gray-700 border border-gray-300 border-l-[3px] border-l-gray-500 bg-gray-200">TOTAL</th>
                {allRefereesDecided && <th className="text-center px-2 py-3 text-sm font-bold text-gray-700 border border-gray-300">Decizie</th>}
              </tr>
            </thead>
            <tbody>
              {(matchReferees.length > 0 ? matchReferees : [1,2,3,4,5].map(i => ({ pos: i, id: null, name: `Arbitru ${i}` }))).map((ref, refIdx) => {
                const refScoresForRef = matchRefScores.filter(s => s.referee === ref.id);
                const winnerChoice = refScoresForRef.find(s => s.winner_choice && s.round == null)?.winner_choice;
                return (
                  <tr key={ref.pos} className={`${refIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-yellow-50/50 transition`}>
                    <td className="px-4 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 truncate max-w-[160px]"><span className="font-bold text-purple-600 mr-1">A{ref.pos}</span> {ref.name}</td>
                    {matchRounds.map((r, rIdx) => {
                      const roundScore = refScoresForRef.find(s => s.round === r.id);
                      const redScore = roundScore?.red_corner_score != null ? Number(roundScore.red_corner_score) : null;
                      const blueScore = roundScore?.blue_corner_score != null ? Number(roundScore.blue_corner_score) : null;
                      return (
                        <React.Fragment key={r.id}>
                          <td className={`text-center px-2 py-2.5 text-sm font-bold tabular-nums border border-gray-300 ${rIdx > 0 ? 'border-l-[3px] border-l-gray-500' : ''}`}>
                            {redScore != null ? <span className="text-red-600">{redScore}</span> : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="text-center px-2 py-2.5 text-sm font-bold tabular-nums border border-gray-300">
                            {blueScore != null ? <span className="text-blue-600">{blueScore}</span> : <span className="text-gray-300">-</span>}
                          </td>
                        </React.Fragment>
                      );
                    })}
                    {(() => {
                      const roundScoresForRef = refScoresForRef.filter(s => s.round != null);
                      const refRedTotal = roundScoresForRef.reduce((sum, s) => sum + Number(s.red_corner_score || 0), 0);
                      const refBlueTotal = roundScoresForRef.reduce((sum, s) => sum + Number(s.blue_corner_score || 0), 0);
                      const refGrandRed = refRedTotal + adjustRed;
                      const refGrandBlue = refBlueTotal + adjustBlue;
                      const hasScores = roundScoresForRef.length > 0;
                      return (
                        <>
                          <td className="text-center px-2 py-2.5 text-sm font-bold tabular-nums border border-gray-300 border-l-[3px] border-l-gray-500 bg-gray-50">
                            {hasScores ? <span className="text-red-700">{refGrandRed} {adjustRed !== 0 && <span className={`text-xs font-medium ${adjustRed > 0 ? 'text-green-600' : 'text-red-500'}`}>({adjustRed > 0 ? '+' : ''}{adjustRed})</span>}</span> : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="text-center px-2 py-2.5 text-sm font-bold tabular-nums border border-gray-300 bg-gray-50">
                            {hasScores ? <span className="text-blue-700">{refGrandBlue} {adjustBlue !== 0 && <span className={`text-xs font-medium ${adjustBlue > 0 ? 'text-green-600' : 'text-red-500'}`}>({adjustBlue > 0 ? '+' : ''}{adjustBlue})</span>}</span> : <span className="text-gray-300">-</span>}
                          </td>
                        </>
                      );
                    })()}
                    {allRefereesDecided && (
                    <td className="text-center px-2 py-2.5 border border-gray-300">
                      {winnerChoice === 'red' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-white bg-red-500 px-2.5 py-1 ">Rosu</span>
                      ) : winnerChoice === 'blue' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-white bg-blue-500 px-2.5 py-1 ">Albastru</span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* Winner summary + Finalize */}
          {allRoundsCompleted && !isMatchFinalized && (
            <div className="mt-3 text-center">
              <button onClick={() => finalizeMatch(match.id)} disabled={busy}
                className="text-base bg-green-600 hover:bg-green-700 text-white px-8 py-3  font-bold shadow-sm disabled:opacity-40 transition">
                Finalizeaza meciul
              </button>
            </div>
          )}

        </div>
      )}

      {/* EVENT LOG — always visible, scrollable, 10-row default height */}
      <div className="space-y-2">
        <p className="text-sm font-bold text-gray-500 uppercase">Evenimente ({matchEvents.length})</p>
        <div className="overflow-y-auto border border-gray-300 " style={{ height: '320px' }}>
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-100">
                <th className="text-left px-3 py-2 text-xs font-bold text-gray-600 border-b border-gray-300">Ora</th>
                <th className="text-left px-3 py-2 text-xs font-bold text-gray-600 border-b border-gray-300">Eveniment</th>
                <th className="text-center px-3 py-2 text-xs font-bold text-gray-600 border-b border-gray-300">Valoare</th>
                <th className="text-center px-3 py-2 text-xs font-bold text-gray-600 border-b border-gray-300">Repriza</th>
              </tr>
            </thead>
            <tbody>
              {matchEvents.length === 0 ? (
                <tr><td colSpan="4" className="text-center px-3 py-6 text-sm text-gray-400 italic">Niciun eveniment înregistrat</td></tr>
              ) : (
                [...matchEvents].reverse().slice(0, 50).map((ev, evIdx) => {
                  const typeLabels = {
                    warning_red: 'Avertisment Rosu',
                    warning_blue: 'Avertisment Albastru',
                    penalty_red: 'Penalizare Rosu',
                    penalty_blue: 'Penalizare Albastru',
                    bonus_red: 'Bonus Rosu',
                    bonus_blue: 'Bonus Albastru',
                    infraction_red: 'Abatere Rosu',
                    infraction_blue: 'Abatere Albastru',
                    disqualify_red: 'DESCALIFICARE Rosu',
                    disqualify_blue: 'DESCALIFICARE Albastru',
                    pause: 'Pauza',
                    resume: 'Reluare',
                    time_add: 'Timp adaugat',
                    time_remove: 'Timp scazut',
                  };
                  const time = ev.created_at ? new Date(ev.created_at).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
                  const isRedEvent = ev.event_type.includes('red');
                  const isBlueEvent = ev.event_type.includes('blue');
                  const isBonus = ev.event_type.startsWith('bonus');
                  const roundNum = ev.round ? matchRounds.find(r => r.id === ev.round)?.round_number : null;
                  const valueStr = ev.value ? (ev.event_type.startsWith('time') ? `${ev.value > 0 ? '+' : ''}${ev.value}s` : `${ev.value > 0 ? '+' : ''}${ev.value}p`) : '—';
                  return (
                    <tr key={ev.id} className={evIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-1.5 text-xs text-gray-400 tabular-nums border border-gray-300 whitespace-nowrap">{time}</td>
                      <td className="px-3 py-1.5 border border-gray-300">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2  shrink-0 ${isRedEvent ? 'bg-red-500' : isBlueEvent ? 'bg-blue-500' : 'bg-gray-400'}`} />
                          <span className={`text-sm font-medium ${isBonus ? 'text-green-600' : isRedEvent ? 'text-red-600' : isBlueEvent ? 'text-blue-600' : 'text-gray-600'}`}>
                            {typeLabels[ev.event_type] || ev.event_type_display || ev.event_type}
                          </span>
                        </div>
                      </td>
                      <td className="text-center px-3 py-1.5 text-sm font-bold tabular-nums border border-gray-300">
                        <span className={isBonus ? 'text-green-600' : ev.value < 0 ? 'text-red-600' : 'text-gray-500'}>{valueStr}</span>
                      </td>
                      <td className="text-center px-3 py-1.5 text-xs text-gray-500 border border-gray-300">{roundNum ? `R${roundNum}` : '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* Live Timer (fullscreen version) */
function LiveTimer({ round, onTimeUp }) {
  const [timeLeft, setTimeLeft] = useState(null);
  const firedRef = useRef(false);
  useEffect(() => {
    firedRef.current = false;
  }, [round?.id]);
  useEffect(() => {
    if (!round || round.status !== 'active' || !round.started_at) { setTimeLeft(null); return; }
    const duration = (round.duration_seconds || 180) + (round.extra_seconds || 0);
    const started = new Date(round.started_at).getTime();
    const pauseAcc = (round.accumulated_pause_seconds || 0) * 1000;
    const tick = () => {
      let left;
      if (round.is_paused && round.paused_at) {
        const pausedTime = new Date(round.paused_at).getTime();
        const elapsed = Math.floor((pausedTime - started - pauseAcc) / 1000);
        left = Math.max(0, duration - elapsed);
      } else {
        const elapsed = Math.floor((Date.now() - started - pauseAcc) / 1000);
        left = Math.max(0, duration - elapsed);
      }
      setTimeLeft(left);
      if (left === 0 && !firedRef.current && onTimeUp) {
        firedRef.current = true;
        onTimeUp();
      }
    };
    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [round, round?.started_at, round?.is_paused, round?.paused_at, round?.accumulated_pause_seconds, round?.extra_seconds, onTimeUp]);
  if (timeLeft == null) return null;
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const isLow = timeLeft <= 10;
  return (
    <span className={`text-3xl font-black tabular-nums ${
      round.is_paused ? 'text-yellow-700' : isLow ? 'text-red-600 animate-pulse' : 'text-green-700'
    }`}>
      {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
    </span>
  );
}

/* ── Break Timer (fullscreen version, synced with public display via session) ── */
function BreakTimer({ onDone, busy, duration = 60, autoStart = false, endedAt, sessionId, nextRoundId, startRound }) {
  // Compute initial seconds from ended_at if available (synced with public display)
  const computeFromEndedAt = useCallback(() => {
    if (!endedAt) return duration;
    const elapsed = (Date.now() - new Date(endedAt).getTime()) / 1000;
    return Math.max(0, Math.ceil(duration - elapsed));
  }, [endedAt, duration]);

  const [secondsLeft, setSecondsLeft] = useState(() => endedAt ? computeFromEndedAt() : duration);
  const [running, setRunning] = useState(autoStart);
  const syncedRef = useRef(false);

  // Sync break_end_time to session on initial start
  useEffect(() => {
    if (autoStart && endedAt && sessionId && !syncedRef.current) {
      syncedRef.current = true;
      const breakEnd = new Date(new Date(endedAt).getTime() + duration * 1000).toISOString();
      monitorAPI.sessions.update(sessionId, { break_end_time: breakEnd, break_paused: false, break_paused_remaining: 0 }).catch(() => {});
    }
  }, [autoStart, endedAt, sessionId, duration]);

  // Re-sync when endedAt changes
  useEffect(() => {
    if (endedAt) setSecondsLeft(computeFromEndedAt());
  }, [endedAt, computeFromEndedAt]);

  useEffect(() => {
    if (!running || secondsLeft <= 0) return;
    if (endedAt) {
      const id = setInterval(() => setSecondsLeft(computeFromEndedAt()), 1000);
      return () => clearInterval(id);
    }
    const id = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [running, secondsLeft, endedAt, computeFromEndedAt]);

  const isFinished = secondsLeft === 0;
  useEffect(() => {
    if (isFinished) {
      if (sessionId) monitorAPI.sessions.update(sessionId, { break_end_time: null, break_paused: false, break_paused_remaining: 0 }).catch(() => {});
      if (onDone) onDone();
    }
  }, [isFinished, onDone, sessionId]);

  const syncToSession = (updates) => {
    if (sessionId) monitorAPI.sessions.update(sessionId, updates).catch(() => {});
  };

  const handleToggle = () => {
    if (running) {
      // Pause
      setRunning(false);
      syncToSession({ break_paused: true, break_paused_remaining: secondsLeft, break_end_time: null });
    } else {
      // Resume
      setRunning(true);
      const newEnd = new Date(Date.now() + secondsLeft * 1000).toISOString();
      syncToSession({ break_end_time: newEnd, break_paused: false, break_paused_remaining: 0 });
    }
  };

  const handleSkip = () => {
    setSecondsLeft(0);
    setRunning(false);
    syncToSession({ break_end_time: null, break_paused: false, break_paused_remaining: 0 });
    if (onDone) onDone();
    // Auto-start next round
    if (nextRoundId && startRound) startRound(nextRoundId);
  };

  const adjust = (delta) => {
    const newVal = Math.max(0, secondsLeft + delta);
    setSecondsLeft(newVal);
    if (running) {
      const newEnd = new Date(Date.now() + newVal * 1000).toISOString();
      syncToSession({ break_end_time: newEnd });
    } else {
      syncToSession({ break_paused_remaining: newVal });
    }
  };

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  return (
    <div className={`flex flex-col items-center gap-2 py-3 px-3 border ${
      isFinished ? 'border-green-300 bg-green-50' : 'border-orange-200 bg-orange-50'
    }`}>
      <span className={`text-2xl font-black tabular-nums ${
        isFinished ? 'text-green-600' : secondsLeft <= 5 ? 'text-red-600 animate-pulse' : 'text-orange-700'
      }`}>
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </span>
      <div className="flex flex-wrap items-center gap-2 justify-center">
        <button onClick={handleToggle} className={`text-sm px-5 py-2.5 font-semibold border ${running ? 'bg-orange-100 text-orange-700 border-orange-300' : 'bg-green-100 text-green-700 border-green-300'}`}>
          {running ? 'Pauza' : 'Start'}
        </button>
        <button onClick={handleSkip} className="text-sm px-5 py-2.5 font-bold bg-purple-100 text-purple-700 border border-purple-300 hover:bg-purple-200">SKIP</button>
        <button onClick={() => adjust(-10)} className="text-sm bg-gray-200 text-gray-700 px-3 py-1.5 hover:bg-gray-300">-10s</button>
        <button onClick={() => adjust(10)} className="text-sm bg-gray-200 text-gray-700 px-3 py-1.5 hover:bg-gray-300">+10s</button>
      </div>
    </div>
  );
}
