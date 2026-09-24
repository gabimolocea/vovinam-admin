import React, { useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CentralizatorContext, GENDER_BG } from './CategoriesLayout';
import {
  fieldAPI, monitorAPI, matchAPI,
  matchFieldAssignmentAPI, matchEventAPI, fieldBreakAPI,
  matchRefereeScoreAPI,
} from '@shared/lib/api';
import { formatGroupBadgeLabel } from '../components/ui';

/* ═══════════════════════════════════════════════════════
   LIVE PAGE — Competition Management during the event
   ═══════════════════════════════════════════════════════ */

const STATUS_CFG = {
  not_started:  { label: 'Neînceput',      dot: 'bg-muted-foreground/40',  bg: 'bg-card',  border: 'border-border', badge: 'rounded-md border border-border bg-muted text-muted-foreground' },
  in_progress:  { label: 'În desfășurare', dot: 'bg-emerald-500 animate-pulse', bg: 'bg-emerald-50 dark:bg-emerald-950/20', border: 'border-emerald-300 dark:border-emerald-800', badge: 'rounded-md border border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' },
  completed:    { label: 'Finalizat',      dot: 'bg-slate-400',  bg: 'bg-muted',  border: 'border-border', badge: 'rounded-md border border-border bg-muted text-foreground' },
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
      <div className="flex-1 flex items-center justify-center bg-background text-muted-foreground text-sm">
        Se încarcă datele live...
      </div>
    );
  }

  if (fields.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background p-4 text-center text-sm text-muted-foreground">
                Nu exista tatami-uri configurate. Mergi la tab-ul Programare.
      </div>
    );
  }

  const displayedFields = fields;
  const isSingle = false;

  return (
    <div className={`flex-1 overflow-auto bg-background ${isSingle ? 'flex flex-col p-2 gap-2' : 'p-3'}`}>
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
  const [scheduleTab, setScheduleTab] = useState('active'); // 'active' | 'completed'

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

  const goFullscreen = (panelType, itemId) => {
    let targetPanel = panelType;
    let targetId = itemId;

    // Lupta se conduce pe meci, nu pe categorie - panoul de categorie nu
    // are ce arata pentru ea si iesea un ecran gol. Deschidem meciul:
    // primul neterminat de pe acest teren, altfel ultimul.
    if (panelType === 'category') {
      const category = allCats.find(c => c.id === itemId);
      if (category?.type === 'fight') {
        const onThisField = (matchAssignments || [])
          .filter(a => a.field === field.id)
          .map(a => matches.find(m => m.id === a.match))
          .filter(m => m && m.category === itemId);
        const target = onThisField.find(m => m.status !== 'completed') || onThisField[onThisField.length - 1];
        if (target) {
          targetPanel = 'match';
          targetId = target.id;
        }
      }
    }

    navigate(`/competitions/${eventId}/live-fullscreen?field=${field.id}&panel=${targetPanel}${targetId ? `&id=${targetId}` : ''}`);
  };

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
  // Breaks aren't a real per-item status - keep them visible alongside
  // whatever's still ahead rather than stranding them in "Finalizate".
  const activeScheduleItems = scheduleItems.filter(i => i.status !== 'completed');
  const completedScheduleItems = scheduleItems.filter(i => i.status === 'completed');
  const visibleScheduleItems = scheduleTab === 'completed' ? completedScheduleItems : activeScheduleItems;

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
  // `nextItemIndex` is an index into the full `scheduleItems` array, but the
  // list now renders `visibleScheduleItems` (filtered by tab) - compare by
  // identity instead of index so "next up" highlighting still lines up.
  const nextItem = nextItemIndex >= 0 ? scheduleItems[nextItemIndex] : null;

  return (
    <div className={`overflow-hidden rounded-lg border-2 border-border bg-card shadow-sm ${singleView ? 'flex min-h-0 flex-1 flex-col' : ''}`}>
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center gap-3 border-b border-border bg-card px-3 py-2 shrink-0">
        <span className="text-sm font-bold uppercase tracking-wide text-foreground">{field.name}</span>
        {!isIdle && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {session?.status === 'scores_revealed' ? 'Scoruri afișate' : 'În desfășurare'}
            </span>
          </span>
        )}
      </div>

      {/* ═══ BODY: Schedule / Programa (full width) ═══ */}
      <div className={`${singleView ? 'flex-1 min-h-0 overflow-y-auto' : ''} bg-muted/30`}>
          <div className="sticky top-0 z-10 flex border-b-2 border-border bg-card">
            {[
              { key: 'active', label: 'În curs', count: activeScheduleItems.length },
              { key: 'completed', label: 'Finalizate', count: completedScheduleItems.length },
            ].map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setScheduleTab(tab.key)}
                className={`flex-1 border-b-2 px-3 py-2 text-xs font-bold uppercase tracking-wide transition ${
                  scheduleTab === tab.key
                    ? 'border-primary text-primary'
                    : '-mb-0.5 border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
          <div className="p-2 space-y-1.5">
            {visibleScheduleItems.length === 0 && (
              <p className="text-sm text-muted-foreground italic text-center py-6">
                {scheduleTab === 'completed' ? 'Nicio probă finalizată.' : <>Nicio probă alocată.<br/>Mergi la Programare.</>}
              </p>
            )}
            {visibleScheduleItems.map((item) => {
              const isActiveItem = (item.type === 'category' && session?.current_category === item.id && !session?.current_match)
                || (item.type === 'match' && session?.current_match === item.id);
              const st = STATUS_CFG[item.status] || STATUS_CFG.not_started;

              return (
                <React.Fragment key={`${item.type}-${item.id}`}>
                  {item.type === 'break' ? (
                    /* ─── Break item ─── */
                    <div className="flex items-center gap-2 rounded-md border border-dashed border-border bg-card px-3 py-2 text-sm text-foreground">
                      <span className="text-base font-medium text-muted-foreground">&bull;</span>
                      <span className="flex-1 font-semibold">{item.data?.label || 'Pauză'}</span>
                      <span className="text-xs text-muted-foreground">{item.data?.duration || 60}s</span>
                    </div>
                  ) : (
                    /* ─── Category / Match item ─── */
                    <div
                      onClick={() => goFullscreen(item.type, item.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goFullscreen(item.type, item.id); } }}
                      className={`flex cursor-pointer flex-wrap items-center gap-2 rounded-md border px-3 py-2 transition hover:shadow-md ${
                      item.status === 'completed'
                        ? 'border-border bg-muted opacity-60'
                        : isActiveItem
                          ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-300 shadow-sm dark:border-emerald-700 dark:bg-emerald-950/20'
                          : item === nextItem
                            ? st.border + ' bg-card shadow-sm'
                            : st.border + ' ' + st.bg + ' hover:shadow-sm'
                    }`}
                    >

                      {/* Status dot */}
                      <span className={`h-3.5 w-3.5 shrink-0 rounded-full ${item.status === 'completed' ? 'bg-muted-foreground/40' : st.dot}`} />

                      {/* Name + info */}
                      <div className="flex-1 min-w-0">
                        {item.type === 'category' ? (
                          <>
                            <span className="block text-sm font-bold text-foreground md:text-base whitespace-normal break-words">{item.data.name}</span>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {item.data.groupName && <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground">{item.data.groupName}</span>}
                              {item.data.gender && <span className={`rounded border border-border px-1.5 py-0.5 text-xs text-foreground/80 ${GENDER_BG[item.data.gender] || 'bg-muted'}`}>{String(genderLabels[item.data.gender] || item.data.gender).toUpperCase()}</span>}
                              {(() => {
                                const isTeamCat = item.data.type === 'team';
                                const count = isTeamCat ? (item.data.enrolled_teams?.length || 0) : (item.data.enrolled_athletes?.length || 0);
                                return (
                                  <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                                    {count} {isTeamCat ? `echip${count === 1 ? 'ă' : 'e'}` : `sportiv${count !== 1 ? 'i' : ''}`}
                                  </span>
                                );
                              })()}
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
                                        {item.data.red_corner_club_name ? <span className="normal-case ml-1 text-muted-foreground">({item.data.red_corner_club_name})</span> : null}
                                        <span className="text-muted-foreground/60 mx-1 font-bold normal-case">VS</span>
                                        <span className="text-blue-600">{item.data.blue_corner_full_name || 'TBD'}</span>
                                        {item.data.blue_corner_club_name ? <span className="normal-case ml-1 text-muted-foreground">({item.data.blue_corner_club_name})</span> : null}
                                        <span className="normal-case text-muted-foreground"> [{item.data.id}]</span>
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {matchCat?.groupName && <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground">{matchCat.groupName}</span>}
                                    {(matchCat?.name || item.data.category_name) && <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground whitespace-normal break-words">{matchCat?.name || item.data.category_name}</span>}
                                    {matchCat?.gender && <span className={`rounded border border-border px-1.5 py-0.5 text-xs text-foreground/80 ${GENDER_BG[matchCat.gender] || 'bg-muted'}`}>{String(genderLabels[matchCat.gender] || matchCat.gender).toUpperCase()}</span>}
                                    {item.data.match_type && <span className="rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{matchTypeLabels[item.data.match_type] || item.data.match_type}</span>}
                                  </div>
                                </>
                              );
                            })()}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
      </div>
    </div>
  );
}

