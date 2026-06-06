import React, { useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CentralizatorContext, GENDER_BG } from './CategoriesLayout';
import {
  fieldAPI, monitorAPI, matchAPI,
  matchFieldAssignmentAPI, matchEventAPI, fieldBreakAPI,
  matchRefereeScoreAPI,
} from '@shared/lib/api';
import { formatGroupBadgeLabel } from '@shared/components/ui';

/* ═══════════════════════════════════════════════════════
   LIVE PAGE — Competition Management during the event
   ═══════════════════════════════════════════════════════ */

const PUBLIC_DISPLAY_PORT = 5177;

const STATUS_CFG = {
  not_started:  { label: 'Neînceput',      dot: 'bg-gray-500',  bg: 'bg-white',  border: 'border-black', badge: 'border border-black bg-white text-gray-700' },
  in_progress:  { label: 'În desfășurare', dot: 'bg-emerald-500 animate-pulse', bg: 'bg-yellow-50/60', border: 'border-black', badge: 'border border-black bg-yellow-100 text-gray-800' },
  completed:    { label: 'Finalizat',      dot: 'bg-black',  bg: 'bg-gray-100',  border: 'border-black', badge: 'border border-black bg-gray-200 text-black' },
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
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);

  // Collect all categories from context
  const groupMap = useMemo(() => {
    const map = new Map();
    for (const group of groups || []) map.set(group.id, group);
    return map;
  }, [groups]);

  const allCats = useMemo(() => {
    if (!columnStructure) return [];
    const seen = new Set();
    const result = [];
    for (const col of columnStructure) {
      for (const cat of col.cats) {
        if (seen.has(cat.id)) continue;
        seen.add(cat.id);
        const group = groupMap.get(cat.group);
        result.push({ ...cat, groupName: formatGroupBadgeLabel(group, cat) });
      }
    }
    return result;
  }, [columnStructure, groupMap]);

  const categoryMap = useMemo(() => {
    const map = new Map();
    for (const cat of allCats) map.set(cat.id, cat);
    return map;
  }, [allCats]);

  const matchMap = useMemo(() => {
    const map = new Map();
    for (const match of matches) map.set(match.id, match);
    return map;
  }, [matches]);

  const fieldBreaksByField = useMemo(() => {
    const map = new Map();
    for (const fieldBreak of fieldBreaks) {
      if (!map.has(fieldBreak.field)) map.set(fieldBreak.field, []);
      map.get(fieldBreak.field).push(fieldBreak);
    }
    return map;
  }, [fieldBreaks]);

  const fetchStaticData = useCallback(async () => {
    if (!eventId) return;
    try {
      const [fR, fbR] = await Promise.all([
        fieldAPI.list({ event_id: eventId }),
        fieldBreakAPI.list({ event_id: eventId }),
      ]);
      const arr = r => r.data?.results || r.data || [];
      setFields(arr(fR).sort((a, b) => (a.field_number ?? a.id) - (b.field_number ?? b.id)));
      setFieldBreaks(arr(fbR));
    } catch (err) {
      console.error('Live data fetch error:', err);
    }
  }, [eventId]);

  const fetchLiveState = useCallback(async () => {
    if (!eventId) return;
    try {
      const [sR, caR, maR, mR, mrsR, meR] = await Promise.all([
        monitorAPI.sessions.list({ event_id: eventId }),
        fieldAPI.assignments.list({ event_id: eventId }),
        matchFieldAssignmentAPI.list({ event_id: eventId }),
        matchAPI.list({ event_id: eventId }),
        matchRefereeScoreAPI.list({ event_id: eventId }),
        matchEventAPI.list({ event_id: eventId }),
      ]);
      const arr = r => r.data?.results || r.data || [];
      setSessions(arr(sR));
      setCatAssignments(arr(caR));
      setMatchAssignments(arr(maR));
      setMatches(arr(mR));
      setMatchRefScores(arr(mrsR));
      setMatchEvents(arr(meR));
    } catch (err) {
      console.error('Live data fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    Promise.all([fetchStaticData(), fetchLiveState()]);
    pollRef.current = setInterval(fetchLiveState, 3000);
    return () => clearInterval(pollRef.current);
  }, [fetchLiveState, fetchStaticData]);

  const fieldDataMap = useMemo(() => {
    const sessionsByField = new Map();
    for (const session of sessions) sessionsByField.set(session.field, session);

    const catAssignmentsByField = new Map();
    for (const assignment of catAssignments) {
      if (!catAssignmentsByField.has(assignment.field)) catAssignmentsByField.set(assignment.field, []);
      catAssignmentsByField.get(assignment.field).push(assignment);
    }

    const matchAssignmentsByField = new Map();
    for (const assignment of matchAssignments) {
      if (!matchAssignmentsByField.has(assignment.field)) matchAssignmentsByField.set(assignment.field, []);
      matchAssignmentsByField.get(assignment.field).push(assignment);
    }

    const data = new Map();
    for (const field of fields) {
      const fieldCatAss = (catAssignmentsByField.get(field.id) || []).slice().sort((a, b) => a.order - b.order);
      const fieldMatchAss = (matchAssignmentsByField.get(field.id) || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      data.set(field.id, {
        session: sessionsByField.get(field.id),
        fieldCats: fieldCatAss
          .map(assignment => {
            const cat = categoryMap.get(assignment.category);
            return cat ? { ...cat, _assignment: assignment } : null;
          })
          .filter(Boolean),
        fieldMatches: fieldMatchAss
          .map(assignment => {
            const match = matchMap.get(assignment.match);
            return match ? { ...match, _assignment: assignment } : null;
          })
          .filter(Boolean),
      });
    }
    return data;
  }, [sessions, catAssignments, matchAssignments, fields, categoryMap, matchMap]);

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

  const displayedFields = fields;
  const isSingle = false;

  return (
    <div className={`flex-1 overflow-auto bg-white ${isSingle ? 'flex flex-col p-2 gap-2' : 'p-3'}`}>
      {/* ═══ FIELD PANELS ═══ */}
      <div className={isSingle ? 'flex-1 min-h-0 flex flex-col' : 'grid grid-cols-1 gap-4 lg:grid-cols-2'}>
        {displayedFields.map(field => {
          const { session, fieldCats, fieldMatches } = fieldDataMap.get(field.id) || { session: null, fieldCats: [], fieldMatches: [] };
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
              fieldBreaks={fieldBreaksByField.get(field.id) || []}
              catAssignments={catAssignments}
              matchAssignments={matchAssignments}
              onRefresh={fetchLiveState}
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
  const [statusConfirmData, setStatusConfirmData] = useState(null); // { item, newStatus }

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

  const goFullscreen = (panelType, itemId) => {
    navigate(`/competitions/${eventId}/live-fullscreen?field=${field.id}&panel=${panelType}${itemId ? `&id=${itemId}` : ''}`);
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

  return (
    <div className={`overflow-hidden border-2 border-black bg-white shadow-sm ${singleView ? 'flex min-h-0 flex-1 flex-col' : ''}`}>
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between border-b border-black bg-white px-4 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold uppercase tracking-wide text-gray-900">{field.name}</span>
          <span className={`h-3.5 w-3.5 ${isIdle ? 'bg-gray-500' : 'bg-emerald-500 animate-pulse'}`} />
          <span className="text-sm font-medium uppercase tracking-wider text-gray-700">
            {isIdle ? 'Inactiv' : session?.status === 'scores_revealed' ? 'Scoruri afișate' : 'În desfășurare'}
          </span>
        </div>
        <button
          onClick={() => window.open(displayUrl, '_blank')}
          className="flex items-center gap-2 border border-black bg-yellow-300 px-4 py-2 text-sm font-semibold text-black transition hover:bg-yellow-200"
        >
          Afisare TV
        </button>
      </div>

      {/* ═══ BODY: Schedule / Programa (full width) ═══ */}
      <div className={`${singleView ? 'flex-1 min-h-0 overflow-y-auto' : ''} bg-gray-50/50`}>
          <div className="sticky top-0 z-10 border-b-2 border-black bg-white px-4 py-3">
            <p className="text-sm font-bold uppercase tracking-wide text-gray-900">Programa ({scheduleItems.length})</p>
              <p className="mt-1 text-[11px] text-gray-500">
                Statusul de aici controlează programarea pe teren. Pentru meciuri, butonul de start din ecranul live mai ține cont și de statusul logic al meciului.
              </p>
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
                  {item.type === 'break' ? (
                    /* ─── Break item ─── */
                    <div className="flex items-center gap-2 border-2 border-dashed border-black bg-white px-4 py-3 text-sm text-gray-800">
                      <span className="text-base font-medium text-gray-800">&bull;</span>
                      <span className="flex-1 font-semibold">{item.data?.label || 'Pauză'}</span>
                      <span className="text-xs text-gray-700">{item.data?.duration || 60}s</span>
                    </div>
                  ) : (
                    /* ─── Category / Match item ─── */
                    <div className={`flex flex-wrap items-center gap-2 border px-3 py-2.5 transition sm:gap-2.5 sm:px-4 sm:py-3 ${
                      item.status === 'completed'
                        ? 'border-black bg-gray-100 opacity-60 cursor-default'
                        : isActiveItem
                          ? 'border-black bg-yellow-200 ring-2 ring-yellow-300 shadow-sm'
                          : idx === nextItemIndex
                            ? st.border + ' bg-white shadow-sm'
                            : st.border + ' ' + st.bg + ' hover:shadow-sm'
                    }`}
                    >

                      {/* Status dot */}
                      <span className={`h-3.5 w-3.5 shrink-0 ${item.status === 'completed' ? 'bg-gray-400' : st.dot}`} />

                      {/* Name + info */}
                      <div className="flex-1 min-w-0">
                        {item.type === 'category' ? (
                          <>
                            <span className="block text-sm font-bold text-gray-900 md:text-base whitespace-normal break-words">{item.data.name}</span>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {item.data.groupName && <span className="frvv-chip">{item.data.groupName}</span>}
                              {item.data.gender && <span className={`border border-black px-1.5 py-0.5 text-xs text-gray-700 ${GENDER_BG[item.data.gender] || 'bg-gray-100'}`}>{String(genderLabels[item.data.gender] || item.data.gender).toUpperCase()}</span>}
                              <span className="frvv-chip">{item.data.enrolled_athletes?.length || 0} sportiv{(item.data.enrolled_athletes?.length || 0) !== 1 ? 'i' : ''}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            {(() => {
                              const matchCat = allCats.find(c => c.id === item.data.category);
                              return (
                                <>
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-bold md:text-base leading-snug whitespace-normal break-words uppercase">
                                        <span className="text-red-600">{item.data.red_corner_full_name || 'TBD'}</span>
                                        {item.data.red_corner_club_name ? <span className="normal-case ml-1 text-gray-500">({item.data.red_corner_club_name})</span> : null}
                                        <span className="text-gray-400 mx-1 font-bold normal-case">VS</span>
                                        <span className="text-blue-600">{item.data.blue_corner_full_name || 'TBD'}</span>
                                        {item.data.blue_corner_club_name ? <span className="normal-case ml-1 text-gray-500">({item.data.blue_corner_club_name})</span> : null}
                                        <span className="normal-case text-gray-500"> [{item.data.id}]</span>
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {matchCat?.groupName && <span className="frvv-chip">{matchCat.groupName}</span>}
                                    {(matchCat?.name || item.data.category_name) && <span className="frvv-chip whitespace-normal break-words">{matchCat?.name || item.data.category_name}</span>}
                                    {matchCat?.gender && <span className={`border border-black px-1.5 py-0.5 text-xs text-gray-700 ${GENDER_BG[matchCat.gender] || 'bg-gray-100'}`}>{String(genderLabels[matchCat.gender] || matchCat.gender).toUpperCase()}</span>}
                                    {item.data.match_type && <span className="border border-black bg-yellow-100 px-1.5 py-0.5 text-xs font-semibold text-gray-800">{matchTypeLabels[item.data.match_type] || item.data.match_type}</span>}
                                  </div>
                                </>
                              );
                            })()}
                          </>
                        )}
                      </div>

                      <div className="flex w-full flex-wrap items-center gap-2 pt-1 sm:w-auto sm:pt-0">
                        {/* URMEAZĂ badge */}
                        {idx === nextItemIndex && !isActiveItem && item.status !== 'completed' && (
                          <span className="shrink-0 border border-black bg-yellow-300 px-2.5 py-1 text-xs font-bold uppercase text-black">Urmează</span>
                        )}

                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500">
                          Programare teren
                        </span>

                        {/* Status dropdown */}
                        <select
                          value={item.status || 'not_started'}
                          onChange={async e => {
                            const newStatus = e.target.value;
                            // If changing FROM completed, ask for confirmation
                            if (item.status === 'completed' && newStatus !== 'completed') {
                              setStatusConfirmData({ item, newStatus });
                              e.target.value = 'completed'; // reset select visually
                              return;
                            }
                            // If setting to in_progress, also start the session on this field
                            if (newStatus === 'in_progress') {
                              for (const si of scheduleItems) {
                                if (si === item || si.type === 'break' || si.status !== 'in_progress') continue;
                                try {
                                  if (si.type === 'category') await fieldAPI.assignments.update(si.assignmentId, { status: 'not_started' });
                                  else await matchFieldAssignmentAPI.update(si.assignmentId, { status: 'not_started' });
                                } catch {}
                              }
                              // Sync session — start displaying this item
                              const catId = item.type === 'category' ? item.id : null;
                              const matchId = item.type === 'match' ? item.id : null;
                              await switchDisplay(catId, matchId, null);
                            }
                            // If setting to not_started and this item was active, idle the session
                            if (newStatus === 'not_started' && isActiveItem) {
                              await setIdle();
                            }
                            if (item.type === 'category') updateAssignmentStatus(item.assignmentId, newStatus);
                            else updateMatchAssignmentStatus(item.assignmentId, newStatus);
                          }}
                          disabled={busy}
                          className={`w-full cursor-pointer px-2.5 py-1.5 text-xs font-bold uppercase sm:w-auto ${st.badge}`}
                          onClick={e => e.stopPropagation()}
                          title="Statusul de programare pentru teren: nu schimbă singur toate datele interne ale meciului."
                          aria-label="Status programare teren"
                        >
                          <option value="not_started">Neînceput</option>
                          <option value="in_progress">Activ</option>
                          <option value="completed">Finalizat</option>
                        </select>

                        {/* VEZI DETALII — always shown */}
                        <button
                          onClick={() => goFullscreen(item.type === 'category' ? 'category' : 'match', item.id)}
                          className={`w-full border px-4 py-2 text-sm font-bold sm:w-auto ${
                            item.status === 'completed'
                              ? 'border-black bg-white text-gray-400 hover:bg-gray-50'
                              : 'border-black bg-yellow-100 text-gray-700 hover:bg-yellow-200'
                          }`}
                        >VEZI DETALII</button>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
      </div>

      {/* ── Status change from Finalizat confirmation modal ── */}
      {statusConfirmData && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setStatusConfirmData(null)}>
          <div className="w-full max-w-sm overflow-hidden border-2 border-black bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="border-b-2 border-black bg-yellow-300 px-5 py-4 text-center">
              <h3 className="text-lg font-black text-gray-900">Schimbi statusul?</h3>
            </div>
            <div className="px-5 py-4 text-center">
              <p className="text-sm text-gray-700">
                Status nou: <span className="font-bold text-gray-900">{statusConfirmData.newStatus === 'not_started' ? 'Neînceput' : 'Activ'}</span>
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t-2 border-black bg-gray-50 px-5 py-4 sm:flex-row">
              <button
                onClick={() => setStatusConfirmData(null)}
                className="flex-1 border border-black bg-white px-4 py-3 text-base font-bold text-gray-700 transition hover:bg-yellow-100"
              >
                Anulează
              </button>
              <button
                onClick={async () => {
                  const { item, newStatus } = statusConfirmData;
                  setStatusConfirmData(null);
                  if (item.type === 'category') updateAssignmentStatus(item.assignmentId, newStatus);
                  else updateMatchAssignmentStatus(item.assignmentId, newStatus);
                }}
                className="flex-1 border border-black bg-yellow-300 px-4 py-3 text-base font-bold text-black transition hover:bg-yellow-200"
              >
                Schimbă
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

