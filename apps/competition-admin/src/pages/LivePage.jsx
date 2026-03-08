import React, { useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CentralizatorContext } from './CategoriesLayout';
import {
  fieldAPI, monitorAPI, matchAPI,
  matchFieldAssignmentAPI, matchEventAPI, fieldBreakAPI,
  matchRefereeScoreAPI,
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
  const [matchRefScores, setMatchRefScores] = useState([]);
  const [matchEvents, setMatchEvents] = useState([]);
  const [fieldBreaks, setFieldBreaks] = useState([]);
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
      const [fR, sR, caR, maR, mR, mrsR, meR, fbR] = await Promise.all([
        fieldAPI.list({ event_id: eventId }),
        monitorAPI.sessions.list({ event_id: eventId }),
        fieldAPI.assignments.list({ event_id: eventId }),
        matchFieldAssignmentAPI.list({ event_id: eventId }),
        matchAPI.list({ event_id: eventId }),
        matchRefereeScoreAPI.list({ event_id: eventId }),
        matchEventAPI.list({ event_id: eventId }),
        fieldBreakAPI.list({ event_id: eventId }),
      ]);
      const arr = r => r.data?.results || r.data || [];
      setFields(arr(fR).sort((a, b) => (a.field_number ?? a.id) - (b.field_number ?? b.id)));
      setSessions(arr(sR));
      setCatAssignments(arr(caR));
      setMatchAssignments(arr(maR));
      setMatches(arr(mR));
      setMatchRefScores(arr(mrsR));
      setMatchEvents(arr(meR));
      setFieldBreaks(arr(fbR));
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
      <div className="flex items-center gap-3 mb-3 bg-white border border-gray-200 px-4 py-3 shadow-sm overflow-x-auto shrink-0">
        <span className="text-sm font-bold text-gray-500 uppercase tracking-wider mr-1 shrink-0">Vizualizare:</span>
        <button
          onClick={() => setViewMode('all')}
          className={`text-base px-5 py-2.5 font-semibold transition shrink-0 ${
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
              className={`text-base px-5 py-2.5 font-semibold transition shrink-0 ${
                viewMode === f.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : isActive
                    ? 'bg-green-100 text-green-700 hover:bg-green-200 ring-1 ring-green-300'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {isActive && <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 mr-2 animate-pulse" />}
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
              matchRefScores={matchRefScores}
              matchEvents={matchEvents}
              fieldBreaks={fieldBreaks.filter(b => b.field === field.id)}
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
   FIELD PANEL — tatami panel: schedule / programa
   ═══════════════════════════════════════════════════════ */
function FieldPanel({
  field, session, fieldCats, fieldMatches, allCats, matches,
  matchRefScores, matchEvents,
  fieldBreaks, catAssignments, matchAssignments, onRefresh, singleView,
  navigate, eventId,
}) {
  const [busy, setBusy] = useState(false);
  const dragItemRef = useRef(null);
  const [dropIndicator, setDropIndicator] = useState(null); // null | 'category' | 'match'

  const isIdle = !session || session.status === 'idle';
  const currentCat = fieldCats.find(c => c.id === session?.current_category);
  const currentMatch = fieldMatches.find(m => m.id === session?.current_match)
                    || matches.find(m => m.id === session?.current_match);

  // ── Auto-mark match assignments as 'completed' when match is finalized ──
  useEffect(() => {
    if (!matchAssignments?.length || !matches?.length) return;
    const fieldMatchAss = matchAssignments.filter(a => a.field === field.id);
    for (const a of fieldMatchAss) {
      const m = matches.find(mm => mm.id === a.match);
      if (m && m.status === 'completed' && a.status !== 'completed') {
        matchFieldAssignmentAPI.update(a.id, { status: 'completed' }).catch(console.error);
      }
    }
  }, [matches, matchAssignments, field.id]);

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

  const goFullscreen = (panelType) => {
    navigate(`/competitions/${eventId}/live-fullscreen?field=${field.id}&panel=${panelType}`);
  };

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
    <div className={`border border-gray-300 bg-white shadow-sm overflow-hidden ${singleView ? 'flex-1 flex flex-col min-h-0' : ''}`}>
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between bg-gray-800 text-white px-5 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold">{field.name}</span>
          <span className={`h-3.5 w-3.5 rounded-full ${isIdle ? 'bg-gray-500' : 'bg-green-500 animate-pulse'}`} />
          <span className="text-sm text-gray-400 uppercase tracking-wider font-medium">
            {isIdle ? 'Inactiv' : session?.status === 'scores_revealed' ? 'Scoruri afișate' : 'În desfășurare'}
          </span>
        </div>
        <button
          onClick={() => window.open(displayUrl, '_blank')}
          className="flex items-center gap-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 px-5 py-2.5 font-semibold transition border border-gray-600"
        >
          📺 Public Display
        </button>
      </div>

      {/* ═══ BODY: Schedule / Programa (full width) ═══ */}
      <div className={`${singleView ? 'flex-1 min-h-0 overflow-y-auto' : ''} bg-gray-50`}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
        onDrop={handleDrop}
        onDragLeave={() => setDropIndicator(null)}
      >
          <div className="px-4 py-3 bg-gray-100 border-b border-gray-200 sticky top-0 z-10">
            <p className="text-sm font-bold text-gray-600 uppercase tracking-wide">Programa ({scheduleItems.length})</p>
          </div>
          <div className="p-3 space-y-2">
            {scheduleItems.length === 0 && (
              <p className="text-sm text-gray-400 italic text-center py-6">Nicio probă alocată.<br/>Mergi la Programare.</p>
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
                    <div className="flex items-center gap-2 px-4 py-3 bg-orange-50 border border-orange-200 text-sm text-orange-700 cursor-grab"
                      draggable onDragStart={e => handleDragStart(e, item)} onDragEnd={handleDragEnd} onDragOver={e => handleItemDragOver(e, idx)}>
                      <span className="text-base text-orange-600 font-medium">&bull;</span>
                      <span className="font-semibold flex-1 truncate">{item.data?.label || 'Pauză'}</span>
                      <span className="text-xs text-orange-500">{item.data?.duration || 60}s</span>
                    </div>
                  ) : (
                    /* ─── Category / Match item ─── */
                    <div className={`flex flex-wrap items-center gap-2 sm:gap-2.5 border px-3 sm:px-4 py-2.5 sm:py-3 transition cursor-grab ${
                      isActiveItem ? 'border-green-400 bg-green-50 ring-2 ring-green-300 shadow-sm' : idx === nextItemIndex ? st.border + ' bg-orange-50/50 ring-2 ring-orange-200 shadow-sm' : st.border + ' ' + st.bg + ' hover:shadow-sm'
                    }`}
                      draggable onDragStart={e => handleDragStart(e, item)} onDragEnd={handleDragEnd} onDragOver={e => handleItemDragOver(e, idx)}>
                      {/* Drag handle */}
                      <span className="text-gray-300 text-sm cursor-grab mr-0.5 select-none">⠿</span>

                      {/* Status dot */}
                      <span className={`h-3 w-3 rounded-full shrink-0 ${st.dot}`} />

                      {/* Name + info */}
                      <div className="flex-1 min-w-0">
                        {item.type === 'category' ? (
                          <>
                            <span className="text-sm md:text-base font-bold text-gray-900 block">{item.data.name}</span>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {item.data.groupName && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5">{item.data.groupName}</span>}
                              {item.data.gender && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5">{genderLabels[item.data.gender] || item.data.gender}</span>}
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="text-sm md:text-base font-bold truncate block">
                              {item.data.match_number && <span className="text-gray-400 mr-1">{item.data.match_number}</span>}
                              <span className="text-red-600">{item.data.red_corner_full_name || 'TBD'}</span>
                              <span className="text-gray-400 mx-1">vs</span>
                              <span className="text-blue-600">{item.data.blue_corner_full_name || 'TBD'}</span>
                            </span>
                            {(() => {
                              const matchCat = allCats.find(c => c.id === item.data.category);
                              return (
                                <span className="text-xs text-gray-400 truncate block">
                                  {matchCat?.name || item.data.category_name}{matchCat?.groupName ? ` • ${matchCat.groupName}` : ''}{matchCat?.gender ? ` • ${genderLabels[matchCat.gender]}` : ''} • <span className="font-semibold text-indigo-500">{matchTypeLabels[item.data.match_type] || item.data.match_type}</span>
                                </span>
                              );
                            })()}
                          </>
                        )}
                      </div>

                      {/* URMEAZĂ badge */}
                      {idx === nextItemIndex && !isActiveItem && (
                        <span className="text-xs font-bold text-orange-700 bg-orange-100 border border-orange-200 px-2.5 py-1 shrink-0 uppercase">Urmează</span>
                      )}

                      {/* Status dropdown */}
                      <select
                        value={item.status || 'not_started'}
                        onChange={async e => {
                          const newStatus = e.target.value;
                          // If setting to in_progress, first reset other active items on this field
                          if (newStatus === 'in_progress') {
                            for (const si of scheduleItems) {
                              if (si === item || si.type === 'break' || si.status !== 'in_progress') continue;
                              try {
                                if (si.type === 'category') await fieldAPI.assignments.update(si.assignmentId, { status: 'not_started' });
                                else await matchFieldAssignmentAPI.update(si.assignmentId, { status: 'not_started' });
                              } catch {}
                            }
                          }
                          if (item.type === 'category') updateAssignmentStatus(item.assignmentId, newStatus);
                          else updateMatchAssignmentStatus(item.assignmentId, newStatus);
                        }}
                        disabled={busy}
                        className={`text-xs font-bold uppercase px-2.5 py-1.5 border-none cursor-pointer ${st.badge}`}
                        onClick={e => e.stopPropagation()}
                      >
                        <option value="not_started">Neînceput</option>
                        <option value="in_progress">Activ</option>
                        <option value="completed">Finalizat</option>
                      </select>

                      {/* START / CONTINUA / Stop / VEZI DETALII */}
                      {isActiveItem ? (
                        <>
                          <button
                            onClick={() => goFullscreen(item.type === 'category' ? 'category' : 'match')}
                            disabled={busy}
                            className="text-sm bg-green-600 text-white px-4 py-2 font-bold hover:bg-green-700 disabled:opacity-40 shrink-0"
                          >CONTINUĂ PROBA</button>
                          <button onClick={setIdle} disabled={busy} className="text-sm bg-red-100 text-red-600 px-4 py-2 font-bold hover:bg-red-200 disabled:opacity-40 shrink-0">Stop</button>
                        </>
                      ) : item.status === 'completed' ? (
                        <button
                          onClick={() => goFullscreen(item.type === 'category' ? 'category' : 'match')}
                          className="text-sm bg-gray-600 text-white px-4 py-2 font-bold hover:bg-gray-700 shrink-0"
                        >VEZI DETALII</button>
                      ) : item.status === 'in_progress' ? (
                        <button
                          onClick={() => {
                            if (item.type === 'category') {
                              switchDisplay(item.id, null, null);
                              goFullscreen('category');
                            } else {
                              switchDisplay(item.data.category, item.id, null);
                              goFullscreen('match');
                            }
                          }}
                          disabled={busy || !isIdle}
                          title={!isIdle ? 'Oprește proba activă înainte de a continua alta' : ''}
                          className={`text-sm px-4 py-2 font-bold shrink-0 disabled:opacity-40 ${!isIdle ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}
                        >CONTINUĂ PROBA</button>
                      ) : (
                        <button
                          onClick={async () => {
                            if (item.type === 'category') {
                              await switchDisplay(item.id, null, null);
                              await updateAssignmentStatus(item.assignmentId, 'in_progress');
                              goFullscreen('category');
                            } else {
                              await switchDisplay(item.data.category, item.id, null);
                              await updateMatchAssignmentStatus(item.assignmentId, 'in_progress');
                              goFullscreen('match');
                            }
                          }}
                          disabled={busy || !isIdle}
                          title={!isIdle ? 'Oprește proba activă înainte de a începe alta' : ''}
                          className={`text-sm px-5 py-2 font-bold shrink-0 disabled:opacity-40 ${!isIdle ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}
                        >START PROBA</button>
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
  );
}

