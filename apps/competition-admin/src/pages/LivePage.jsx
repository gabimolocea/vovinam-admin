import React, { useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CentralizatorContext } from './CategoriesLayout';
import {
  fieldAPI, monitorAPI, roundAPI, matchAPI, scoreAPI,
  matchRefereeScoreAPI, matchFieldAssignmentAPI, refereeAPI,
  categoryRefereeAssignmentAPI, matchEventAPI, fieldBreakAPI,
  matchRefereeAssignmentAPI,
} from '@shared/lib/api';

/* ═══════════════════════════════════════════════════════
   LIVE PAGE — Competition Management during the event
   ═══════════════════════════════════════════════════════ */

const PUBLIC_DISPLAY_PORT = 5177;

const STATUS_CFG = {
  not_started:  { label: 'Neînceput',      dot: 'bg-gray-400',  bg: 'bg-gray-50',  border: 'border-gray-200', badge: 'bg-gray-100 text-gray-600' },
  in_progress:  { label: 'În desfășurare', dot: 'bg-green-500 animate-pulse', bg: 'bg-green-50', border: 'border-green-300', badge: 'bg-green-100 text-green-700' },
  completed:    { label: 'Finalizat',      dot: 'bg-blue-500',  bg: 'bg-blue-50',  border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
};

export default function LivePage() {
  const ctx = useContext(CentralizatorContext);
  const { eventId, groups, columnStructure } = ctx || {};
  const navigate = useNavigate();
  const { id: routeEventId } = useParams();

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
  const [fieldBreaks, setFieldBreaks] = useState([]);
  const [matchRefAssignments, setMatchRefAssignments] = useState([]);
  const [viewMode, setViewMode] = useState('all');
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);

  // Collect all categories from context
  const allCats = (() => {
    if (!columnStructure) return [];
    const seen = new Set();
    const result = [];
    for (const col of columnStructure) {
      for (const cat of col.cats) {
        if (seen.has(cat.id)) continue;
        seen.add(cat.id);
        const group = groups.find(g => g.id === cat.group);
        result.push({ ...cat, groupName: group?.name || '' });
      }
    }
    return result;
  })();

  const fetchData = useCallback(async () => {
    if (!eventId) return;
    try {
      const [fR, sR, caR, maR, mR, rR, rsR, mrsR, asR, raR, meR, fbR, mraR] = await Promise.all([
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
        fieldBreakAPI.list({ event_id: eventId }),
        matchRefereeAssignmentAPI.list({ event_id: eventId }),
      ]);
      const arr = r => r.data?.results || r.data || [];
      setFields(arr(fR).sort((a, b) => (a.field_number ?? a.id) - (b.field_number ?? b.id)));
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
      setFieldBreaks(arr(fbR));
      setMatchRefAssignments(arr(mraR));
    } catch (err) {
      console.error('Live data fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchData();
    pollRef.current = setInterval(fetchData, 3000);
    return () => clearInterval(pollRef.current);
  }, [fetchData]);

  if (!ctx) return null;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-400 text-sm">
        Se încarcă datele live...
      </div>
    );
  }

  if (fields.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 p-4 text-center text-sm text-gray-500">
                Nu exista tatami-uri configurate. Mergi la tab-ul Programare.
      </div>
    );
  }

  const getFieldData = (field) => {
    const session = sessions.find(s => s.field === field.id);
    const fieldCatAss = catAssignments
      .filter(a => a.field === field.id)
      .sort((a, b) => a.order - b.order);
    const fieldMatchAss = matchAssignments
      .filter(a => a.field === field.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const fieldCats = fieldCatAss
      .map(a => {
        const cat = allCats.find(c => c.id === a.category);
        return cat ? { ...cat, _assignment: a } : null;
      })
      .filter(Boolean);
    const fieldMatches = fieldMatchAss
      .map(a => {
        const m = matches.find(mm => mm.id === a.match);
        return m ? { ...m, _assignment: a } : null;
      })
      .filter(Boolean);
    return { session, fieldCats, fieldMatches };
  };

  const displayedFields = viewMode === 'all' ? fields : fields.filter(f => f.id === viewMode);

  const isSingle = viewMode !== 'all';

  return (
    <div className={`flex-1 overflow-auto bg-gray-100 ${isSingle ? 'flex flex-col p-2' : 'p-3'}`}>
      {/* ═══ VIEW MODE TOOLBAR ═══ */}
      <div className="flex items-center gap-2 mb-2 bg-white rounded-lg border border-gray-200 px-3 py-2 shadow-sm overflow-x-auto shrink-0">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mr-1 shrink-0">Vizualizare:</span>
        <button
          onClick={() => setViewMode('all')}
          className={`text-sm px-4 py-2 rounded-lg font-medium transition shrink-0 ${
            viewMode === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
                    Toate Tatami
        </button>
        {fields.map(f => {
          const fSession = sessions.find(s => s.field === f.id);
          const isActive = fSession && (fSession.current_category || fSession.current_match);
          return (
            <button
              key={f.id}
              onClick={() => setViewMode(f.id)}
              className={`text-sm px-4 py-2 rounded-lg font-medium transition shrink-0 ${
                viewMode === f.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : isActive
                    ? 'bg-green-100 text-green-700 hover:bg-green-200 ring-1 ring-green-300'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {isActive && <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1.5 animate-pulse" />}
              {f.name}
            </button>
          );
        })}
      </div>

      {/* ═══ FIELD PANELS ═══ */}
      <div className={isSingle ? 'flex-1 min-h-0 flex flex-col' : 'grid grid-cols-1 lg:grid-cols-2 gap-3'}>
        {displayedFields.map(field => {
          const { session, fieldCats, fieldMatches } = getFieldData(field);
          return (
            <FieldPanel
              key={field.id}
              field={field}
              session={session}
              fieldCats={fieldCats}
              fieldMatches={fieldMatches}
              allCats={allCats}
              matches={matches}
              rounds={rounds}
              refScores={refScores}
              matchRefScores={matchRefScores}
              athleteScores={athleteScores}
              refAssignments={refAssignments}
              matchEvents={matchEvents}
              fieldBreaks={fieldBreaks.filter(b => b.field === field.id)}
              matchRefAssignments={matchRefAssignments}
              catAssignments={catAssignments}
              matchAssignments={matchAssignments}
              onRefresh={fetchData}
              singleView={isSingle}
              navigate={navigate}
              eventId={routeEventId}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   FIELD PANEL — tatami panel: active item + schedule
   Left side: active category/match. Right side: programa.
   ═══════════════════════════════════════════════════════ */
function FieldPanel({
  field, session, fieldCats, fieldMatches, allCats, matches, rounds,
  refScores, matchRefScores, athleteScores, refAssignments, matchEvents,
  fieldBreaks, matchRefAssignments, catAssignments, matchAssignments, onRefresh, singleView,
  navigate, eventId,
}) {
  const [busy, setBusy] = useState(false);
  const dragItemRef = useRef(null);
  const [dropIndicator, setDropIndicator] = useState(null); // null | 'category' | 'match'

  const isIdle = !session || session.status === 'idle';
  const currentCat = fieldCats.find(c => c.id === session?.current_category);
  const currentMatch = fieldMatches.find(m => m.id === session?.current_match)
                    || matches.find(m => m.id === session?.current_match);

  // ── API helpers ──
  const wrap = fn => async (...a) => {
    setBusy(true);
    try { await fn(...a); onRefresh(); } catch(e) { console.error(e); }
    setBusy(false);
  };

  const switchDisplay = wrap(async (catId, matchId, athleteId, status = 'displaying') => {
    const data = { current_category: catId || null, current_match: matchId || null, current_athlete: athleteId || null, status };
    if (session) await monitorAPI.sessions.update(session.id, data);
    else await monitorAPI.sessions.create({ field: field.id, ...data });
  });

  const setIdle = () => switchDisplay(null, null, null, 'idle');

  const updateAssignmentStatus = wrap(async (assignmentId, newStatus) => {
    await fieldAPI.assignments.update(assignmentId, { status: newStatus });
  });

  const revealScores = () => {
    if (session) switchDisplay(session.current_category, session.current_match, session.current_athlete, 'scores_revealed');
  };

  // Round controls
  const startRound  = wrap(async id => { await roundAPI.update(id, { status: 'active', started_at: new Date().toISOString() }); });
  const endRound    = wrap(async id => { await roundAPI.update(id, { status: 'completed', ended_at: new Date().toISOString() }); });
  const resetRound  = wrap(async id => { await roundAPI.update(id, { status: 'scheduled', started_at: null, ended_at: null, paused_at: null, accumulated_pause_seconds: 0, extra_seconds: 0 }); });
  const createRounds = wrap(async (matchId, n = 3, dur = 180) => {
    for (let i = 1; i <= n; i++) await roundAPI.create({ match: matchId, round_number: i, duration_seconds: dur });
  });

  // Match event controls (pause, resume, warnings, penalties, time)
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

  const resetMatch = wrap(async (matchId) => {
    const mrs = currentMatch ? rounds.filter(r => r.match === currentMatch.id) : [];
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

  const goFullscreen = (panelType) => {
    navigate(`/competitions/${eventId}/live-fullscreen?field=${field.id}&panel=${panelType}`);
  };

  // Match rounds
  const matchRounds = currentMatch
    ? rounds.filter(r => r.match === currentMatch.id).sort((a, b) => a.round_number - b.round_number)
    : [];
  const activeRound = matchRounds.find(r => r.status === 'active');

  // Public display URL
  const displayUrl = `http://localhost:${PUBLIC_DISPLAY_PORT}/display/${field.id}`;

  // Build sorted schedule items (categories + matches + breaks)
  const scheduleItems = (() => {
    const catItems = (catAssignments || [])
      .filter(a => a.field === field.id)
      .map(a => {
        const cat = allCats.find(c => c.id === a.category);
        return cat ? { type: 'category', id: a.category, assignmentId: a.id, data: cat, order: a.order, status: a.status || 'not_started' } : null;
      })
      .filter(Boolean);
    const matchItems = (matchAssignments || [])
      .filter(a => a.field === field.id)
      .map(a => {
        const m = matches.find(mm => mm.id === a.match);
        return m ? { type: 'match', id: a.match, assignmentId: a.id, data: m, order: a.order, status: a.status || 'not_started' } : null;
      })
      .filter(Boolean);
    const breakItems = (fieldBreaks || [])
      .map(b => ({ type: 'break', id: b.id, assignmentId: null, data: b, order: b.order, status: 'break' }));
    return [...catItems, ...matchItems, ...breakItems].sort((a, b) => a.order - b.order);
  })();

  const matchTypeLabels = { 'qualifications': 'Calificări', 'quarter-finals': 'Sferturi', 'semi-finals': 'Semi-finală', 'finals': 'Finală', 'bronze': 'Bronz' };
  const genderLabels = { 'male': 'Masculin', 'female': 'Feminin', 'mixt': 'Mixt' };

  // Find the next item to play (first not_started after active, or first not_started overall)
  const nextItemIndex = (() => {
    const activeIdx = scheduleItems.findIndex(i =>
      (i.type === 'category' && session?.current_category === i.id && !session?.current_match)
      || (i.type === 'match' && session?.current_match === i.id)
    );
    for (let idx = Math.max(0, activeIdx + 1); idx < scheduleItems.length; idx++) {
      if (scheduleItems[idx].status === 'not_started' && scheduleItems[idx].type !== 'break') return idx;
    }
    if (activeIdx === -1) {
      for (let idx = 0; idx < scheduleItems.length; idx++) {
        if (scheduleItems[idx].status === 'not_started' && scheduleItems[idx].type !== 'break') return idx;
      }
    }
    return -1;
  })();

  // ── Match assignment status update ──
  const updateMatchAssignmentStatus = wrap(async (assignmentId, newStatus) => {
    await matchFieldAssignmentAPI.update(assignmentId, { status: newStatus });
  });

  // ── Drag & Drop reorder within schedule ──
  const handleDragStart = (e, item) => {
    dragItemRef.current = item;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${item.type}:${item.id}`);
    requestAnimationFrame(() => {
      e.target.style.opacity = '0.4';
    });
  };
  const handleDragEnd = (e) => {
    dragItemRef.current = null;
    setDropIndicator(null);
    e.target.style.opacity = '';
  };
  const handleItemDragOver = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const dropIndex = e.clientY < midY ? index : index + 1;
    setDropIndicator(prev => prev === dropIndex ? prev : dropIndex);
  };
  const handleDrop = async (e) => {
    e.preventDefault();
    const item = dragItemRef.current;
    const targetIndex = dropIndicator;
    dragItemRef.current = null;
    setDropIndicator(null);
    if (!item || targetIndex == null) return;
    const currentIndex = scheduleItems.findIndex(i => i.type === item.type && i.id === item.id);
    if (currentIndex === -1 || currentIndex === targetIndex || currentIndex === targetIndex - 1) return;

    const newItems = [...scheduleItems];
    const [removed] = newItems.splice(currentIndex, 1);
    const adj = targetIndex > currentIndex ? targetIndex - 1 : targetIndex;
    newItems.splice(adj, 0, removed);

    // Build updates grouped by type
    const catUpdates = [], matchUpdates = [], breakUpdates = [];
    newItems.forEach((it, idx) => {
      if (it.type === 'category') catUpdates.push({ id: it.assignmentId, field: field.id, order: idx });
      else if (it.type === 'match') matchUpdates.push({ id: it.assignmentId, field: field.id, order: idx });
      else if (it.type === 'break') breakUpdates.push({ id: it.id, order: idx });
    });
    try {
      const promises = [];
      if (catUpdates.length) promises.push(fieldAPI.assignments.bulkReorder(catUpdates));
      if (matchUpdates.length) promises.push(matchFieldAssignmentAPI.bulkReorder(matchUpdates));
      if (breakUpdates.length) promises.push(fieldBreakAPI.bulkReorder(breakUpdates));
      await Promise.all(promises);
      onRefresh();
    } catch (err) { console.error('Reorder failed:', err); }
  };

  return (
    <div className={`rounded-xl border border-gray-300 bg-white shadow-sm overflow-hidden ${singleView ? 'flex-1 flex flex-col min-h-0' : ''}`}>
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between bg-gray-800 text-white px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold">{field.name}</span>
          <span className={`h-3 w-3 rounded-full ${isIdle ? 'bg-gray-500' : 'bg-green-500 animate-pulse'}`} />
          <span className="text-xs text-gray-400 uppercase tracking-wider">
            {isIdle ? 'Inactiv' : session?.status === 'scores_revealed' ? 'Scoruri afișate' : 'În desfășurare'}
          </span>
        </div>
        <a href={displayUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-medium transition">
                    Public Display
        </a>
      </div>

      {/* ═══ BODY: Active Panel (left) + Schedule (right) ═══ */}
      <div className={`flex ${singleView ? 'flex-1 min-h-0 overflow-hidden' : ''}`}>
        {/* ── LEFT: Active Item Panel ── */}
        <div className={`flex-1 min-w-0 p-4 ${singleView ? 'overflow-y-auto' : ''}`}>
          {currentCat && currentCat.type !== 'fight' ? (
            <ActiveCategoryPanel
              cat={currentCat}
              session={session}
              refAssignment={refAssignments.find(ra => ra.category === currentCat.id)}
              athleteScores={athleteScores.filter(as => as.category === currentCat.id)}
              refScores={refScores}
              busy={busy}
              switchDisplay={switchDisplay}
              setIdle={setIdle}
              revealScores={revealScores}
              onExpand={() => goFullscreen('category')}
            />
          ) : currentMatch ? (
            <ActiveMatchPanel
              match={currentMatch}
              session={session}
              matchRounds={matchRounds}
              activeRound={activeRound}
              matchRefScores={matchRefScores.filter(s => s.match === currentMatch.id)}
              matchEvents={matchEvents.filter(e => e.match === currentMatch.id)}
              matchRefAssignment={matchRefAssignments.find(a => a.match === currentMatch.id)}
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
              adjustTime={adjustTime}
              resetMatch={resetMatch}
              onExpand={() => goFullscreen('match')}
            />
          ) : (
            <div className="flex items-center justify-center h-40 text-gray-400 text-base italic">
              <div className="text-center">
                <span className="text-4xl block mb-2">&mdash;</span>
                Nicio proba in desfasurare.<br/>
                <span className="text-xs">Selecteaza o proba din programa</span>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Schedule / Programa ── */}
        <div className={`${singleView ? 'w-80' : 'w-72'} shrink-0 border-l border-gray-200 bg-gray-50 overflow-y-auto`} style={singleView ? {} : { maxHeight: 500 }}
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
          onDrop={handleDrop}
          onDragLeave={() => setDropIndicator(null)}
        >
          <div className="px-3 py-2.5 bg-gray-100 border-b border-gray-200 sticky top-0 z-10">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Programa ({scheduleItems.length})</p>
          </div>
          <div className="p-2 space-y-1">
            {scheduleItems.length === 0 && (
              <p className="text-xs text-gray-400 italic text-center py-4">Nicio probă alocată.<br/>Mergi la Programare.</p>
            )}
            {scheduleItems.map((item, idx) => {
              const isActiveItem = (item.type === 'category' && session?.current_category === item.id && !session?.current_match)
                || (item.type === 'match' && session?.current_match === item.id);
              const st = STATUS_CFG[item.status] || STATUS_CFG.not_started;

              return (
                <React.Fragment key={`${item.type}-${item.id}`}>
                  {/* Drop indicator line */}
                  {dropIndicator === idx && (
                    <div className="h-0.5 bg-indigo-500 rounded-full mx-1 my-0.5" />
                  )}

                  {item.type === 'break' ? (
                    /* ─── Break item ─── */
                    <div className="flex items-center gap-2 rounded px-2.5 py-1.5 bg-orange-50 border border-orange-200 text-xs text-orange-700 cursor-grab"
                      draggable onDragStart={e => handleDragStart(e, item)} onDragEnd={handleDragEnd} onDragOver={e => handleItemDragOver(e, idx)}>
                      <span className="text-sm text-orange-600 font-medium">&bull;</span>
                      <span className="font-medium flex-1 truncate">{item.data?.label || 'Pauză'}</span>
                      <span className="text-[10px] text-orange-500">{item.data?.duration || 60}s</span>
                    </div>
                  ) : (
                    /* ─── Category / Match item ─── */
                    <div className={`flex items-center gap-1.5 rounded border px-2.5 py-2 transition cursor-grab ${
                      isActiveItem ? 'border-green-400 bg-green-50 ring-1 ring-green-300 shadow-sm' : idx === nextItemIndex ? st.border + ' bg-orange-50/50 ring-1 ring-orange-200 shadow-sm' : st.border + ' ' + st.bg + ' hover:shadow-sm'
                    }`}
                      draggable onDragStart={e => handleDragStart(e, item)} onDragEnd={handleDragEnd} onDragOver={e => handleItemDragOver(e, idx)}>
                      {/* Drag handle */}
                      <span className="text-gray-300 text-xs cursor-grab mr-0.5 select-none">⠿</span>

                      {/* Status dot */}
                      <span className={`h-2 w-2 rounded-full shrink-0 ${st.dot}`} />

                      {/* Name + info */}
                      <div className="flex-1 min-w-0">
                        {item.type === 'category' ? (
                          <>
                            <span className="text-xs font-semibold text-gray-900 truncate block">{item.data.name}</span>
                            {item.data.groupName && <span className="text-[10px] text-gray-400 truncate block">{item.data.groupName} • {genderLabels[item.data.gender] || item.data.gender}</span>}
                          </>
                        ) : (
                          <>
                            <span className="text-xs font-semibold truncate block">
                              {item.data.match_number && <span className="text-gray-400 mr-1">{item.data.match_number}</span>}
                              <span className="text-red-600">{item.data.red_corner_full_name || 'TBD'}</span>
                              <span className="text-gray-400 mx-0.5">vs</span>
                              <span className="text-blue-600">{item.data.blue_corner_full_name || 'TBD'}</span>
                            </span>
                            {(() => {
                              const matchCat = allCats.find(c => c.id === item.data.category);
                              return (
                                <span className="text-[10px] text-gray-400 truncate block">
                                  {matchCat?.name || item.data.category_name}{matchCat?.groupName ? ` • ${matchCat.groupName}` : ''}{matchCat?.gender ? ` • ${genderLabels[matchCat.gender]}` : ''} • <span className="font-semibold text-indigo-500">{matchTypeLabels[item.data.match_type] || item.data.match_type}</span>
                                </span>
                              );
                            })()}
                          </>
                        )}
                      </div>

                      {/* URMEAZĂ badge */}
                      {idx === nextItemIndex && !isActiveItem && (
                        <span className="text-[9px] font-bold text-orange-700 bg-orange-100 border border-orange-200 px-1.5 py-0.5 rounded shrink-0 uppercase">Urmează</span>
                      )}

                      {/* Status dropdown */}
                      <select
                        value={item.status || 'not_started'}
                        onChange={e => {
                          if (item.type === 'category') updateAssignmentStatus(item.assignmentId, e.target.value);
                          else updateMatchAssignmentStatus(item.assignmentId, e.target.value);
                        }}
                        disabled={busy}
                        className={`text-[10px] font-bold uppercase rounded px-1.5 py-0.5 border-none cursor-pointer ${st.badge} max-w-[65px]`}
                        onClick={e => e.stopPropagation()}
                      >
                        <option value="not_started">Neînceput</option>
                        <option value="in_progress">Activ</option>
                        <option value="completed">Gata</option>
                      </select>

                      {/* Play / Stop */}
                      {isActiveItem ? (
                        <button onClick={setIdle} disabled={busy} className="text-[10px] bg-red-100 text-red-600 px-2 py-1 rounded font-medium hover:bg-red-200 disabled:opacity-40 shrink-0">Stop</button>
                      ) : (
                        <button
                          onClick={() => {
                            if (item.type === 'category') switchDisplay(item.id, null, null);
                            else {
                              switchDisplay(item.data.category, item.id, null);
                              goFullscreen('match');
                            }
                          }}
                          disabled={busy}
                          className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded font-medium hover:bg-green-200 disabled:opacity-40 shrink-0"
                        >Play</button>
                      )}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
            {/* Final drop indicator */}
            {dropIndicator === scheduleItems.length && (
              <div className="h-0.5 bg-indigo-500 rounded-full mx-1 my-0.5" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ACTIVE CATEGORY PANEL — detailed view for solo/team
   Shows athlete list, assigned referees, score table
   ═══════════════════════════════════════════════════════ */
function ActiveCategoryPanel({ cat, session, refAssignment, athleteScores, refScores, busy, switchDisplay, setIdle, revealScores, onExpand }) {
  const enrolled = cat.enrolled_athletes || [];

  // Build referee list from assignment
  const referees = [];
  if (refAssignment) {
    for (let i = 1; i <= 5; i++) {
      const id = refAssignment[`referee_${i}`];
      const name = refAssignment[`referee_${i}_name`];
      if (id) referees.push({ pos: i, id, name: name || `A${i}` });
    }
  }
  const refCols = referees.length > 0 ? referees : [1,2,3,4,5].map(i => ({ pos: i, id: null, name: `A${i}` }));

  // Build rows
  const rows = enrolled.map(ea => {
    const athleteId = ea.athlete;
    const d = ea.athlete_details || {};
    const athleteName = `${d.last_name || ''} ${d.first_name || ''}`.trim() || `#${athleteId}`;
    const clubName = d.club_name || '';

    const catScore = athleteScores.find(as => as.athlete === athleteId);
    const catScoreId = catScore?.id;
    const rScores = catScoreId ? refScores.filter(rs => rs.athlete_score === catScoreId) : [];

    const scoreByRef = {};
    for (const rs of rScores) scoreByRef[rs.referee] = rs.score;

    // Scores in referee order
    const vals = refCols.map(r => r.id ? scoreByRef[r.id] : undefined);
    const numericVals = vals.filter(v => v != null).map(Number);

    // Mark high/low for cancellation
    let marks = vals.map(() => 'mid');
    let total = null;
    if (numericVals.length >= 5) {
      const sorted = [...numericVals].sort((a, b) => a - b);
      const low = sorted[0];
      const high = sorted[sorted.length - 1];
      let foundLow = false, foundHigh = false;
      marks = vals.map(v => {
        if (v == null) return 'empty';
        const n = Number(v);
        if (!foundLow && n === low) { foundLow = true; return 'low'; }
        if (!foundHigh && n === high) { foundHigh = true; return 'high'; }
        return 'mid';
      });
      total = sorted.slice(1, 4).reduce((s, v) => s + v, 0);
    } else if (numericVals.length > 0) {
      total = numericVals.reduce((s, v) => s + v, 0);
    }

    return { athleteId, athleteName, clubName, vals, marks, total, isActive: session?.current_athlete === athleteId };
  });

  return (
    <div className="rounded-lg border-2 border-green-400 bg-green-50/50 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-bold text-green-800">Categorie activa:</span>
          <span className="ml-2 text-base font-bold text-gray-900">{cat.name}</span>
          <span className="text-sm text-gray-500 ml-1">({cat.groupName})</span>
        </div>
        <div className="flex items-center gap-2">
          {onExpand && (
            <button onClick={onExpand} className="text-sm bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg font-semibold hover:bg-indigo-200">Extinde</button>
          )}
          <button onClick={setIdle} disabled={busy} className="text-sm bg-red-100 text-red-600 px-4 py-2 rounded-lg font-semibold hover:bg-red-200 disabled:opacity-40">Stop</button>
        </div>
      </div>

      {/* Referees */}
      {referees.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-gray-500 font-medium self-center mr-1">Arbitri:</span>
          {referees.map(r => (
            <span key={r.pos} className="text-xs bg-white border border-gray-300 rounded px-2.5 py-1 font-medium text-gray-700">
              R{r.pos}: {r.name}
            </span>
          ))}
        </div>
      )}

      {/* Score table */}
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left px-3 py-2 font-bold text-gray-700 border-b border-gray-300 w-10">#</th>
              <th className="text-left px-3 py-2 font-bold text-gray-700 border-b border-gray-300">Sportiv</th>
              <th className="text-left px-3 py-2 font-bold text-gray-700 border-b border-gray-300">Club</th>
              {refCols.map(r => (
                <th key={r.pos} className="text-center px-3 py-2 font-bold text-gray-700 border-b border-gray-300 w-16">R{r.pos}</th>
              ))}
              <th className="text-center px-3 py-2 font-bold text-gray-700 border-b border-gray-300 w-20">TOTAL</th>
              <th className="text-center px-3 py-2 border-b border-gray-300 w-12">TV</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.athleteId} className={`${row.isActive ? 'bg-green-100 font-semibold' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-yellow-50 transition`}>
                <td className="px-3 py-2 border-b border-gray-200 text-gray-400">{idx + 1}</td>
                <td className="px-3 py-2 border-b border-gray-200 text-gray-900 font-medium whitespace-nowrap">{row.athleteName}</td>
                <td className="px-3 py-2 border-b border-gray-200 text-gray-500 whitespace-nowrap">{row.clubName}</td>
                {row.vals.map((v, ri) => {
                  const mark = row.marks[ri];
                  const isCancelled = mark === 'low' || mark === 'high';
                  return (
                    <td key={ri} className={`text-center px-3 py-2 border-b border-gray-200 tabular-nums ${isCancelled ? 'text-red-400 line-through' : v != null ? 'text-gray-900' : 'text-gray-300'}`}>
                      {v != null ? Number(v).toFixed(1) : '—'}
                    </td>
                  );
                })}
                <td className="text-center px-3 py-2 border-b border-gray-200 font-bold text-gray-900 tabular-nums">
                  {row.total != null ? row.total.toFixed(1) : '—'}
                </td>
                <td className="text-center px-3 py-2 border-b border-gray-200">
                  <button
                    onClick={() => switchDisplay(cat.id, null, row.athleteId)}
                    disabled={busy}
                    className={`text-xs px-2 py-1 rounded font-medium disabled:opacity-40 ${
                      row.isActive ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                    }`}
                  >
                    {row.isActive ? '●' : '▶'}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={99} className="text-center py-4 text-gray-400 text-xs italic">Niciun sportiv înscris</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Reveal button */}
      {session?.status !== 'scores_revealed' && (
        <div className="flex justify-end">
          <button onClick={revealScores} disabled={busy} className="text-xs bg-green-600 text-white px-4 py-1.5 rounded font-bold hover:bg-green-700 disabled:opacity-40">
                        Reveal Scoruri pe Display
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ACTIVE MATCH PANEL — advanced fight management
   Pauses, time adjustments, warnings, penalties (-2),
   round controls, referee decisions, event log
   ═══════════════════════════════════════════════════════ */
function ActiveMatchPanel({
  match, session, matchRounds, activeRound, matchRefScores, matchEvents,
  matchRefAssignment, busy, setIdle, startRound, endRound, resetRound, createRounds,
  pauseRound, resumeRound, addWarning, addPenalty, addBonus, adjustTime, resetMatch, onExpand,
}) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [breakTimers, setBreakTimers] = useState({});
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

  // Count warnings, penalties and bonuses from events
  const warningsRed = matchEvents.filter(e => e.event_type === 'warning_red').length;
  const warningsBlue = matchEvents.filter(e => e.event_type === 'warning_blue').length;
  const penaltyEventsRed = matchEvents.filter(e => e.event_type === 'penalty_red');
  const penaltyEventsBlue = matchEvents.filter(e => e.event_type === 'penalty_blue');
  const bonusEventsRed = matchEvents.filter(e => e.event_type === 'bonus_red');
  const bonusEventsBlue = matchEvents.filter(e => e.event_type === 'bonus_blue');
  const penaltiesRed = penaltyEventsRed.length;
  const penaltiesBlue = penaltyEventsBlue.length;
  const totalPenaltyRed = penaltyEventsRed.reduce((s, e) => s + (e.value || 0), 0);
  const totalPenaltyBlue = penaltyEventsBlue.reduce((s, e) => s + (e.value || 0), 0);
  const totalBonusRed = bonusEventsRed.reduce((s, e) => s + (e.value || 0), 0);
  const totalBonusBlue = bonusEventsBlue.reduce((s, e) => s + (e.value || 0), 0);
  const adjustRed = totalPenaltyRed + totalBonusRed;
  const adjustBlue = totalPenaltyBlue + totalBonusBlue;

  const allRoundsCompleted = matchRounds.length > 0 && matchRounds.every(r => r.status === 'completed');
  const totalRounds = matchRounds.length;

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

  const handleConfirmReset = async () => {
    setShowResetConfirm(false);
    await resetMatch(match.id);
    setBreakTimers({});
  };

  const dismissBreak = (idx) => {
    setBreakTimers(prev => { const n = { ...prev }; delete n[idx]; return n; });
  };

  return (
    <div className="rounded-lg border-2 border-gray-300 bg-white p-4 space-y-4">
      {/* Reset confirmation dialog */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setShowResetConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md text-center space-y-4" onClick={e => e.stopPropagation()}>
            <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
              <span className="text-amber-600 text-xl font-black">!</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900">Resetare meci</h3>
            <p className="text-sm text-gray-600">Esti sigur ca vrei sa resetezi tot meciul? Toate reprizele, evenimentele si scorurile vor fi sterse.</p>
            <div className="flex gap-3 justify-center pt-2">
              <button onClick={() => setShowResetConfirm(false)} className="text-sm bg-gray-200 text-gray-700 px-5 py-2 rounded-lg font-medium hover:bg-gray-300">Anuleaza</button>
              <button onClick={handleConfirmReset} disabled={busy} className="text-sm bg-red-600 text-white px-5 py-2 rounded-lg font-bold hover:bg-red-700 disabled:opacity-40">Reseteaza tot</button>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-base font-bold text-gray-700">Meci activ:</span>
          <span className="text-xl font-black text-red-600">{match.red_corner_full_name || 'TBD'}</span>
          <span className="text-base text-gray-400 font-bold">vs</span>
          <span className="text-xl font-black text-blue-600">{match.blue_corner_full_name || 'TBD'}</span>
        </div>
        <div className="flex items-center gap-2">
          {onExpand && (
            <button onClick={onExpand} className="text-sm bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg font-semibold hover:bg-indigo-200">Extinde</button>
          )}
          <button onClick={() => setShowResetConfirm(true)} disabled={busy} className="text-sm bg-orange-100 text-orange-700 border border-orange-300 px-4 py-2 rounded-lg font-semibold hover:bg-orange-200 disabled:opacity-40">Reset</button>
          <button onClick={setIdle} disabled={busy} className="text-sm bg-red-100 text-red-600 px-4 py-2 rounded-lg font-semibold hover:bg-red-200 disabled:opacity-40">Stop</button>
        </div>
      </div>

      {/* ── ASSIGNED REFEREES ── */}
      {matchReferees.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-gray-500 font-medium self-center mr-1">Arbitri:</span>
          {matchReferees.map(r => (
            <span key={r.pos} className="text-xs bg-white border border-gray-300 rounded px-2.5 py-1 font-medium text-gray-700">
              R{r.pos}: {r.name}
            </span>
          ))}
        </div>
      )}

      {/* ── SCOREBOARD: warnings + penalties for both corners ── */}
      <div className="grid grid-cols-2 gap-2">
        {/* RED corner stats */}
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-red-500 shrink-0" />
            <span className="text-sm font-bold text-red-800 uppercase">Roșu</span>
            <span className="text-sm text-red-600 ml-auto font-medium">{match.red_corner_full_name || 'TBD'}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-500">Avert:</span>
              <span className="text-lg font-black text-yellow-600 tabular-nums">{warningsRed}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-500">Puncte:</span>
              <span className={`text-lg font-black tabular-nums ${adjustRed > 0 ? 'text-green-600' : adjustRed < 0 ? 'text-red-600' : 'text-gray-500'}`}>{adjustRed > 0 ? '+' : ''}{adjustRed}p</span>
            </div>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => addWarning(match.id, 'red', activeRound?.id)} disabled={busy} className="text-sm bg-yellow-100 text-yellow-700 border border-yellow-300 px-3 py-2.5 rounded-lg font-bold hover:bg-yellow-200 disabled:opacity-40">Avert.</button>
            <button onClick={() => addPenalty(match.id, 'red', activeRound?.id, -2)} disabled={busy} className="flex-1 text-sm bg-red-100 text-red-700 border border-red-300 px-3 py-2.5 rounded-lg font-black hover:bg-red-200 disabled:opacity-40">-2</button>
            <button onClick={() => addPenalty(match.id, 'red', activeRound?.id, -1)} disabled={busy} className="flex-1 text-sm bg-red-50 text-red-600 border border-red-200 px-3 py-2.5 rounded-lg font-black hover:bg-red-100 disabled:opacity-40">-1</button>
            <button onClick={() => addBonus(match.id, 'red', activeRound?.id, 1)} disabled={busy} className="flex-1 text-sm bg-green-50 text-green-700 border border-green-200 px-3 py-2.5 rounded-lg font-black hover:bg-green-100 disabled:opacity-40">+1</button>
            <button onClick={() => addBonus(match.id, 'red', activeRound?.id, 2)} disabled={busy} className="flex-1 text-sm bg-green-100 text-green-700 border border-green-300 px-3 py-2.5 rounded-lg font-black hover:bg-green-200 disabled:opacity-40">+2</button>
          </div>
        </div>

        {/* BLUE corner stats */}
        <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-blue-500 shrink-0" />
            <span className="text-sm font-bold text-blue-800 uppercase">Albastru</span>
            <span className="text-sm text-blue-600 ml-auto font-medium">{match.blue_corner_full_name || 'TBD'}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-500">Avert:</span>
              <span className="text-lg font-black text-yellow-600 tabular-nums">{warningsBlue}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-500">Puncte:</span>
              <span className={`text-lg font-black tabular-nums ${adjustBlue > 0 ? 'text-green-600' : adjustBlue < 0 ? 'text-red-600' : 'text-gray-500'}`}>{adjustBlue > 0 ? '+' : ''}{adjustBlue}p</span>
            </div>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => addWarning(match.id, 'blue', activeRound?.id)} disabled={busy} className="text-sm bg-yellow-100 text-yellow-700 border border-yellow-300 px-3 py-2.5 rounded-lg font-bold hover:bg-yellow-200 disabled:opacity-40">Avert.</button>
            <button onClick={() => addPenalty(match.id, 'blue', activeRound?.id, -2)} disabled={busy} className="flex-1 text-sm bg-red-100 text-red-700 border border-red-300 px-3 py-2.5 rounded-lg font-black hover:bg-red-200 disabled:opacity-40">-2</button>
            <button onClick={() => addPenalty(match.id, 'blue', activeRound?.id, -1)} disabled={busy} className="flex-1 text-sm bg-red-50 text-red-600 border border-red-200 px-3 py-2.5 rounded-lg font-black hover:bg-red-100 disabled:opacity-40">-1</button>
            <button onClick={() => addBonus(match.id, 'blue', activeRound?.id, 1)} disabled={busy} className="flex-1 text-sm bg-green-50 text-green-700 border border-green-200 px-3 py-2.5 rounded-lg font-black hover:bg-green-100 disabled:opacity-40">+1</button>
            <button onClick={() => addBonus(match.id, 'blue', activeRound?.id, 2)} disabled={busy} className="flex-1 text-sm bg-green-100 text-green-700 border border-green-300 px-3 py-2.5 rounded-lg font-black hover:bg-green-200 disabled:opacity-40">+2</button>
          </div>
        </div>
      </div>

      {/* ── ROUND CONTROLS with break placeholders ── */}
      <div className="space-y-2">
        <p className="text-sm font-bold text-gray-600 uppercase">Reprize</p>
        {matchRounds.length === 0 ? (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-500">Nu există reprize.</span>
            <button onClick={() => createRounds(match.id, 3, 180)} disabled={busy} className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-40">+ 3 × 3min</button>
            <button onClick={() => createRounds(match.id, 2, 120)} disabled={busy} className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-40">+ 2 × 2min</button>
          </div>
        ) : (
          <div className="space-y-2">
            {matchRounds.map((r, idx) => {
              const isActive = r.status === 'active';
              const isRoundPaused = r.is_paused;
              const showBreak = breakTimers[idx] && !isActive && idx < totalRounds - 1;
              const showBreakPlaceholder = !showBreak && r.status === 'completed' && idx < totalRounds - 1
                && matchRounds[idx + 1]?.status !== 'active' && matchRounds[idx + 1]?.status !== 'completed';

              return (
                <React.Fragment key={r.id}>
                <div className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 ${
                  isActive && isRoundPaused ? 'border-yellow-400 bg-yellow-50' :
                  isActive ? 'border-green-400 bg-green-100' :
                  r.status === 'completed' ? 'border-gray-300 bg-gray-100' :
                  'border-gray-200 bg-gray-50'
                }`}>
                  <span className={`text-sm font-bold ${isActive ? 'text-green-700' : r.status === 'completed' ? 'text-gray-400' : 'text-gray-700'}`}>R{r.round_number}</span>
                  
                  {isActive && <LiveTimer round={r} />}
                  {!isActive && r.status === 'completed' && <span className="text-xs text-green-600 font-medium">Finalizata</span>}
                  {!isActive && r.status === 'scheduled' && <span className="text-xs text-gray-500">{r.duration_seconds}s</span>}

                  {isActive && isRoundPaused && (
                    <span className="text-xs font-bold text-yellow-700 bg-yellow-200 px-2 py-0.5 rounded-lg animate-pulse">PAUZA</span>
                  )}

                  {r.extra_seconds !== 0 && (
                    <span className={`text-xs font-medium px-1.5 rounded ${r.extra_seconds > 0 ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'}`}>
                      {r.extra_seconds > 0 ? '+' : ''}{r.extra_seconds}s
                    </span>
                  )}

                  <div className="ml-auto flex items-center gap-1.5">
                    {r.status === 'scheduled' && (
                      <button onClick={() => startRound(r.id)} disabled={busy || !!activeRound} className="text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-40">Start</button>
                    )}
                    {isActive && !isRoundPaused && (
                      <button onClick={() => pauseRound(match.id, r.id)} disabled={busy} className="text-sm bg-yellow-500 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-yellow-600 disabled:opacity-40">Pauza</button>
                    )}
                    {isActive && isRoundPaused && (
                      <button onClick={() => resumeRound(match.id, r.id)} disabled={busy} className="text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-40">Reluare</button>
                    )}
                    {isActive && (
                      <button onClick={() => endRound(r.id)} disabled={busy} className="text-sm bg-red-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-red-700 disabled:opacity-40">Stop</button>
                    )}
                    {isActive && (
                      <div className="flex items-center gap-1 ml-2 border-l border-gray-300 pl-2">
                        <button onClick={() => adjustTime(match.id, r.id, -10)} disabled={busy} className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300 disabled:opacity-40">-10s</button>
                        <button onClick={() => adjustTime(match.id, r.id, 10)} disabled={busy} className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300 disabled:opacity-40">+10s</button>
                        <button onClick={() => adjustTime(match.id, r.id, 30)} disabled={busy} className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300 disabled:opacity-40">+30s</button>
                      </div>
                    )}
                    <button onClick={() => resetRound(r.id)} disabled={busy} className="text-xs text-gray-400 hover:text-orange-600 disabled:opacity-40 px-1.5 py-0.5 rounded hover:bg-orange-50 transition">Reset</button>
                  </div>
                </div>

                {/* Referee per-round scores (competition manager only — not visible to public) */}
                {(() => {
                  const roundScores = matchRefScores.filter(s => s.round === r.id);
                  if (roundScores.length === 0) return null;
                  return (
                    <div className="ml-8 px-3 py-2 rounded-lg bg-indigo-50/80 border border-indigo-200">
                      <p className="text-sm font-bold text-indigo-600 mb-1">Scoruri arbitri R{r.round_number}</p>
                      <div className="space-y-0.5">
                        {roundScores.map((s, si) => {
                          const refName = matchReferees.find(mr => mr.id === s.referee)?.name || `Arbitru #${s.referee}`;
                          return (
                            <div key={si} className="flex items-center gap-3 text-sm">
                              <span className="text-gray-600 font-medium w-32 truncate">{refName}</span>
                              <span className="font-black text-red-600 tabular-nums w-8 text-center">{s.red_corner_score}</span>
                              <span className="text-gray-300">—</span>
                              <span className="font-black text-blue-600 tabular-nums w-8 text-center">{s.blue_corner_score}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Active break timer (auto-started after round completes) */}
                {showBreak && (
                  <BreakTimer
                    onSkip={() => { dismissBreak(idx); startRound(matchRounds[idx + 1].id); }}
                    busy={busy}
                    autoStart
                  />
                )}

                {/* Break placeholder between completed rounds */}
                {showBreakPlaceholder && !breakTimers[idx] && (
                  <div className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-dashed border-orange-300 bg-orange-50/50 text-orange-500">
                    <span className="text-xs font-medium">Pauza intre reprize</span>
                  </div>
                )}
                </React.Fragment>
              );
            })}

            {/* Decizia arbitrilor placeholder */}
            <div className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border-2 ${
              allRoundsCompleted ? 'border-purple-400 bg-purple-50' : 'border-dashed border-gray-300 bg-gray-50/50 text-gray-400'
            }`}>
              <span className={`text-sm font-bold ${allRoundsCompleted ? 'text-purple-800' : 'text-gray-400'}`}>Decizia arbitrilor</span>
            </div>
          </div>
        )}
      </div>

      {/* ── REFEREE DECISIONS — full section after all rounds complete ── */}
      {allRoundsCompleted && (
        <div className="rounded-lg border-2 border-purple-400 bg-purple-50 p-4 space-y-3">
          <h3 className="text-sm font-bold text-purple-800">Decizia arbitrilor</h3>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {[0, 1, 2, 3, 4].map(i => {
              const score = matchRefScores[i];
              const d = score?.winner_choice;
              return (
                <span key={i} className={`w-10 h-10 rounded-lg text-sm font-bold flex items-center justify-center ${
                  d === 'red' ? 'bg-red-500 text-white' : d === 'blue' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-400'
                }`}>R{i + 1}</span>
              );
            })}
          </div>
          {(() => {
            const redVotes = matchRefScores.filter(s => s.winner_choice === 'red').length;
            const blueVotes = matchRefScores.filter(s => s.winner_choice === 'blue').length;
            if (redVotes > blueVotes) return <p className="text-center text-sm font-bold text-red-600">Castigator: {match.red_corner_full_name} (Rosu) — {redVotes} / {blueVotes}</p>;
            if (blueVotes > redVotes) return <p className="text-center text-sm font-bold text-blue-600">Castigator: {match.blue_corner_full_name} (Albastru) — {blueVotes} / {redVotes}</p>;
            if (redVotes === blueVotes && redVotes > 0) return <p className="text-center text-sm font-bold text-gray-600">Egalitate — {redVotes} / {blueVotes}</p>;
            return <p className="text-center text-xs text-gray-500 italic">Se așteaptă deciziile arbitrilor...</p>;
          })()}
        </div>
      )}

      {/* ── Referee decisions (smaller) when rounds not yet done ── */}
      {!allRoundsCompleted && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 font-medium">Decizii arbitri:</span>
          {[0, 1, 2, 3, 4].map(i => {
            const score = matchRefScores[i];
            const d = score?.winner_choice;
            return (
              <span key={i} className={`w-8 h-8 rounded-lg text-xs font-bold flex items-center justify-center ${
                d === 'red' ? 'bg-red-500 text-white' : d === 'blue' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-400'
              }`}>R{i + 1}</span>
            );
          })}
        </div>
      )}

      {/* ── EVENT LOG ── */}
      {matchEvents.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-bold text-gray-500 uppercase">Evenimente ({matchEvents.length})</p>
          <div className="max-h-36 overflow-y-auto space-y-0.5 bg-gray-50 rounded-lg border border-gray-200 p-2">
            {[...matchEvents].reverse().slice(0, 20).map(ev => {
              const typeLabels = {
                warning_red: 'Avertisment Rosu',
                warning_blue: 'Avertisment Albastru',
                penalty_red: `Penalizare Rosu (${ev.value}p)`,
                penalty_blue: `Penalizare Albastru (${ev.value}p)`,
                bonus_red: `Bonus Rosu (+${ev.value}p)`,
                bonus_blue: `Bonus Albastru (+${ev.value}p)`,
                pause: 'Pauza',
                resume: 'Reluare',
                time_add: 'Timp adaugat',
                time_remove: 'Timp scazut',
              };
              const time = ev.created_at ? new Date(ev.created_at).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
              const isRedEvent = ev.event_type.includes('red');
              const isBlueEvent = ev.event_type.includes('blue');
              const isBonus = ev.event_type.startsWith('bonus');
              return (
                <div key={ev.id} className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="text-gray-400 tabular-nums shrink-0">{time}</span>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isRedEvent ? 'bg-red-500' : isBlueEvent ? 'bg-blue-500' : 'bg-gray-400'}`} />
                  <span className={`font-medium ${isBonus ? 'text-green-600' : isRedEvent ? 'text-red-600' : isBlueEvent ? 'text-blue-600' : 'text-gray-600'}`}>
                    {typeLabels[ev.event_type] || ev.event_type_display || ev.event_type}
                  </span>
                  {ev.value && ev.event_type.startsWith('time') && (
                    <span className="text-gray-400">({ev.value > 0 ? '+' : ''}{ev.value}s)</span>
                  )}
                  {ev.round && <span className="text-gray-400">R{matchRounds.find(r => r.id === ev.round)?.round_number || '?'}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   LIVE TIMER — compact countdown for admin round row
   Accounts for pauses and extra seconds
   ═══════════════════════════════════════════════════════ */
function LiveTimer({ round }) {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!round || round.status !== 'active' || !round.started_at) {
      setTimeLeft(null);
      return;
    }

    const duration = (round.duration_seconds || 180) + (round.extra_seconds || 0);
    const started = new Date(round.started_at).getTime();
    const pauseAcc = (round.accumulated_pause_seconds || 0) * 1000;

    const tick = () => {
      if (round.is_paused && round.paused_at) {
        // If paused, freeze at the moment of pause
        const pausedTime = new Date(round.paused_at).getTime();
        const elapsed = Math.floor((pausedTime - started - pauseAcc) / 1000);
        setTimeLeft(Math.max(0, duration - elapsed));
      } else {
        const elapsed = Math.floor((Date.now() - started - pauseAcc) / 1000);
        setTimeLeft(Math.max(0, duration - elapsed));
      }
    };

    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [round, round?.started_at, round?.is_paused, round?.paused_at, round?.accumulated_pause_seconds, round?.extra_seconds]);

  if (timeLeft == null) return null;

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const isLow = timeLeft <= 10;

  return (
    <span className={`text-lg font-black tabular-nums ${
      round.is_paused ? 'text-yellow-700' :
      isLow ? 'text-red-600 animate-pulse' : 'text-green-700'
    }`}>
      {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════
   BREAK TIMER — 1-minute break countdown between rounds
   Auto-starts, with stop/resume and ±10s controls
   ═══════════════════════════════════════════════════════ */
function BreakTimer({ onSkip, busy, duration = 60, autoStart = false }) {
  const [secondsLeft, setSecondsLeft] = useState(duration);
  const [running, setRunning] = useState(autoStart || true);

  useEffect(() => {
    if (!running || secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [running, secondsLeft]);

  const adjust = (delta) => setSecondsLeft(s => Math.max(0, s + delta));
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const isFinished = secondsLeft === 0;

  return (
    <div className={`flex items-center gap-2 justify-center py-2 px-3 rounded-lg border ${
      isFinished ? 'border-green-400 bg-green-50 animate-pulse' : 'border-orange-300 bg-orange-50'
    }`}>
      <span className="text-xs font-bold text-orange-700 uppercase">Pauza intre reprize</span>
      <span className={`text-xl font-black tabular-nums ${
        isFinished ? 'text-green-600' : secondsLeft <= 5 ? 'text-red-600 animate-pulse' : 'text-orange-700'
      }`}>
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setRunning(r => !r)}
          className={`text-xs px-2.5 py-1 rounded font-medium border ${
            running ? 'bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-200' : 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200'
          }`}
        >
          {running ? 'Stop' : 'Start'}
        </button>
        <button onClick={() => adjust(-10)} className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded hover:bg-gray-300">-10s</button>
        <button onClick={() => adjust(10)} className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded hover:bg-gray-300">+10s</button>
        <button
          onClick={onSkip}
          disabled={busy}
          className="text-xs bg-green-600 text-white px-2.5 py-1 rounded font-medium hover:bg-green-700 disabled:opacity-40"
        >
          Start repriza
        </button>
      </div>
    </div>
  );
}
