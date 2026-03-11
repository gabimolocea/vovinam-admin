import React, { useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  eventAPI,
  fieldAPI, monitorAPI, roundAPI, matchAPI, scoreAPI,
  matchRefereeScoreAPI, matchFieldAssignmentAPI, refereeAPI,
  categoryRefereeAssignmentAPI, matchEventAPI, fieldBreakAPI,
  matchRefereeAssignmentAPI, groupAPI, categoryAPI, enrollmentAPI,
  competitionRefereeAPI, refereePresenceAPI, recordingAPI, scoreTimelineAPI,
} from '@shared/lib/api';
import { formatGroupBadgeLabel } from '@shared/components/ui';
import { GENDER_BG, GENDER_LABELS } from './CategoriesLayout';
import { useDisplayPreview } from '../contexts/DisplayPreviewContext';

/* ═══════════════════════════════════════════════════════
   LIVE FULLSCREEN PAGE — full-screen view for a field
   panel (category or match), accessible via /competitions/:id/live-fullscreen
   ═══════════════════════════════════════════════════════ */

const PUBLIC_DISPLAY_PORT = 5177;
const formatFieldLabel = (name = '') => String(name).replace(/\bfield\b/gi, 'TEREN').replace(/\btatami\b/gi, 'TEREN').toUpperCase();
const CATEGORY_TYPE_BADGES = {
  solo: { label: 'Solo', bg: 'border border-black bg-yellow-300 text-black' },
  team: { label: 'Echipă', bg: 'border border-black bg-yellow-300 text-black' },
  teams: { label: 'Echipă', bg: 'border border-black bg-yellow-300 text-black' },
  fight: { label: 'Luptă', bg: 'border border-black bg-yellow-300 text-black' },
};
const TOPNAV_SECONDARY_BUTTON = 'text-sm border border-black bg-white px-4 py-2 font-medium text-gray-700 transition hover:bg-yellow-100 hover:text-black disabled:opacity-40';
const MODAL_SECONDARY_BUTTON = 'border border-black bg-white px-4 py-2.5 font-semibold text-gray-700 transition hover:bg-yellow-100 hover:text-black disabled:opacity-40';
const MODAL_DANGER_BUTTON = 'border border-black bg-red-600 px-4 py-2.5 font-bold text-white transition hover:bg-red-700 disabled:opacity-40';
const MODAL_SUCCESS_BUTTON = 'border border-black bg-green-600 px-4 py-2.5 font-bold text-white transition hover:bg-green-700 disabled:opacity-40';
const MODAL_WARNING_BUTTON = 'border border-black bg-yellow-300 px-4 py-2.5 font-bold text-black transition hover:bg-yellow-200 disabled:opacity-40';
const PANEL_BUTTON_BASE = 'border border-black px-3 py-2 font-bold transition disabled:opacity-40';
const PANEL_BUTTON_NEUTRAL = `${PANEL_BUTTON_BASE} bg-white text-gray-700 hover:bg-yellow-100 hover:text-black`;
const PANEL_BUTTON_DANGER = `${PANEL_BUTTON_BASE} bg-white text-red-700 hover:bg-red-100`;
const PANEL_BUTTON_SUCCESS = `${PANEL_BUTTON_BASE} bg-white text-green-700 hover:bg-green-100`;
const PANEL_BUTTON_WARNING = `${PANEL_BUTTON_BASE} bg-yellow-300 text-black hover:bg-yellow-200`;
const TOPNAV_REC_BUTTON = 'flex items-center gap-2 border bg-white px-4 py-2 text-sm font-bold uppercase tracking-[0.14em] transition disabled:opacity-40';
const ROUND_CARD_SHELL = 'flex flex-col gap-4 border-2 border-black bg-white px-4 py-4';
const ROUND_BODY_PANEL = 'bg-white px-4 py-4';
const ROUND_SECONDARY_BUTTON = 'border border-black px-3 py-2 text-sm font-semibold text-gray-600 transition hover:bg-yellow-100 hover:text-black disabled:opacity-40';

const readCachedCategoryData = (eventId) => {
  if (!eventId || typeof window === 'undefined') return { groups: [], categories: [] };
  try {
    const groups = JSON.parse(sessionStorage.getItem(`competition-admin:groups:${eventId}`) || '[]');
    const categories = JSON.parse(sessionStorage.getItem(`competition-admin:categories:${eventId}`) || '[]');
    return {
      groups: Array.isArray(groups) ? groups : [],
      categories: Array.isArray(categories) ? categories : [],
    };
  } catch {
    return { groups: [], categories: [] };
  }
};

const buildCategoriesWithGroups = (categories, groups) => {
  const groupMap = new Map((groups || []).map(group => [group.id, group]));
  return (categories || []).map(category => ({
    ...category,
    groupName: formatGroupBadgeLabel(groupMap.get(category.group), category),
  }));
};

const writeCachedCategoryData = (eventId, groups, categories) => {
  if (!eventId || typeof window === 'undefined') return;
  sessionStorage.setItem(`competition-admin:groups:${eventId}`, JSON.stringify(groups || []));
  sessionStorage.setItem(`competition-admin:categories:${eventId}`, JSON.stringify(categories || []));
};

export default function LiveFullscreenPage() {
  const { id: eventId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fieldId = Number(searchParams.get('field'));
  const panelType = searchParams.get('panel'); // 'category' | 'match'
  const itemId = Number(searchParams.get('id')); // category or match ID
  const preview = useDisplayPreview();
  const cachedCategoryDataRef = useRef(readCachedCategoryData(eventId));

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
  const [groups, setGroups] = useState(cachedCategoryDataRef.current.groups);
  const [allCats, setAllCats] = useState(buildCategoriesWithGroups(cachedCategoryDataRef.current.categories, cachedCategoryDataRef.current.groups));
  const [competitionReferees, setCompetitionReferees] = useState([]);
  const [refPresence, setRefPresence] = useState([]);
  const [recordingSessions, setRecordingSessions] = useState([]);
  const [categoryScoreEvents, setCategoryScoreEvents] = useState([]);
  const [matchPointEvents, setMatchPointEvents] = useState([]);
  const [eventState, setEventState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showResetCategoryConfirm, setShowResetCategoryConfirm] = useState(false);
  const [showStopCategoryConfirm, setShowStopCategoryConfirm] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const pollRef = useRef(null);

  const arr = r => r.data?.results || r.data || [];

  // Full initial load — called once
  const fetchData = useCallback(async () => {
    if (!eventId) return;
    try {
      const hasCachedCategories = cachedCategoryDataRef.current.categories.length > 0;
      const requests = [
        eventAPI.get(eventId),
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
        competitionRefereeAPI.list({ event_id: eventId }),
        refereePresenceAPI.list({ event_id: eventId }),
        recordingAPI.sessions.list({ event_id: eventId }),
        scoreTimelineAPI.categoryRefereeEvents.list({ event_id: eventId }),
      ];

      if (!hasCachedCategories) {
        requests.push(groupAPI.list({ event_id: eventId }));
        requests.push(categoryAPI.list({ event_id: eventId }));
      }

      const responses = await Promise.all(requests);
      const [eventR, fR, sR, caR, maR, mR, rR, rsR, mrsR, asR, raR, meR, mraR, crR, rpR, recR, catEvR, gR, cR] = responses;
      setEventState(eventR?.data || null);
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
      setCompetitionReferees(arr(crR));
      setRefPresence(arr(rpR));
      setRecordingSessions(arr(recR));
      setCategoryScoreEvents(arr(catEvR));

      if (gR && cR) {
        const rawGroups = arr(gR);
        const rawCategories = arr(cR);
        cachedCategoryDataRef.current = { groups: rawGroups, categories: rawCategories };
        writeCachedCategoryData(eventId, rawGroups, rawCategories);
        setGroups(rawGroups);
        setAllCats(buildCategoriesWithGroups(rawCategories, rawGroups));
      }
    } catch (err) {
      console.error('Fullscreen fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  // Lightweight fetch — only scores + sessions (polled every 2s)
  const fetchMatchState = useCallback(async () => {
    if (!eventId) return;
    try {
      const requests = [monitorAPI.sessions.list({ event_id: eventId })];

      if (panelType === 'category' && itemId) {
        requests.push(categoryAPI.get(itemId));
        requests.push(refereeAPI.categoryScores.list({ category: itemId }));
        requests.push(scoreAPI.list({ category: itemId }));
        requests.push(refereePresenceAPI.list({ category: itemId }));
        requests.push(categoryRefereeAssignmentAPI.list({ event_id: eventId }));
        requests.push(scoreTimelineAPI.categoryRefereeEvents.list({ category: itemId }));
        requests.push(recordingAPI.sessions.list({ event_id: eventId, field_id: fieldId }));
      } else if (panelType === 'match' && itemId) {
        requests.push(matchAPI.get(itemId));
        requests.push(roundAPI.list({ match_id: itemId }));
        requests.push(matchRefereeScoreAPI.list({ match_id: itemId }));
        requests.push(matchEventAPI.list({ match_id: itemId }));
        requests.push(matchRefereeAssignmentAPI.list({ match_id: itemId }));
        requests.push(refereeAPI.pointEvents.list(itemId));
        requests.push(recordingAPI.sessions.list({ event_id: eventId, field_id: fieldId }));
      }

      const responses = await Promise.all(requests);
      const [sR, secondR, thirdR, fourthR] = responses;
      setSessions(arr(sR));
      if (panelType === 'category' && itemId) {
        const categoryPayload = secondR?.data;
        if (categoryPayload) {
          setAllCats(prev => prev.map(cat => cat.id === itemId ? {
            ...categoryPayload,
            groupName: prev.find(existing => existing.id === itemId)?.groupName || '',
          } : cat));
        }
        setRefScores(arr(thirdR));
        setAthleteScores(arr(fourthR));
        setRefPresence(arr(responses[4]));
        setRefAssignments(arr(responses[5]));
        setCategoryScoreEvents(arr(responses[6]));
        setRecordingSessions(arr(responses[7]));
      } else if (panelType === 'match' && itemId) {
        const matchPayload = secondR?.data;
        if (matchPayload) {
          setMatches(prev => prev.map(match => match.id === itemId ? matchPayload : match));
        }
        setRounds(arr(thirdR));
        setMatchRefScores(arr(fourthR));
        setMatchEvents(arr(responses[4]));
        setMatchRefAssignments(arr(responses[5]));
        setMatchPointEvents(arr(responses[6]));
        setRecordingSessions(arr(responses[7]));
      }
    } catch (err) {
      console.error('Match state fetch error:', err);
    }
  }, [eventId, fieldId, itemId, panelType]);

  // Targeted category refresh (for DQ status updates etc.)
  const refreshCategories = useCallback(async () => {
    if (!eventId) return;
    try {
      const [cR, gR] = await Promise.all([
        categoryAPI.list({ event_id: eventId }),
        groupAPI.list({ event_id: eventId }),
      ]);
      const rawGroups = arr(gR);
      const rawCategories = arr(cR);
      cachedCategoryDataRef.current = { groups: rawGroups, categories: rawCategories };
      writeCachedCategoryData(eventId, rawGroups, rawCategories);
      setGroups(rawGroups);
      setAllCats(buildCategoriesWithGroups(rawCategories, rawGroups));
    } catch (err) {
      console.error('Category refresh error:', err);
    }
  }, [eventId]);

  useEffect(() => {
    fetchData();
    if (eventId) preview.loadFields(eventId);
    pollRef.current = setInterval(fetchMatchState, 2000);
    return () => clearInterval(pollRef.current);
  }, [fetchData, fetchMatchState]);

  // NOTE: No auto-idle on unmount — navigating back keeps display visible on public screen

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

  const currentCat = fieldCats.find(c => c.id === session?.current_category)
    || (panelType === 'category' && itemId ? allCats.find(c => c.id === itemId) : null);
  const currentMatch = fieldMatches.find(m => m.id === session?.current_match)
    || matches.find(m => m.id === session?.current_match)
    || (panelType === 'match' && itemId ? matches.find(m => m.id === itemId) : null);
  const currentFieldRecordingSession = recordingSessions.find(rs => rs.field === fieldId && rs.status === 'recording')
    || recordingSessions.find(rs => rs.field === fieldId)
    || null;
  const currentCategoryRefAssignment = currentCat
    ? refAssignments.find(ra => ra.category === currentCat.id)
    : null;
  const currentCategoryAthleteScores = currentCat
    ? athleteScores.filter(as => as.category === currentCat.id)
    : [];
  const isSessionActive = panelType === 'category'
    ? !!(session && session.current_category === (currentCat?.id) && session.status !== 'idle')
    : !!(session && session.current_match === (currentMatch?.id) && session.status !== 'idle');
  const currentAssignment = panelType === 'category'
    ? catAssignments.find(a => a.field === fieldId && a.category === currentCat?.id)
    : matchAssignments.find(a => a.field === fieldId && a.match === currentMatch?.id);
  const matchRoundsForMatch = currentMatch
    ? rounds.filter(r => r.match === currentMatch.id).sort((a, b) => a.round_number - b.round_number)
    : [];
  const activeRound = matchRoundsForMatch.find(r => r.status === 'active');
  const requiredCategoryRefCount = currentCategoryRefAssignment
    ? [1, 2, 3, 4, 5].filter(i => currentCategoryRefAssignment[`referee_${i}`]).length || 5
    : 5;
  const activeCategoryEnrollments = currentCat?.type === 'team'
    ? (currentCat?.enrolled_teams || []).filter(e => !e.disqualified)
    : (currentCat?.enrolled_athletes || []).filter(e => !e.disqualified);
  const isCurrentCategoryCompleted = !!currentCat
    && activeCategoryEnrollments.length > 0
    && activeCategoryEnrollments.every(e => {
      const athleteScore = currentCat?.type === 'team'
        ? currentCategoryAthleteScores.find(as => {
            const scoreMembers = Array.isArray(as.team_members) ? as.team_members.map(member => member.id) : [];
            const enrolledMembers = Array.isArray(e.members) ? e.members.map(member => member.id) : [];
            return scoreMembers.length > 0 && scoreMembers.length === enrolledMembers.length
              && scoreMembers.every(memberId => enrolledMembers.includes(memberId));
          })
        : currentCategoryAthleteScores.find(as => (as.athlete?.id ?? as.athlete) === (e.athlete?.id ?? e.athlete));
      if (!athleteScore) return false;
      const refereeScoreCount = refScores.filter(rs => rs.athlete_score === athleteScore.id).length;
      return refereeScoreCount >= requiredCategoryRefCount;
    });
  const isCurrentMatchFinalized = !!currentMatch
    && (currentMatch.status === 'completed' || currentAssignment?.status === 'completed');
  const isCurrentCategoryFinalized = !!currentCat
    && currentAssignment?.status === 'completed';
  const operationalLockActive = Boolean(eventState?.operational_lock_active);
  const operationalLockMessage = eventState?.operational_lock_active
    ? 'Evenimentul este blocat pentru operare locală. Pentru modificări live, lucrează din copia locală/LAN a competiției sau finalizează sincronizarea în cloud.'
    : '';

  const ensureOperationalWrite = useCallback(() => {
    if (!operationalLockActive) return true;
    window.alert(operationalLockMessage);
    return false;
  }, [operationalLockActive, operationalLockMessage]);

  const isRecordingActive = currentFieldRecordingSession?.status === 'recording';
  const [recordingElapsedSeconds, setRecordingElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!currentFieldRecordingSession?.started_at) {
      setRecordingElapsedSeconds(0);
      return;
    }

    const computeElapsed = () => {
      if (currentFieldRecordingSession?.computed_duration_seconds != null && !isRecordingActive) {
        return Number(currentFieldRecordingSession.computed_duration_seconds) || 0;
      }
      const startedAtMs = new Date(currentFieldRecordingSession.started_at).getTime();
      if (Number.isNaN(startedAtMs)) return 0;
      const endMs = !isRecordingActive && currentFieldRecordingSession?.ended_at
        ? new Date(currentFieldRecordingSession.ended_at).getTime()
        : Date.now();
      return Math.max(0, Math.floor((endMs - startedAtMs) / 1000));
    };

    setRecordingElapsedSeconds(computeElapsed());
    if (!isRecordingActive) return;

    const intervalId = window.setInterval(() => {
      setRecordingElapsedSeconds(computeElapsed());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [currentFieldRecordingSession, isRecordingActive]);

  const recordingTimerLabel = `REC ${String(Math.floor(recordingElapsedSeconds / 60)).padStart(2, '0')}:${String(recordingElapsedSeconds % 60).padStart(2, '0')}`;

  // ── API helpers ──
  const wrap = fn => async (...a) => {
    if (!ensureOperationalWrite()) return;
    setBusy(true);
    try {
      await fn(...a);
      await fetchMatchState();
    } catch (e) {
      console.error(e);
      window.alert(e?.response?.data?.error || e?.response?.data?.detail || 'Operația nu a putut fi salvată.');
    }
    setBusy(false);
  };

  const switchDisplay = wrap(async (catId, matchId, athleteId, status = 'displaying') => {
    const data = { current_category: catId || null, current_match: matchId || null, current_athlete: athleteId || null, status };
    if (session) await monitorAPI.sessions.update(session.id, data);
    else await monitorAPI.sessions.create({ field: fieldId, ...data });
  });
  const startRecordingSession = async ({ auto = false } = {}) => {
    if (isRecordingActive || !ensureOperationalWrite()) return;
    setBusy(true);
    try {
      await recordingAPI.sessions.create({
        event: Number(eventId),
        field: fieldId,
        title: `${formatFieldLabel(field?.name || `Teren ${fieldId}`)} live recording`,
        status: 'recording',
        started_at: new Date().toISOString(),
        obs_scene_name: formatFieldLabel(field?.name || `Teren ${fieldId}`),
        metadata: {
          panel: panelType,
          panel_id: itemId,
          started_automatically: auto,
        },
      });
      await fetchMatchState();
    } catch (e) {
      console.error(e);
      window.alert('Nu s-a putut porni sesiunea de înregistrare.');
    }
    setBusy(false);
  };
  const stopRecordingSession = async ({ auto = false } = {}) => {
    if (!currentFieldRecordingSession || currentFieldRecordingSession.status !== 'recording' || !ensureOperationalWrite()) return;
    setBusy(true);
    try {
      await recordingAPI.sessions.stop(currentFieldRecordingSession.id, {
        ended_at: new Date().toISOString(),
        status: 'stopped',
        metadata: {
          ...(currentFieldRecordingSession.metadata || {}),
          stopped_automatically: auto,
        },
      });
      await fetchMatchState();
    } catch (e) {
      console.error(e);
      window.alert('Nu s-a putut opri sesiunea de înregistrare.');
    }
    setBusy(false);
  };
  const setIdle = () => switchDisplay(null, null, null, 'idle');
  const revealScores = () => {
    if (session) switchDisplay(session.current_category, session.current_match, session.current_athlete, 'scores_revealed');
  };
  const revealDecisions = () => {
    if (session) switchDisplay(session.current_category, session.current_match, session.current_athlete, 'decisions_revealed');
  };
  const revealWinner = async () => {
    if (!ensureOperationalWrite()) return;
    if (session) {
      await switchDisplay(session.current_category, session.current_match, session.current_athlete, 'winner_revealed');
      // Auto-finalize the match when winner is revealed
      const currentMatchId = session.current_match;
      if (currentMatchId) {
        try {
          await matchAPI.update(currentMatchId, { status: 'completed' });
          await matchAPI.advanceWinner(currentMatchId).catch((e) => {
            console.error('Advance winner error:', e);
          });
          await fetchMatchState();
        } catch (e) { console.error('Auto-finalize error:', e); }
      }
    }
  };
  const startRound  = wrap(async id => { await roundAPI.update(id, { status: 'active', started_at: new Date().toISOString() }); });
  const endRound    = wrap(async id => { await roundAPI.update(id, { status: 'completed', ended_at: new Date().toISOString() }); });
  const resetRound  = wrap(async id => { await roundAPI.update(id, { status: 'scheduled', started_at: null, ended_at: null, paused_at: null, accumulated_pause_seconds: 0, extra_seconds: 0 }); });
  const createRounds = wrap(async (matchId, n = 3, dur = 120) => {
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
    if (m) {
      await matchAPI.update(matchId, { red_corner: m.blue_corner, blue_corner: m.red_corner });
      await fetchData();
    }
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
      try { await roundAPI.delete(r.id); } catch {}
    }
    const evts = matchEvents.filter(e => e.match === matchId);
    for (const ev of evts) {
      try { await matchEventAPI.delete(ev.id); } catch {}
    }
    try { await refereeAPI.pointEvents.clear(matchId); } catch {}
    // Also delete all referee scores for this match
    const scores = matchRefScores.filter(s => s.match === matchId);
    for (const sc of scores) {
      try { await matchRefereeScoreAPI.delete(sc.id); } catch {}
    }
    // Reset match status back to scheduled
    await matchAPI.update(matchId, { status: 'scheduled' });
    // Reset display/session state if this match is currently shown
    if (session?.current_match === matchId) {
      if (session) {
        await monitorAPI.sessions.update(session.id, {
          current_category: null,
          current_match: null,
          current_athlete: null,
          status: 'idle',
        });
      }
    }
    // Reset field assignment state too
    if (currentAssignment?.match === matchId) {
      try { await matchFieldAssignmentAPI.update(currentAssignment.id, { status: 'not_started' }); } catch {}
    }
    await fetchData();
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

  const finishAndReturnToSchedule = async () => {
    setShowFinishConfirm(false);
    if (panelType === 'match' && currentMatch) {
      await stopRecordingSession({ auto: true });
      setIdle();
      if (currentAssignment) {
        setBusy(true);
        try { await matchFieldAssignmentAPI.update(currentAssignment.id, { status: 'completed' }); await fetchMatchState(); } catch(e) { console.error(e); }
        setBusy(false);
      }
      goBack();
      return;
    }

    if (panelType === 'category' && currentCat && currentCat.type !== 'fight') {
      await stopRecordingSession({ auto: true });
      setIdle();
      if (currentAssignment) {
        setBusy(true);
        try { await fieldAPI.assignments.update(currentAssignment.id, { status: 'completed' }); await fetchMatchState(); } catch(e) { console.error(e); }
        setBusy(false);
      }
      goBack();
    }
  };

  return (
    <div className="frvv-live-fullscreen h-screen w-screen flex flex-col overflow-hidden bg-white">
      {/* ── Top bar ── */}
      <div className="shrink-0 border-b-2 border-yellow-400 bg-black px-3 py-3 text-white sm:px-4 lg:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <button onClick={goBack} className={TOPNAV_SECONDARY_BUTTON}><span className="inline-block mr-1">&larr;</span> Inapoi</button>
          <span className="text-xl font-black uppercase tracking-wide text-yellow-200">{formatFieldLabel(field.name)}</span>
          {/* Live indicator in top nav */}
          {isSessionActive && (
            <span className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full  bg-green-400 opacity-75"></span>
                <span className="relative inline-flex  h-3 w-3 bg-green-500"></span>
              </span>
              <span className="text-sm font-semibold text-green-400 uppercase">Live</span>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {/* Match control buttons in top nav */}
          {panelType === 'match' && currentMatch && (
            <button onClick={() => setShowResetConfirm(true)} disabled={busy} className={TOPNAV_SECONDARY_BUTTON}>Reset</button>
          )}
          {panelType === 'match' && currentMatch && isSessionActive && (
            <>
              <button onClick={() => setShowStopConfirm(true)} disabled={busy} className={TOPNAV_SECONDARY_BUTTON}>Opreste</button>
            </>
          )}
          {/* START / ÎNCHEIE for matches */}
          {panelType === 'match' && currentMatch && !isSessionActive && (
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={async () => {
                  await startRecordingSession({ auto: true });
                  await switchDisplay(currentMatch.category, currentMatch.id, null);
                  if (currentAssignment) {
                    setBusy(true);
                    try { await matchFieldAssignmentAPI.update(currentAssignment.id, { status: 'in_progress' }); await fetchMatchState(); } catch(e) { console.error(e); }
                    setBusy(false);
                  }
                }}
                disabled={busy || isCurrentMatchFinalized}
                title="Butonul pornește proba doar dacă atât statusul logic al meciului, cât și statusul din programarea terenului nu sunt finalizate."
                className={`text-sm bg-green-600 hover:bg-green-700 text-white px-5 py-2 font-bold disabled:opacity-40 transition ${isCurrentMatchFinalized ? '' : 'ring-4 ring-green-300 animate-pulse'}`}
              >START PROBA</button>
            </div>
          )}
          {panelType === 'match' && currentMatch && isSessionActive && (
            <button
              onClick={() => setShowFinishConfirm(true)}
              disabled={busy}
              className={`text-sm border border-black bg-green-600 px-5 py-2 font-bold text-white disabled:opacity-40 transition hover:bg-green-700 ${session?.current_match === currentMatch.id && session?.status === 'winner_revealed' ? 'ring-4 ring-green-300 animate-pulse' : ''}`}
            >ÎNCHEIE PROBA</button>
          )}
          {/* Category control buttons in top nav */}
          {panelType === 'category' && currentCat && currentCat.type !== 'fight' && (
            <button onClick={() => setShowResetCategoryConfirm(true)} disabled={busy} className={TOPNAV_SECONDARY_BUTTON}>Reset</button>
          )}
          {/* START / ÎNCHEIE for categories */}
          {panelType === 'category' && currentCat && currentCat.type !== 'fight' && !isSessionActive && (
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={async () => {
                  await startRecordingSession({ auto: true });
                  await switchDisplay(currentCat.id, null, null);
                  if (currentAssignment) {
                    setBusy(true);
                    try { await fieldAPI.assignments.update(currentAssignment.id, { status: 'in_progress' }); await fetchMatchState(); } catch(e) { console.error(e); }
                    setBusy(false);
                  }
                }}
                disabled={busy || isCurrentCategoryFinalized}
                title="Pentru probele tehnice, startul este controlat de statusul din programarea terenului."
                className="text-sm bg-green-600 hover:bg-green-700 text-white px-5 py-2 font-bold disabled:opacity-40 transition"
              >START PROBA</button>
            </div>
          )}
          {panelType === 'category' && currentCat && currentCat.type !== 'fight' && isSessionActive && (
            <button
              onClick={() => setShowFinishConfirm(true)}
              disabled={busy}
              className={`text-sm border border-black bg-green-600 px-5 py-2 font-bold text-white disabled:opacity-40 transition hover:bg-green-700 ${isCurrentCategoryCompleted ? 'ring-4 ring-green-300 animate-pulse' : ''}`}
            >ÎNCHEIE PROBA</button>
          )}
          <a href={`http://localhost:${PUBLIC_DISPLAY_PORT}/display/${fieldId}`} target="_blank" rel="noopener noreferrer"
            className={`${TOPNAV_SECONDARY_BUTTON} text-center`}>
            Public Display
          </a>
          <button
            onClick={() => (isRecordingActive ? stopRecordingSession() : startRecordingSession())}
            disabled={busy}
            className={`${TOPNAV_REC_BUTTON} ${isRecordingActive ? 'border-red-500 text-black shadow-[0_0_0_2px_rgba(239,68,68,0.35)]' : 'border-black text-black hover:bg-red-50'}`}
            title={isRecordingActive ? 'Oprește înregistrarea' : 'Pornește înregistrarea'}
          >
            <span className={`relative inline-flex h-3 w-3 rounded-full ${isRecordingActive ? 'bg-red-500' : 'bg-red-500'}`}>
              {isRecordingActive ? <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-75" /> : null}
            </span>
            <span>{recordingTimerLabel}</span>
          </button>
          <button
            onClick={() => preview.togglePreview(fieldId)}
            className={`text-sm px-4 py-2 font-medium transition border border-black ${preview.isOpen(fieldId) ? 'bg-yellow-300 hover:bg-yellow-200 text-black' : 'bg-white hover:bg-yellow-100 text-gray-700'}`}
          >
            {preview.isOpen(fieldId) ? 'Ascunde preview' : 'Preview'}
          </button>
        </div>
        </div>
      </div>

      {/* Reset match confirm (parent level) */}
      {showResetConfirm && currentMatch && (
        <FullscreenModal
          onClose={() => setShowResetConfirm(false)}
          title="Reset meci"
          description="Ești sigur că vrei să resetezi tot meciul? Toate reprizele, evenimentele și scorurile vor fi șterse."
          actions={[
            <button key="cancel" onClick={() => setShowResetConfirm(false)} className={MODAL_SECONDARY_BUTTON}>Anulează</button>,
            <button key="confirm" onClick={async () => { setShowResetConfirm(false); await resetMatch(currentMatch.id); }} disabled={busy} className={MODAL_DANGER_BUTTON}>Resetează tot</button>,
          ]}
        />
      )}

      {/* Stop match confirm (parent level) */}
      {showStopConfirm && (
        <FullscreenModal
          onClose={() => setShowStopConfirm(false)}
          title="Oprește meciul"
          description="Afișarea meciului va fi oprită și ecranul va reveni la starea de așteptare, fără să se piardă datele deja salvate."
          actions={[
            <button key="cancel" onClick={() => setShowStopConfirm(false)} className={MODAL_SECONDARY_BUTTON}>Anulează</button>,
            <button
              key="confirm"
              onClick={async () => {
                setShowStopConfirm(false);
                setIdle();
                if (currentAssignment) {
                  setBusy(true);
                  try { await matchFieldAssignmentAPI.update(currentAssignment.id, { status: 'not_started' }); await fetchMatchState(); } catch(e) { console.error(e); }
                  setBusy(false);
                }
              }}
              disabled={busy}
              className={MODAL_DANGER_BUTTON}
            >
              Oprește
            </button>,
          ]}
        />
      )}

      {/* Finish panel confirm */}
      {showFinishConfirm && ((panelType === 'match' && currentMatch) || (panelType === 'category' && currentCat && currentCat.type !== 'fight')) && (
        <FullscreenModal
          onClose={() => setShowFinishConfirm(false)}
          title="Datele au fost salvate"
          description="Toate datele pentru această probă sunt salvate. Vrei să închei proba și să revii la programă?"
          icon="✓"
          actions={[
            <button key="cancel" onClick={() => setShowFinishConfirm(false)} className={MODAL_SECONDARY_BUTTON}>Anulează</button>,
            <button key="confirm" onClick={finishAndReturnToSchedule} disabled={busy} className={MODAL_SUCCESS_BUTTON}>Revenire la programă</button>,
          ]}
        />
      )}

      {/* Reset category confirm */}
      {showResetCategoryConfirm && currentCat && (
        <FullscreenModal
          onClose={() => setShowResetCategoryConfirm(false)}
          title="Reset probă"
          description="Toate scorurile arbitrilor pentru această probă vor fi șterse. Acțiunea este ireversibilă."
          actions={[
            <button key="cancel" onClick={() => setShowResetCategoryConfirm(false)} className={MODAL_SECONDARY_BUTTON}>Anulează</button>,
            <button
              key="confirm"
              onClick={async () => {
                setShowResetCategoryConfirm(false);
                setBusy(true);
                try {
                  setIdle();
                  if (currentAssignment) {
                    try { await fieldAPI.assignments.update(currentAssignment.id, { status: 'not_started' }); } catch {}
                  }
                  const catScores = refScores.filter(rs => {
                    const as = athleteScores.find(a => a.id === rs.athlete_score);
                    return as && as.category === currentCat.id;
                  });
                  for (const s of catScores) { try { await refereeAPI.categoryScores.delete(s.id); } catch {} }
                  await fetchMatchState();
                } catch(e) { console.error(e); }
                setBusy(false);
              }}
              disabled={busy}
              className={MODAL_DANGER_BUTTON}
            >
              Resetează tot
            </button>,
          ]}
        />
      )}

      {/* Stop category confirm */}
      {showStopCategoryConfirm && (
        <FullscreenModal
          onClose={() => setShowStopCategoryConfirm(false)}
          title="Oprește proba"
          description="Proba va fi scoasă din ecranul live și se va reveni la ecranul de așteptare. Scorurile rămân salvate."
          actions={[
            <button key="cancel" onClick={() => setShowStopCategoryConfirm(false)} className={MODAL_SECONDARY_BUTTON}>Anulează</button>,
            <button
              key="confirm"
              onClick={async () => {
                setShowStopCategoryConfirm(false);
                setIdle();
                if (currentAssignment) {
                  setBusy(true);
                  try { await fieldAPI.assignments.update(currentAssignment.id, { status: 'not_started' }); await fetchMatchState(); } catch(e) { console.error(e); }
                  setBusy(false);
                }
              }}
              disabled={busy}
              className={MODAL_DANGER_BUTTON}
            >
              Oprește
            </button>,
          ]}
        />
      )}

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 overflow-auto px-3 py-3 sm:px-4 lg:px-6">
        {operationalLockActive && (
          <div className="mb-4 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {operationalLockMessage}
          </div>
        )}
        {panelType === 'category' && currentCat && currentCat.type !== 'fight' ? (
          <FullscreenCategoryPanel
            cat={currentCat}
            session={isSessionActive ? session : null}
            refAssignment={currentCategoryRefAssignment}
            athleteScores={currentCategoryAthleteScores}
            refScores={refScores}
            refPresence={refPresence.filter(rp => rp.category === currentCat.id)}
            competitionReferees={competitionReferees}
            recordingSession={currentFieldRecordingSession}
            busy={busy}
            setBusy={setBusy}
            switchDisplay={switchDisplay}
            setIdle={setIdle}
            revealScores={revealScores}
            onRefresh={fetchMatchState}
            refreshCategories={refreshCategories}
          />
        ) : panelType === 'match' && currentMatch ? (
          <FullscreenMatchPanel
            match={currentMatch}
            session={session}
            matchRounds={matchRoundsForMatch}
            activeRound={activeRound}
            matchRefScores={matchRefScores.filter(s => s.match === currentMatch.id)}
            matchEvents={matchEvents.filter(e => e.match === currentMatch.id)}
            pointEvents={matchPointEvents.filter(event => event.match === currentMatch.id)}
            matchRefAssignment={matchRefAssignments.find(a => a.match === currentMatch.id)}
            allCats={allCats}
            busy={busy}
            setBusy={setBusy}
            competitionReferees={competitionReferees}
            recordingSession={currentFieldRecordingSession}
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
            operationalLockActive={operationalLockActive}
            operationalLockMessage={operationalLockMessage}
            ensureOperationalWrite={ensureOperationalWrite}
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
function FullscreenCategoryPanel({ cat, session, refAssignment, athleteScores, refScores, refPresence, competitionReferees, recordingSession, busy, setBusy, switchDisplay, setIdle, revealScores, onRefresh, refreshCategories }) {
  const isTeamCategory = cat.type === 'team';
  const enrolled = isTeamCategory ? (cat.enrolled_teams || []) : (cat.enrolled_athletes || []);

  // Modal state for admin score input per referee
  const [catRefModalData, setCatRefModalData] = useState(null); // { refId, refName, refPos, athleteId, athleteName, athleteScoreId, currentScore, existingScoreId }
  const [catScoreInput, setCatScoreInput] = useState('');
  const [finishedAthletes, setFinishedAthletes] = useState(new Set());
  const [resetConfirmData, setResetConfirmData] = useState(null);
  const [dqConfirmData, setDqConfirmData] = useState(null);
  const [revealConfirmData, setRevealConfirmData] = useState(null); // { athleteId, athleteName, row }
  const [replaceRefData, setReplaceRefData] = useState(null); // { pos, id, name }
  const [replacementRefId, setReplacementRefId] = useState('');

  // Build referee list from category referee assignment
  const referees = [];
  if (refAssignment) {
    for (let i = 1; i <= 5; i++) {
      const id = refAssignment[`referee_${i}`];
      const name = refAssignment[`referee_${i}_name`];
      if (id) referees.push({ pos: i, id, name: name || `A${i}` });
    }
  }
  const refSlots = [1, 2, 3, 4, 5].map(i => {
    const id = refAssignment?.[`referee_${i}`] || null;
    const name = refAssignment?.[`referee_${i}_name`] || null;
    return { pos: i, id, name: name || null };
  });
  const refCols = refSlots;

  const resolveTeamScore = (teamEnrollment) => {
    const teamMemberIds = (teamEnrollment.members || []).map(member => member.id).sort((a, b) => a - b);
    return athleteScores.find(score => {
      const scoreMemberIds = (score.team_members || []).map(member => member.id).sort((a, b) => a - b);
      return score.type === 'teams'
        && scoreMemberIds.length > 0
        && scoreMemberIds.length === teamMemberIds.length
        && scoreMemberIds.every((memberId, index) => memberId === teamMemberIds[index]);
    });
  };

  // Build rows with scores per referee
  const rows = enrolled.map(ea => {
    const athleteId = isTeamCategory ? (ea.members?.[0]?.id ?? ea.team) : ea.athlete;
    const d = ea.athlete_details || {};
    const teamMembersLabel = (ea.members || []).map(member => member.name).filter(Boolean).join(' & ');
    const athleteName = isTeamCategory
      ? (ea.team_name || teamMembersLabel || `#${ea.team}`)
      : (`${d.last_name || ''} ${d.first_name || ''}`.trim() || `#${athleteId}`);
    const clubName = isTeamCategory ? (ea.club_name || '') : (d.club_name || '');
    const detailText = isTeamCategory ? teamMembersLabel : '';
    const catScore = isTeamCategory
      ? resolveTeamScore(ea)
      : athleteScores.find(as => (as.athlete?.id ?? as.athlete) === athleteId);
    const catScoreId = catScore?.id;
    const rScores = catScoreId ? refScores.filter(rs => rs.athlete_score === catScoreId) : [];
    const scoreByRef = {};
    const scoreIdByRef = {};
    for (const rs of rScores) { scoreByRef[rs.referee] = rs.score; scoreIdByRef[rs.referee] = rs.id; }
    const vals = refCols.map(r => r.id ? scoreByRef[r.id] : undefined);
    const scoreIds = refCols.map(r => r.id ? scoreIdByRef[r.id] : undefined);
    const numericVals = vals.filter(v => v != null).map(Number);
    const totalRefCount = referees.length || 5;
    let marks = vals.map(() => 'mid');
    let total = null;
    if (numericVals.length >= 3) {
      const sorted = [...numericVals].sort((a, b) => a - b);
      const low = sorted[0]; const high = sorted[sorted.length - 1];
      let foundLow = false, foundHigh = false;
      marks = vals.map(v => { if (v == null) return 'empty'; const n = Number(v); if (!foundLow && n === low) { foundLow = true; return 'low'; } if (!foundHigh && n === high) { foundHigh = true; return 'high'; } return 'mid'; });
      total = sorted.slice(1, -1).reduce((s, v) => s + v, 0);
    } else if (numericVals.length > 0) { total = numericVals.reduce((s, v) => s + v, 0); }
    const allScoresIn = numericVals.length >= totalRefCount;
    const isActive = session?.current_athlete === athleteId;
    const isRevealed = isActive && session?.status === 'scores_revealed';
    return { athleteId, athleteName, clubName, detailText, vals, marks, total, allScoresIn, scoreCount: numericVals.length, isActive, isRevealed, scoreIds, catScoreId, enrollmentId: ea.id, isDisqualified: ea.disqualified || false, teamId: isTeamCategory ? ea.team : null };
  });

  // Sort by total descending for ranking
  const sortedRows = [...rows].filter(r => r.total != null && !r.isDisqualified).sort((a, b) => (b.total || 0) - (a.total || 0));
  const getRank = (athleteId) => { const idx = sortedRows.findIndex(r => r.athleteId === athleteId); return idx >= 0 ? idx + 1 : null; };

  // Check if active athlete has all scores
  const activeRow = rows.find(r => r.isActive);

  // ── Smart highlight: determine which athlete/action to suggest ──
  // Priority 1: active athlete → highlight their row & stop button
  // Priority 2: athlete with all scores ready to reveal
  // Priority 3: next athlete to present
  let highlightAthleteId = null;
  let highlightAction = null; // 'active' | 'reveal' | 'present'

  if (activeRow) {
    // Active athlete is presenting — highlight them
    if (activeRow.allScoresIn && !activeRow.isRevealed) {
      // Scores are in while presenting → suggest reveal
      highlightAthleteId = activeRow.athleteId;
      highlightAction = 'reveal';
    } else {
      highlightAthleteId = activeRow.athleteId;
      highlightAction = 'active';
    }
  } else {
    // No active athlete → check for pending reveals first
    const revealCandidate = rows.find(r => !r.isDisqualified && r.allScoresIn && !r.isRevealed && finishedAthletes.has(r.athleteId));
    if (revealCandidate) {
      highlightAthleteId = revealCandidate.athleteId;
      highlightAction = 'reveal';
    } else {
      // No pending reveal → suggest next athlete to present
      const nextCandidate = rows.find(r => !r.isDisqualified && !finishedAthletes.has(r.athleteId) && !r.isActive && !r.isRevealed);
      if (nextCandidate) {
        highlightAthleteId = nextCandidate.athleteId;
        highlightAction = 'present';
      }
    }
  }

  // Reset single athlete scores
  const resetAthleteScores = async (row) => {
    try {
      for (const sid of row.scoreIds) {
        if (sid) { try { await refereeAPI.categoryScores.delete(sid); } catch {} }
      }
      setFinishedAthletes(prev => { const s = new Set(prev); s.delete(row.athleteId); return s; });
      await onRefresh();
    } catch(e) { console.error(e); }
  };

  // Disqualify/un-disqualify athlete
  const toggleDisqualify = async (row) => {
    try {
      if (isTeamCategory) {
        await enrollmentAPI.categoryTeams.update(row.enrollmentId, { disqualified: !row.isDisqualified });
      } else {
        await enrollmentAPI.categoryAthletes.update(row.enrollmentId, { disqualified: !row.isDisqualified });
      }
      await Promise.all([onRefresh(), refreshCategories()]);
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
        const payload = {
          referee: catRefModalData.refId,
          score: val,
        };

        if (catRefModalData.athleteScoreId) {
          payload.athlete_score = catRefModalData.athleteScoreId;
        } else if (catRefModalData.teamId) {
          payload.category = cat.id;
          payload.team_id = catRefModalData.teamId;
        } else {
          payload.category = cat.id;
          payload.athlete = catRefModalData.athleteId;
        }

        await refereeAPI.categoryScores.create(payload);
      }
      setCatRefModalData(null);
      setCatScoreInput('');
      await onRefresh();
    } catch(e) {
      console.error('Failed to save category referee score', e.response?.data || e);
    }
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

  // Determine which referees are actively connected to the scoring page
  const connectedRefIds = new Set((refPresence || []).map(rp => rp.referee));

  const availableReplacementRefs = (competitionReferees || []).filter(cr => {
    const athleteId = cr.athlete;
    if (!athleteId) return false;
    if (replaceRefData && athleteId === replaceRefData.id) return true;
    return !refSlots.some(r => r.id === athleteId);
  });

  const typeBadge = CATEGORY_TYPE_BADGES[cat.type] || CATEGORY_TYPE_BADGES.solo;
  const spotlightRow = rows.find(r => r.isActive)
    || rows.find(r => highlightAthleteId === r.athleteId)
    || rows.find(r => !r.isDisqualified)
    || null;

  const renderActionButtons = (row, compact = false) => {
    const buttonBase = compact
      ? 'flex-1 min-w-[130px] px-3 py-2 text-xs'
      : 'px-4 py-2 text-sm';

    return (
      <div className={`flex items-center ${compact ? 'justify-stretch' : 'justify-center'} gap-1.5 flex-wrap`}>
        {row.isActive ? (
          <button onClick={() => { switchDisplay(cat.id, null, null); setFinishedAthletes(prev => new Set(prev).add(row.athleteId)); }} disabled={busy}
            className={`${buttonBase} border border-black font-bold disabled:opacity-40 bg-orange-500 text-white hover:bg-orange-600 whitespace-nowrap ${
              highlightAthleteId === row.athleteId && highlightAction === 'active' ? 'ring-2 ring-orange-400 ring-offset-1' : ''
            }`}>
            Oprește
          </button>
        ) : (
          <button onClick={() => switchDisplay(cat.id, null, row.athleteId)} disabled={busy}
            className={`${buttonBase} border border-black font-bold disabled:opacity-40 whitespace-nowrap ${
              highlightAthleteId === row.athleteId && highlightAction === 'present'
                ? 'bg-green-600 text-white hover:bg-green-700 ring-2 ring-green-400 ring-offset-1 animate-pulse'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}>
            Prezintă
          </button>
        )}
        {row.allScoresIn && (
          <button
            onClick={() => {
              if (row.isRevealed) return;
              setRevealConfirmData({ athleteId: row.athleteId, athleteName: row.athleteName, row });
            }}
            disabled={busy || row.isRevealed}
            className={`${buttonBase} border border-black font-bold disabled:opacity-40 whitespace-nowrap ${
              row.isRevealed
                ? 'bg-yellow-400 text-black cursor-default'
                : highlightAthleteId === row.athleteId && highlightAction === 'reveal'
                  ? 'bg-yellow-400 text-black hover:bg-yellow-500 ring-2 ring-yellow-500 ring-offset-1 animate-pulse'
                  : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
            }`}
          >
            {row.isRevealed ? '✓ Scor afișat' : 'Afișează scorul'}
          </button>
        )}
        {row.scoreCount > 0 && (
          <button
            onClick={() => setResetConfirmData({ athleteId: row.athleteId, athleteName: row.athleteName, row })}
            disabled={busy}
            className={`${buttonBase} border border-black font-bold bg-white text-red-700 hover:bg-red-100 disabled:opacity-40 whitespace-nowrap`}
          >
            Resetează
          </button>
        )}
        <button
          onClick={() => setDqConfirmData({ athleteId: row.athleteId, athleteName: row.athleteName, row, isDisqualified: row.isDisqualified })}
          disabled={busy}
          className={`${buttonBase} border border-black font-bold disabled:opacity-40 whitespace-nowrap ${row.isDisqualified ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-red-600 text-white hover:bg-red-700'}`}
        >
          {row.isDisqualified ? 'Recalifică' : 'DQ'}
        </button>
      </div>
    );
  };

  const replaceReferee = async () => {
    if (!replaceRefData) return;
    const fieldName = `referee_${replaceRefData.pos}`;
    setBusy(true);
    try {
      const payload = {
        category: cat.id,
        [fieldName]: replacementRefId ? Number(replacementRefId) : null,
      };
      if (refAssignment?.id) {
        await categoryRefereeAssignmentAPI.update(refAssignment.id, payload);
      } else {
        await categoryRefereeAssignmentAPI.create(payload);
      }
      setReplaceRefData(null);
      setReplacementRefId('');
      await onRefresh();
      await refreshCategories();
    } catch (e) {
      console.error(e);
      alert('Nu s-a putut înlocui arbitrul.');
    }
    setBusy(false);
  };

  return (
    <div className="flex w-full flex-col gap-4">
      {/* ── Category info header (like match info tags) ── */}
      <div className="bg-white">
        <div className="flex flex-col gap-4 p-4 xl:grid xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:items-center xl:gap-6 xl:p-5">
          <div className="hidden xl:block" aria-hidden="true" />
          <div className="min-w-0 xl:col-start-2">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-full max-w-3xl px-4 py-5">
                <h1 className="mt-2 break-words text-3xl font-black leading-tight text-gray-900 sm:text-4xl">{cat.name}</h1>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <span className={`inline-flex px-2 py-1 text-xs font-bold uppercase ${typeBadge.bg}`}>{typeBadge.label}</span>
                  {cat.gender && <span className={`inline-flex border border-black px-2 py-1 text-xs font-bold text-gray-800 ${GENDER_BG[cat.gender] || 'bg-gray-100'}`}>{GENDER_LABELS[cat.gender] || cat.gender}</span>}
                  {cat.groupName && <span className="inline-flex border border-black bg-white px-2 py-1 text-xs font-medium text-gray-700">{cat.groupName}</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="w-full xl:col-start-3 xl:justify-self-end xl:max-w-md">
            <>
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600">Arbitri</span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
                {refSlots.map(r => {
                  const isConnected = r.id ? connectedRefIds.has(r.id) : false;
                  const isEmpty = !r.id;
                  return (
                    <button
                      key={r.pos}
                      type="button"
                      onClick={() => {
                        setReplaceRefData(r);
                        setReplacementRefId(r.id ? String(r.id) : '');
                      }}
                      className={`flex w-full items-center gap-2 border px-3 py-2 text-left text-xs font-medium transition hover:shadow-sm ${isEmpty ? 'border-dashed border-black bg-white text-gray-500 hover:bg-gray-50' : isConnected ? 'border-black bg-emerald-100 text-emerald-900 hover:bg-emerald-200' : 'border-black bg-white text-gray-700 hover:bg-yellow-100'}`}
                      title={isEmpty ? 'Adaugă arbitru' : 'Înlocuiește arbitrul'}
                    >
                      <span className={`inline-block h-2.5 w-2.5 shrink-0 ${isEmpty ? 'bg-gray-200' : isConnected ? 'bg-emerald-500' : 'bg-gray-400'}`}></span>
                      <span className="font-black text-black">A{r.pos}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{r.name || 'Adaugă arbitru'}</span>
                    </button>
                  );
                })}
              </div>
            </>
          </div>
        </div>
      </div>

      {/* ── Referee replacement modal ── */}
      {replaceRefData && (
        <FullscreenModal
          onClose={() => { setReplaceRefData(null); setReplacementRefId(''); }}
          title={replaceRefData.id ? `Înlocuiește arbitrul A${replaceRefData.pos}` : `Adaugă arbitru pe poziția A${replaceRefData.pos}`}
          description={`Arbitrul curent: ${replaceRefData.name || 'niciun arbitru'}`}
          actions={[
            <button key="cancel" onClick={() => { setReplaceRefData(null); setReplacementRefId(''); }} className={MODAL_SECONDARY_BUTTON}>Anulează</button>,
            <button key="confirm" onClick={replaceReferee} disabled={busy || (replacementRefId && Number(replacementRefId) === replaceRefData.id)} className={MODAL_SUCCESS_BUTTON}>{replacementRefId ? (replaceRefData.id ? 'Înlocuiește' : 'Adaugă') : 'Elimină arbitrul'}</button>,
          ]}
        >
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">Alege alt arbitru</label>
            <select
              value={replacementRefId}
              onChange={e => setReplacementRefId(e.target.value)}
              className="w-full border-2 border-black bg-white px-4 py-3 text-base font-medium outline-none focus:border-yellow-400"
            >
              <option value="">Fără arbitru</option>
              {availableReplacementRefs.map(ref => (
                <option key={ref.id} value={ref.athlete}>
                  {ref.athlete_name}{ref.club_name ? ` — ${ref.club_name}` : ''}
                </option>
              ))}
            </select>
          </div>
        </FullscreenModal>
      )}

      {/* ── Admin referee score input modal ── */}
      {catRefModalData && (
        <FullscreenModal
          onClose={() => { setCatRefModalData(null); setCatScoreInput(''); }}
          title={`A${catRefModalData.refPos} — ${catRefModalData.refName}`}
          description={`Scor pentru ${catRefModalData.athleteName}`}
          maxWidth="max-w-sm"
          actions={[
            <button key="close" onClick={() => { setCatRefModalData(null); setCatScoreInput(''); }} className={MODAL_SECONDARY_BUTTON}>Închide</button>,
            catRefModalData.existingScoreId ? <button key="delete" onClick={deleteCatRefScore} className={MODAL_DANGER_BUTTON}>Șterge</button> : null,
            <button key="save" onClick={submitCatRefScore} disabled={!catScoreInput || isNaN(parseFloat(catScoreInput)) || parseFloat(catScoreInput) < 0 || parseFloat(catScoreInput) > 100} className={MODAL_SUCCESS_BUTTON}>{catRefModalData.existingScoreId ? 'Actualizează' : 'Salvează'}</button>,
          ].filter(Boolean)}
        >
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">Scor (0 – 100)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={catScoreInput}
              onChange={e => setCatScoreInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitCatRefScore(); }}
              autoFocus
              className="w-full border-2 border-black px-4 py-3 text-center text-2xl font-black tabular-nums outline-none focus:border-yellow-400"
              placeholder="ex: 85"
            />
          </div>
        </FullscreenModal>
      )}

      {/* ── Reset confirmation modal ── */}
      {resetConfirmData && (
        <FullscreenModal
          onClose={() => setResetConfirmData(null)}
          title="Confirmă resetarea"
          description={`Ești sigur că vrei să resetezi toate scorurile pentru ${resetConfirmData.athleteName}?`}
          actions={[
            <button key="cancel" onClick={() => setResetConfirmData(null)} className={MODAL_SECONDARY_BUTTON}>Anulează</button>,
            <button key="confirm" onClick={() => { resetAthleteScores(resetConfirmData.row); setResetConfirmData(null); }} className={MODAL_DANGER_BUTTON}>Da, resetează</button>,
          ]}
        />
      )}

      {/* ── DQ confirmation modal ── */}
      {dqConfirmData && (
        <FullscreenModal
          onClose={() => setDqConfirmData(null)}
          title={dqConfirmData.isDisqualified ? 'Recalifică participantul' : 'Descalifică participantul'}
          description={dqConfirmData.isDisqualified
            ? `Ești sigur că vrei să recalifici participantul ${dqConfirmData.athleteName}?`
            : `Ești sigur că vrei să descalifici participantul ${dqConfirmData.athleteName}? Acesta va fi exclus din clasament.`}
          actions={[
            <button key="cancel" onClick={() => setDqConfirmData(null)} className={MODAL_SECONDARY_BUTTON}>Anulează</button>,
            <button key="confirm" onClick={() => { toggleDisqualify(dqConfirmData.row); setDqConfirmData(null); }} className={dqConfirmData.isDisqualified ? MODAL_SUCCESS_BUTTON : MODAL_DANGER_BUTTON}>{dqConfirmData.isDisqualified ? 'Da, recalifică' : 'Da, descalifică'}</button>,
          ]}
        />
      )}

      {/* ── Reveal scores confirmation modal ── */}
      {revealConfirmData && (
        <FullscreenModal
          onClose={() => setRevealConfirmData(null)}
          title="Afișează scorurile public?"
          description={`Scorurile pentru ${revealConfirmData.athleteName} vor fi afișate pe ecranul public pentru spectatori.`}
          icon="?"
          actions={[
            <button key="cancel" onClick={() => setRevealConfirmData(null)} className={MODAL_SECONDARY_BUTTON}>Nu, anulează</button>,
            <button key="confirm" onClick={() => { switchDisplay(cat.id, null, revealConfirmData.athleteId, 'scores_revealed'); setRevealConfirmData(null); }} className={MODAL_WARNING_BUTTON}>Da, afișează</button>,
          ]}
        />
      )}

      {/* ── Athletes table — all participants ── */}
      <div className="overflow-hidden border-2 border-black bg-white shadow-sm">
        <div className="border-b-2 border-black bg-gray-100 px-4 py-3">
          <p className="text-sm font-bold uppercase tracking-wide text-gray-700">{isTeamCategory ? `Toate echipele (${enrolled.length})` : `Toți sportivii (${enrolled.length})`}</p>
        </div>
        <div className="space-y-3 p-3 lg:hidden">
          {rows.map((row, idx) => {
            const rank = getRank(row.athleteId);
            return (
              <div
                key={row.athleteId}
                className={`border-2 p-3 shadow-sm ${
                  row.isDisqualified
                    ? 'border-red-300 bg-red-50/70 opacity-70'
                    : row.isRevealed
                      ? 'border-yellow-400 bg-yellow-50'
                      : row.isActive
                        ? 'border-green-500 bg-green-50'
                        : highlightAthleteId === row.athleteId && highlightAction === 'present'
                          ? 'border-green-300 bg-green-50/60'
                          : 'border-black bg-white'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded border border-black bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-700">#{idx + 1}</span>
                      {rank && (
                        <span className={`inline-flex rounded border border-black px-2 py-0.5 text-[11px] font-bold ${rank === 1 ? 'bg-yellow-200 text-yellow-900' : rank === 2 ? 'bg-gray-200 text-gray-700' : rank === 3 ? 'bg-orange-100 text-orange-700' : 'bg-white text-gray-600'}`}>
                          Loc {rank}
                        </span>
                      )}
                      {row.isDisqualified && <span className="inline-flex rounded border border-red-700 bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Descalificat</span>}
                      {!row.isDisqualified && finishedAthletes.has(row.athleteId) && !row.isActive && <span className="inline-flex rounded border border-black bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-700">Terminat</span>}
                      {row.isActive && <span className="inline-flex rounded border border-green-700 bg-green-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Prezintă acum</span>}
                      {row.isRevealed && <span className="inline-flex rounded border border-yellow-500 bg-yellow-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">Scor afișat</span>}
                    </div>
                    <p className={`mt-2 break-words text-base font-black ${row.isDisqualified ? 'text-red-500 line-through' : 'text-gray-900'}`}>{row.athleteName}</p>
                    {row.clubName && <p className="mt-0.5 text-sm text-gray-500">{row.clubName}</p>}
                    {row.detailText && row.detailText !== row.athleteName && <p className="mt-0.5 text-xs text-gray-400">{row.detailText}</p>}
                  </div>
                  <div className="rounded border-2 border-black bg-yellow-50 px-3 py-2 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Total</p>
                    <p className="text-lg font-black text-gray-900 tabular-nums">{row.total != null ? Math.round(row.total) : '—'}</p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                  {refCols.map((r, ri) => {
                    const value = row.vals[ri];
                    const mark = row.marks[ri];
                    const isCancelled = mark === 'low' || mark === 'high';
                    return (
                      <button
                        key={`${row.athleteId}-${r.pos}`}
                        type="button"
                        onClick={() => {
                          if (!r.id) return;
                          setCatRefModalData({
                            refId: r.id, refName: r.name, refPos: r.pos,
                            athleteId: row.athleteId, athleteName: row.athleteName,
                            teamId: row.teamId || null,
                            athleteScoreId: row.catScoreId || null,
                            currentScore: value != null ? Number(value) : null,
                            existingScoreId: row.scoreIds[ri] || null,
                          });
                          setCatScoreInput(value != null ? Number(value).toString() : '');
                        }}
                        disabled={!r.id}
                        className={`rounded border px-3 py-2 text-left transition ${!r.id ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-300' : 'border-black bg-white hover:bg-yellow-50'} ${isCancelled ? 'line-through' : ''}`}
                      >
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">A{r.pos}</p>
                        <p className={`mt-1 text-lg font-black tabular-nums ${value != null ? (isCancelled ? 'text-red-400' : 'text-gray-900') : 'text-gray-300'}`}>{value != null ? Math.round(Number(value)) : '—'}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3">
                  {renderActionButtons(row, true)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-10 border border-black bg-gray-200 px-3 py-2.5 text-left font-bold uppercase tracking-wide text-gray-700">#</th>
                <th className="border border-black bg-gray-200 px-3 py-2.5 text-left font-bold uppercase tracking-wide text-gray-700">{isTeamCategory ? 'Echipă' : 'Sportiv'}</th>
                <th className="w-48 border border-black bg-gray-200 px-3 py-2.5 text-left font-bold uppercase tracking-wide text-gray-700">Club</th>
                {refCols.map(r => (<th key={r.pos} className="w-16 border border-black bg-gray-200 px-2 py-2.5 text-center font-bold uppercase tracking-wide text-gray-700">A{r.pos}</th>))}
                <th className="w-20 border border-black bg-gray-200 px-3 py-2.5 text-center font-bold uppercase tracking-wide text-gray-700">Total</th>
                <th className="w-16 border border-black bg-gray-200 px-2 py-2.5 text-center font-bold uppercase tracking-wide text-gray-700">Loc</th>
                <th className="min-w-[360px] border border-black bg-gray-200 px-2 py-2.5 text-center font-bold uppercase tracking-wide text-gray-700">Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const rank = getRank(row.athleteId);
                return (
                  <tr key={row.athleteId} className={`${
                    row.isDisqualified ? 'bg-red-50 opacity-60' : row.isRevealed ? 'bg-yellow-50 ring-2 ring-yellow-300 ring-inset' : row.isActive ? 'bg-green-50 ring-2 ring-green-500 ring-inset border-l-4 border-l-green-600' : highlightAthleteId === row.athleteId && highlightAction === 'present' ? 'bg-green-50/50 ring-1 ring-green-200 ring-inset' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                  } hover:bg-yellow-50/50 transition`}>
                    <td className="border border-black/20 px-3 py-2.5 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="border border-black/20 px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-semibold ${row.isDisqualified ? 'text-red-400 line-through' : 'text-gray-900'}`}>{row.athleteName}</span>
                        {row.isDisqualified && <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider bg-red-600 text-white px-2 py-0.5">DESCALIFICAT</span>}
                        {!row.isDisqualified && finishedAthletes.has(row.athleteId) && !row.isActive && <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider bg-gray-200 text-gray-600 px-2 py-0.5">✓ Terminat</span>}
                        {row.isActive && <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-green-500 text-white px-2 py-0.5 animate-pulse">● Prezintă acum</span>}
                        {row.isRevealed && <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-yellow-400 text-black px-2 py-0.5">✓ Scor afișat</span>}
                      </div>
                      {row.detailText && row.detailText !== row.athleteName && <div className="mt-1 text-xs text-gray-400">{row.detailText}</div>}
                    </td>
                    <td className="border border-black/20 px-3 py-2.5 text-sm text-gray-700">
                      {row.clubName || '—'}
                    </td>
                    {row.vals.map((v, ri) => {
                      const r = refCols[ri];
                      const mark = row.marks[ri]; const isCancelled = mark === 'low' || mark === 'high';
                      return (
                        <td key={ri}
                          onClick={() => {
                            if (!r.id) return;
                            setCatRefModalData({
                              refId: r.id, refName: r.name, refPos: r.pos,
                              athleteId: row.athleteId, athleteName: row.athleteName,
                              teamId: row.teamId || null,
                              athleteScoreId: row.catScoreId || null,
                              currentScore: v != null ? Number(v) : null,
                              existingScoreId: row.scoreIds[ri] || null,
                            });
                            setCatScoreInput(v != null ? Number(v).toString() : '');
                          }}
                          className={`border border-black/20 text-center px-2 py-2.5 tabular-nums text-sm cursor-pointer hover:bg-indigo-50 ${isCancelled ? 'text-red-400 line-through' : v != null ? 'text-gray-900 font-medium' : 'text-gray-300'}`}
                        >
                          {v != null ? Math.round(Number(v)) : '—'}
                        </td>
                      );
                    })}
                    <td className="border border-black/20 text-center px-3 py-2.5 font-bold text-gray-900 tabular-nums">{row.total != null ? Math.round(row.total) : '—'}</td>
                    <td className="border border-black/20 text-center px-2 py-2.5">
                      {rank && rank <= 3 ? (
                        <span className={`text-xs font-black px-2 py-0.5 ${rank === 1 ? 'bg-yellow-100 text-yellow-700' : rank === 2 ? 'bg-gray-200 text-gray-600' : 'bg-orange-100 text-orange-600'}`}>{rank}</span>
                      ) : rank ? <span className="text-xs text-gray-400">{rank}</span> : '—'}
                    </td>
                    <td className="border border-black/20 px-2 py-2.5">
                      {renderActionButtons(row)}
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
  match, session, matchRounds, activeRound, matchRefScores, matchEvents, pointEvents,
  matchRefAssignment, allCats, busy, setBusy, competitionReferees, recordingSession, setIdle, startRound, endRound, resetRound, createRounds,
  pauseRound, resumeRound, addWarning, addPenalty, addBonus, addInfraction, addDisqualification,
  removeLastEvent, adjustTime, resetMatch, finalizeMatch, revealDecisions, revealWinner, switchDisplay, swapCorners, setDecision, onRefresh,
  operationalLockActive, operationalLockMessage, ensureOperationalWrite,
}) {
  const [showRoundResetConfirm, setShowRoundResetConfirm] = useState(null); // round id
  const [showStopRoundConfirm, setShowStopRoundConfirm] = useState(null); // round id for stop confirm
  const [showWinnerConfirm, setShowWinnerConfirm] = useState(false);
  const [breakTimers, setBreakTimers] = useState({});
  const [refModalData, setRefModalData] = useState(null); // { ref, matchId }
  const [replaceMatchRefData, setReplaceMatchRefData] = useState(null); // { pos, id, name }
  const [replacementMatchRefId, setReplacementMatchRefId] = useState('');
  const [matchDisplayMode, setMatchDisplayMode] = useState(match.display_mode || 'reveal_final');
  const prevRoundStatusRef = useRef({});

  // Build referee list from match referee assignment
  const matchRefSlots = [1, 2, 3, 4, 5].map(i => {
    const id = matchRefAssignment?.[`referee_${i}`] || null;
    const name = matchRefAssignment?.[`referee_${i}_name`] || null;
    return { pos: i, id, name: name || null };
  });
  const matchReferees = [];
  matchRefSlots.forEach(ref => { if (ref.id) matchReferees.push(ref); });

  const availableMatchReplacementRefs = (competitionReferees || []).filter(cr => {
    const athleteId = cr.athlete;
    if (!athleteId) return false;
    if (replaceMatchRefData && athleteId === replaceMatchRefData.id) return true;
    return !matchRefSlots.some(r => r.id === athleteId);
  });

  const replaceMatchReferee = async () => {
    if (!replaceMatchRefData) return;
    if (!ensureOperationalWrite()) return;
    const fieldName = `referee_${replaceMatchRefData.pos}`;
    const payload = {
      match: match.id,
      [fieldName]: replacementMatchRefId ? Number(replacementMatchRefId) : null,
    };
    setBusy(true);
    try {
      if (matchRefAssignment?.id) {
        await matchRefereeAssignmentAPI.update(matchRefAssignment.id, payload);
      } else {
        await matchRefereeAssignmentAPI.create(payload);
      }
      setReplaceMatchRefData(null);
      setReplacementMatchRefId('');
      await onRefresh();
    } catch (e) {
      console.error(e);
      alert('Nu s-a putut actualiza arbitrul.');
    }
    setBusy(false);
  };

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
  const isMatchDisplayStarted = session?.current_match === match.id && session?.status !== 'idle';
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
  const settingsLocked = matchStarted || isMatchDisplayStarted || isMatchFinalized;
  const operationalSettingsLocked = settingsLocked || operationalLockActive;
  const selectedRoundPreset = useMemo(() => {
    if (!matchRounds.length) return null;
    const allTwoMinutes = matchRounds.every((round) => Number(round.duration_seconds) === 120);
    if (allTwoMinutes && matchRounds.length === 3) return '3x2';
    if (allTwoMinutes && matchRounds.length === 2) return '2x2';
    if (matchRounds.length === 3) return '3x2';
    if (matchRounds.length === 2) return '2x2';
    return 'custom';
  }, [matchRounds]);
  const isThreeRoundPreset = selectedRoundPreset === '3x2';

  useEffect(() => {
    setMatchDisplayMode(match.display_mode || 'reveal_final');
  }, [match.display_mode, match.id]);

  useEffect(() => {
    if (!session || session.current_match !== match.id || !allRoundsCompleted) return;

    if (matchDisplayMode === 'real_time' && session.status === 'displaying') {
      revealDecisions();
      return;
    }

    if (matchDisplayMode === 'reveal_final' && session.status === 'decisions_revealed') {
      switchDisplay(session.current_category, session.current_match, session.current_athlete, 'displaying');
    }
  }, [allRoundsCompleted, match.id, matchDisplayMode, revealDecisions, session, switchDisplay]);

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

  const updateMatchDisplayMode = async (mode) => {
    if (!mode || mode === matchDisplayMode || operationalSettingsLocked) return;
    if (!ensureOperationalWrite()) return;
    setBusy(true);
    try {
      await matchAPI.update(match.id, { display_mode: mode });
      setMatchDisplayMode(mode);
      await onRefresh();
    } catch (error) {
      console.error('Failed to update match display mode', error);
      window.alert(error?.response?.data?.detail || 'Nu s-a putut salva modul de afișare al meciului.');
    }
    setBusy(false);
  };

  const applyRoundPreset = async (roundCount) => {
    if (busy || operationalSettingsLocked) return;
    if (!ensureOperationalWrite()) return;
    setBusy(true);
    try {
      for (const round of matchRounds) {
        // eslint-disable-next-line no-await-in-loop
        await roundAPI.delete(round.id);
      }
      for (let i = 1; i <= roundCount; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await roundAPI.create({ match: match.id, round_number: i, duration_seconds: 120 });
      }
      await onRefresh();
    } catch (error) {
      console.error('Failed to apply round preset', error);
      window.alert(error?.response?.data?.detail || 'Nu s-a putut salva presetul de reprize.');
    }
    setBusy(false);
  };

  const isLiveScoringMatch = match.display_mode === 'real_time';

  const pointStatsByRef = useMemo(() => {
    const stats = {};
    const resolveRoundId = (event) => {
      const metadata = event?.metadata || {};
      if (metadata.round_id) return metadata.round_id;
      if (metadata.round) {
        return matchRounds.find(round => round.round_number === metadata.round)?.id || null;
      }
      return null;
    };

    (pointEvents || []).forEach((event) => {
      if (!event?.referee) return;
      const refereeId = event.referee;
      const roundId = resolveRoundId(event) || 'unassigned';
      const side = event.side === 'blue' ? 'blue' : 'red';
      const points = Number(event.points || 0);

      if (!stats[refereeId]) {
        stats[refereeId] = {
          rounds: {},
          totals: {
            sent: { red: 0, blue: 0 },
            validated: { red: 0, blue: 0 },
          },
        };
      }

      if (!stats[refereeId].rounds[roundId]) {
        stats[refereeId].rounds[roundId] = {
          sent: { red: 0, blue: 0 },
          validated: { red: 0, blue: 0 },
        };
      }

      stats[refereeId].rounds[roundId].sent[side] += points;
      stats[refereeId].totals.sent[side] += points;

      if (event.validation_status === 'validated') {
        stats[refereeId].rounds[roundId].validated[side] += points;
        stats[refereeId].totals.validated[side] += points;
      }
    });

    return stats;
  }, [match.display_mode, matchRounds, pointEvents]);

  const eventLogRows = useMemo(() => {
    const typeLabels = {
      warning_red: 'Avertisment Roșu',
      warning_blue: 'Avertisment Albastru',
      penalty_red: 'Penalizare Roșu',
      penalty_blue: 'Penalizare Albastru',
      bonus_red: 'Bonus Roșu',
      bonus_blue: 'Bonus Albastru',
      infraction_red: 'Abatere Roșu',
      infraction_blue: 'Abatere Albastru',
      disqualify_red: 'DESCALIFICARE Roșu',
      disqualify_blue: 'DESCALIFICARE Albastru',
      pause: 'Pauză',
      resume: 'Reluare',
      time_add: 'Timp adăugat',
      time_remove: 'Timp scăzut',
    };

    const matchEventRows = (matchEvents || []).map((ev) => {
      const isRedEvent = ev.event_type.includes('red');
      const isBlueEvent = ev.event_type.includes('blue');
      const isBonus = ev.event_type.startsWith('bonus');
      const roundNum = ev.round ? matchRounds.find(r => r.id === ev.round)?.round_number : null;
      const valueStr = ev.value ? (ev.event_type.startsWith('time') ? `${ev.value > 0 ? '+' : ''}${ev.value}s` : `${ev.value > 0 ? '+' : ''}${ev.value}p`) : '—';

      return {
        key: `match-${ev.id}`,
        timestamp: ev.created_at || null,
        time: ev.created_at ? new Date(ev.created_at).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '',
        label: typeLabels[ev.event_type] || ev.event_type_display || ev.event_type,
        sublabel: null,
        dotClass: isRedEvent ? 'bg-red-500' : isBlueEvent ? 'bg-blue-500' : 'bg-gray-400',
        labelClass: isBonus ? 'text-green-600' : isRedEvent ? 'text-red-600' : isBlueEvent ? 'text-blue-600' : 'text-gray-600',
        value: valueStr,
        valueClass: isBonus ? 'text-green-600' : ev.value < 0 ? 'text-red-600' : 'text-gray-500',
        roundLabel: roundNum ? `R${roundNum}` : '—',
      };
    });

    const pointEventRows = (pointEvents || []).map((event) => {
      const roundNum = event.metadata?.round || (event.metadata?.round_id ? matchRounds.find(r => r.id === event.metadata.round_id)?.round_number : null);
      const statusLabel = event.validation_status_label || (event.validation_status === 'pending' ? 'În așteptare' : event.validation_status === 'rejected' ? 'Respins' : 'Validat');
      const isValidated = event.validation_status === 'validated';
      const isPending = event.validation_status === 'pending';
      const isRejected = event.validation_status === 'rejected';

      return {
        key: `point-${event.id}`,
        timestamp: event.timestamp || null,
        time: event.timestamp ? new Date(event.timestamp).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '',
        label: `Punct arbitru ${event.side === 'red' ? 'Roșu' : 'Albastru'}`,
        sublabel: `${event.referee_name || `#${event.referee}`} · ${statusLabel}${event.video_offset_ms != null ? ` · ${event.video_offset_ms} ms` : ''}`,
        dotClass: event.side === 'red' ? 'bg-red-500' : 'bg-blue-500',
        labelClass: event.side === 'red' ? 'text-red-600' : 'text-blue-600',
        value: `${event.points > 0 ? '+' : ''}${event.points}p`,
        valueClass: isValidated ? 'text-green-600' : isRejected ? 'text-red-600' : isPending ? 'text-yellow-600' : 'text-gray-500',
        roundLabel: roundNum ? `R${roundNum}` : '—',
      };
    });

    return [...matchEventRows, ...pointEventRows]
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
      .slice(0, 80);
  }, [matchEvents, pointEvents, matchRounds]);

  return (
    <div className="w-full space-y-4 relative">
      {/* Reset round confirm dialog */}
      {showStopRoundConfirm && (
        <FullscreenModal
          onClose={() => setShowStopRoundConfirm(null)}
          title="Oprire repriză"
          description="Repriza va fi marcată ca finalizată și nu va mai putea fi continuată."
          actions={[
            <button key="cancel" onClick={() => setShowStopRoundConfirm(null)} className={MODAL_SECONDARY_BUTTON}>Anulează</button>,
            <button key="confirm" onClick={async () => { const roundId = showStopRoundConfirm; setShowStopRoundConfirm(null); await endRound(roundId); }} disabled={busy} className={MODAL_DANGER_BUTTON}>Oprește repriza</button>,
          ]}
        />
      )}

      {showRoundResetConfirm && (
        <FullscreenModal
          onClose={() => setShowRoundResetConfirm(null)}
          title="Reset repriză"
          description="Timpul și statusul reprizei vor fi resetate."
          actions={[
            <button key="cancel" onClick={() => setShowRoundResetConfirm(null)} className={MODAL_SECONDARY_BUTTON}>Anulează</button>,
            <button key="confirm" onClick={handleConfirmRoundReset} disabled={busy} className={MODAL_WARNING_BUTTON}>Resetează repriza</button>,
          ]}
        />
      )}

      {/* Winner reveal confirmation modal — when not all referees have submitted */}
      {showWinnerConfirm && (
        <FullscreenModal
          onClose={() => setShowWinnerConfirm(false)}
          title="Nu toți arbitrii au trimis decizia"
          description={`Doar ${matchRefScores.filter(s => s.winner_choice && s.round == null).length} din ${matchReferees.length || 5} arbitri au trimis decizia. Ești sigur că vrei să afișezi câștigătorul?`}
          actions={[
            <button key="cancel" onClick={() => setShowWinnerConfirm(false)} className={MODAL_SECONDARY_BUTTON}>Anulează</button>,
            <button key="confirm" onClick={() => { setShowWinnerConfirm(false); revealWinner(); }} disabled={busy} className={MODAL_SUCCESS_BUTTON}>Afișează câștigător</button>,
          ]}
        />
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
          <FullscreenModal
            onClose={() => setRefModalData(null)}
            title={`${ref.name} — scoruri pe reprize`}
            maxWidth="max-w-lg"
            actions={[
              <button key="close" onClick={() => setRefModalData(null)} className={MODAL_SECONDARY_BUTTON}>Închide</button>,
            ]}
          >
              {/* Scores table */}
              <table className="w-full border-collapse border-2 border-black text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-black px-3 py-2 text-left">Repriza</th>
                    <th className="border border-black px-3 py-2 text-center text-red-600">Roșu</th>
                    <th className="border border-black px-3 py-2 text-center text-blue-600">Albastru</th>
                  </tr>
                </thead>
                <tbody>
                  {matchRounds.map(r => {
                    const rs = roundScores.find(s => s.round === r.id);
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="border border-black/20 px-3 py-2 font-medium">R{r.round_number}</td>
                        <td className="border border-black/20 px-3 py-2 text-center font-bold text-red-600 tabular-nums">{rs?.red_corner_score != null ? Number(rs.red_corner_score) : '—'}</td>
                        <td className="border border-black/20 px-3 py-2 text-center font-bold text-blue-600 tabular-nums">{rs?.blue_corner_score != null ? Number(rs.blue_corner_score) : '—'}</td>
                      </tr>
                    );
                  })}
                  {adjustRed !== 0 || adjustBlue !== 0 ? (
                    <tr className="bg-gray-100 font-bold">
                      <td className="border border-black px-3 py-2">Total</td>
                      <td className="border border-black px-3 py-2 text-center text-red-700 tabular-nums">{grandTotalRedRef} <span className={`text-xs font-medium ${adjustRed > 0 ? 'text-green-600' : 'text-red-500'}`}>({adjustRed > 0 ? '+' : ''}{adjustRed})</span></td>
                      <td className="border border-black px-3 py-2 text-center text-blue-700 tabular-nums">{grandTotalBlueRef} <span className={`text-xs font-medium ${adjustBlue > 0 ? 'text-green-600' : 'text-red-500'}`}>({adjustBlue > 0 ? '+' : ''}{adjustBlue})</span></td>
                    </tr>
                  ) : (
                    <tr className="bg-gray-100 font-bold">
                      <td className="border border-black px-3 py-2">Total</td>
                      <td className="border border-black px-3 py-2 text-center text-red-700 tabular-nums">{grandTotalRedRef}</td>
                      <td className="border border-black px-3 py-2 text-center text-blue-700 tabular-nums">{grandTotalBlueRef}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {/* Choose winner buttons */}
              <p className="text-sm text-gray-500 text-center">Alege câștigătorul pentru {ref.name}:</p>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <button onClick={async () => {
                  const existing = matchRefScores.find(s => s.match === refModalData.matchId && s.referee === ref.id && s.round == null);
                  if (existing) await matchRefereeScoreAPI.update(existing.id, { red_corner_score: 10, blue_corner_score: 0 });
                  else await matchRefereeScoreAPI.create({ match: refModalData.matchId, referee: ref.id, round: null, red_corner_score: 10, blue_corner_score: 0 });
                  setRefModalData(null);
                  onRefresh();
                }} disabled={busy}
                  className="flex-1 border border-black bg-red-600 px-4 py-3 font-bold text-base text-white transition hover:bg-red-700 disabled:opacity-40">
                  {match.red_corner_full_name || 'Roșu'}
                </button>
                <button onClick={async () => {
                  const existing = matchRefScores.find(s => s.match === refModalData.matchId && s.referee === ref.id && s.round == null);
                  if (existing) await matchRefereeScoreAPI.update(existing.id, { red_corner_score: 0, blue_corner_score: 10 });
                  else await matchRefereeScoreAPI.create({ match: refModalData.matchId, referee: ref.id, round: null, red_corner_score: 0, blue_corner_score: 10 });
                  setRefModalData(null);
                  onRefresh();
                }} disabled={busy}
                  className="flex-1 border border-black bg-blue-600 px-4 py-3 font-bold text-base text-white transition hover:bg-blue-700 disabled:opacity-40">
                  {match.blue_corner_full_name || 'Albastru'}
                </button>
              </div>
          </FullscreenModal>
        );
      })()}

      {/* ── ATHLETE NAMES HEADER (only names, centered) + match info on right ── */}
      {(() => {
        const matchCat = allCats?.find(c => c.id === match.category);
        const matchTypeLabels = { 'qualifications': 'Calificări', 'quarter-finals': 'Sferturi', 'semi-finals': 'Semi-finală', 'finals': 'Finală', 'bronze': 'Bronz' };
        return matchCat ? (
          <div className="w-full overflow-hidden bg-white shadow-sm">
            <div className="flex flex-col gap-4 p-4 xl:grid xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:items-center xl:gap-6 xl:p-5">
              <div className="flex flex-wrap items-start gap-2 xl:self-start">
                <button
                  type="button"
                  role="switch"
                  aria-checked={matchDisplayMode === 'real_time'}
                  onClick={() => updateMatchDisplayMode(matchDisplayMode === 'real_time' ? 'reveal_final' : 'real_time')}
                  disabled={busy || operationalSettingsLocked}
                  className={`relative inline-flex h-9 min-w-[236px] items-center overflow-hidden rounded-full border px-1 text-[10px] font-bold uppercase tracking-[0.05em] shadow-sm transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 disabled:cursor-not-allowed disabled:opacity-50 ${matchDisplayMode === 'real_time' ? 'border-emerald-700 bg-emerald-500/95 text-white' : 'border-amber-700 bg-amber-300 text-black'}`}
                  title={operationalLockActive ? operationalLockMessage : settingsLocked ? 'Modul nu mai poate fi schimbat după ce meciul a început.' : 'Schimbă modul de afișare'}
                >
                  <span
                    className={`absolute inset-y-1 w-[calc(50%-4px)] rounded-full border border-black/20 bg-white/95 shadow-[0_1px_2px_rgba(0,0,0,0.18)] transition-transform duration-200 ${matchDisplayMode === 'real_time' ? 'translate-x-[calc(100%+2px)]' : 'translate-x-0'}`}
                    aria-hidden="true"
                  />
                  <span className="relative z-10 grid w-full grid-cols-2 items-center gap-2 px-3 whitespace-nowrap">
                    <span className={`text-center transition-colors ${matchDisplayMode === 'real_time' ? 'text-white/75' : 'text-black'}`}>Decizia la final</span>
                    <span className={`text-center transition-colors ${matchDisplayMode === 'real_time' ? 'text-black' : 'text-black/70'}`}>Scor timp real</span>
                  </span>
                </button>

                <button
                  type="button"
                  role="switch"
                  aria-checked={isThreeRoundPreset}
                  onClick={() => applyRoundPreset(isThreeRoundPreset ? 2 : 3)}
                  disabled={busy || operationalSettingsLocked}
                  className={`relative inline-flex h-9 min-w-[168px] items-center overflow-hidden rounded-full border px-1 text-[10px] font-bold uppercase tracking-[0.05em] shadow-sm transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 disabled:cursor-not-allowed disabled:opacity-50 ${isThreeRoundPreset ? 'border-emerald-700 bg-emerald-500/95 text-white' : 'border-sky-700 bg-sky-500 text-white'}`}
                  title={operationalLockActive ? operationalLockMessage : settingsLocked ? 'Presetul nu mai poate fi schimbat după ce meciul a început.' : 'Comută între 3 x 2 și 2 x 2'}
                >
                  <span
                    className={`absolute inset-y-1 w-[calc(50%-4px)] rounded-full border border-black/20 bg-white/95 shadow-[0_1px_2px_rgba(0,0,0,0.18)] transition-transform duration-200 ${isThreeRoundPreset ? 'translate-x-0' : 'translate-x-[calc(100%+2px)]'}`}
                    aria-hidden="true"
                  />
                  <span className="relative z-10 grid w-full grid-cols-2 items-center gap-2 px-3 whitespace-nowrap">
                    <span className={`text-center transition-colors ${isThreeRoundPreset ? 'text-black' : 'text-white/75'}`}>3x2min</span>
                    <span className={`text-center transition-colors ${isThreeRoundPreset ? 'text-white/75' : 'text-black'}`}>2x2min</span>
                  </span>
                </button>

                {operationalLockActive ? (
                  <div className="w-full max-w-[360px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {operationalLockMessage}
                  </div>
                ) : null}
              </div>
              <div className="min-w-0 xl:col-start-2">
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="grid w-full grid-cols-1 items-center gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-5">
                    <div className={`min-w-0 text-center px-3 py-1.5 sm:justify-self-end ${isMatchFinalized && matchWinner === 'red' ? 'border-4 border-green-500 bg-green-50 shadow-lg' : ''}`}>
                      {isMatchFinalized && matchWinner === 'red' && <span className="mb-1 block text-xs font-bold text-green-600">CÂȘTIGĂTOR</span>}
                      <span className="break-words text-2xl font-black text-red-600 sm:text-3xl">{match.red_corner_full_name || 'TBD'}</span>
                      {match.red_corner_club_name && <p className="text-sm font-medium text-gray-500">({match.red_corner_club_name})</p>}
                    </div>
                    <div className="flex flex-col items-center gap-1 sm:justify-self-center">
                      <span className="text-2xl font-black text-gray-300">vs</span>
                      <button onClick={() => swapCorners(match.id)} disabled={busy || matchStarted}
                        className="border border-black bg-white px-2 py-1 text-xs font-medium text-gray-700 transition hover:bg-yellow-100 disabled:opacity-40" title={matchStarted ? 'Nu se poate schimba după începerea meciului' : 'Inversează colțurile'}>
                        ⇄ Swap
                      </button>
                    </div>
                    <div className={`min-w-0 text-center px-3 py-1.5 sm:justify-self-start ${isMatchFinalized && matchWinner === 'blue' ? 'border-4 border-green-500 bg-green-50 shadow-lg' : ''}`}>
                      {isMatchFinalized && matchWinner === 'blue' && <span className="mb-1 block text-xs font-bold text-green-600">CÂȘTIGĂTOR</span>}
                      <span className="break-words text-2xl font-black text-blue-600 sm:text-3xl">{match.blue_corner_full_name || 'TBD'}</span>
                      {match.blue_corner_club_name && <p className="text-sm font-medium text-gray-500">({match.blue_corner_club_name})</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-medium text-gray-600">
                    <span className="border border-black bg-white px-2 py-0.5">{matchCat.name}</span>
                    {matchCat.groupName && <span className="border border-black bg-white px-2 py-0.5">{matchCat.groupName}</span>}
                    <span className={`border border-black px-2 py-0.5 ${GENDER_BG[matchCat.gender] || 'bg-gray-100'}`}>{GENDER_LABELS[matchCat.gender] || matchCat.gender}</span>
                    <span className="border border-black bg-yellow-300 px-2 py-0.5 font-bold text-black">{matchTypeLabels[match.match_type] || match.match_type}</span>
                  </div>
                </div>
              </div>

              <div className="w-full xl:col-start-3 xl:justify-self-end xl:max-w-[240px]">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Arbitri</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  {matchRefSlots.map(r => {
                    const isEmpty = !r.id;
                    return (
                      <button
                        key={r.pos}
                        type="button"
                        onClick={() => {
                          setReplaceMatchRefData(r);
                          setReplacementMatchRefId(r.id ? String(r.id) : '');
                        }}
                        className={`flex w-full items-center gap-2 border px-3 py-2 text-left text-xs font-medium transition hover:shadow-sm ${isEmpty ? 'border-dashed border-black bg-white text-gray-500 hover:bg-gray-50' : 'border-black bg-white text-gray-700 hover:bg-yellow-100'}`}
                        title={isEmpty ? 'Adaugă arbitru' : 'Înlocuiește arbitrul'}
                      >
                        <span className={`inline-block h-2.5 w-2.5 shrink-0 ${isEmpty ? 'bg-gray-200' : 'bg-gray-400'}`}></span>
                        <span className="font-black text-black">A{r.pos}</span>
                        <span className="min-w-0 flex-1 truncate font-semibold">{r.name || 'Adaugă arbitru'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : null;
      })()}

      {replaceMatchRefData && (
        <FullscreenModal
          onClose={() => { setReplaceMatchRefData(null); setReplacementMatchRefId(''); }}
          title={replaceMatchRefData.id ? `Înlocuiește arbitrul A${replaceMatchRefData.pos}` : `Adaugă arbitru pe poziția A${replaceMatchRefData.pos}`}
          description={`Arbitrul curent: ${replaceMatchRefData.name || 'niciun arbitru'}`}
          actions={[
            <button key="cancel" onClick={() => { setReplaceMatchRefData(null); setReplacementMatchRefId(''); }} className={MODAL_SECONDARY_BUTTON}>Anulează</button>,
            <button key="confirm" onClick={replaceMatchReferee} disabled={busy || (replacementMatchRefId && Number(replacementMatchRefId) === replaceMatchRefData.id)} className={MODAL_SUCCESS_BUTTON}>{replacementMatchRefId ? (replaceMatchRefData.id ? 'Înlocuiește' : 'Adaugă') : 'Elimină arbitrul'}</button>,
          ]}
        >
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">Alege alt arbitru</label>
            <select
              value={replacementMatchRefId}
              onChange={e => setReplacementMatchRefId(e.target.value)}
              className="w-full border-2 border-black bg-white px-4 py-3 text-base font-medium outline-none focus:border-yellow-400"
            >
              <option value="">Fără arbitru</option>
              {availableMatchReplacementRefs.map(ref => (
                <option key={ref.id} value={ref.athlete}>
                  {ref.athlete_name}{ref.club_name ? ` — ${ref.club_name}` : ''}
                </option>
              ))}
            </select>
          </div>
        </FullscreenModal>
      )}

      {/* ── SCOREBOARD — no dot, no ROSU/ALBASTRU label ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* RED corner */}
        <div className={`space-y-3 border-2 p-4 shadow-sm ${disqualifiedRed ? 'border-gray-400 bg-gray-100 opacity-60' : 'border-red-500 bg-red-200/80'}`}>
          {disqualifiedRed && <span className="inline-flex border border-red-700 bg-red-600 px-3 py-1 text-sm font-bold text-white">DESCALIFICAT</span>}
          {/* Indicators: Abateri, Avertismente, Puncte */}
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-gray-600">Abateri:</span>
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <button key={i} disabled={busy || i >= currentInfractionsRed} onClick={() => removeLastEvent(match.id, 'infraction_red')}
                    className={`flex h-7 w-7 cursor-pointer items-center justify-center border-2 text-[10px] font-bold transition disabled:cursor-default ${
                      i < currentInfractionsRed ? 'border-yellow-600 bg-yellow-400 text-yellow-950 hover:bg-yellow-300' : 'border-gray-300 bg-white text-gray-300'
                    }`}>{i + 1}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-gray-600">Avertismente:</span>
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <button key={i} disabled={busy || i >= warningsRed} onClick={() => removeLastEvent(match.id, 'warning_red')}
                    className={`flex h-7 w-7 cursor-pointer items-center justify-center border-2 text-[10px] font-bold transition disabled:cursor-default ${
                      i < warningsRed ? 'border-orange-600 bg-orange-500 text-white hover:bg-orange-400' : 'border-gray-300 bg-white text-gray-300'
                    }`}>{i + 1}</button>
                ))}
              </div>
              {warningsRed > 0 && <span className="text-xs text-red-500 font-medium">({warningPenaltyRed})</span>}
            </div>
            <div className="flex items-center gap-1.5 sm:ml-auto">
              <span className="text-sm text-gray-600">Puncte:</span>
              <span className={`border border-black px-2 py-0.5 text-xl font-black tabular-nums ${adjustRed > 0 ? 'bg-green-200 text-green-700' : adjustRed < 0 ? 'bg-red-200 text-red-700' : 'bg-white text-gray-500'}`}>{adjustRed > 0 ? '+' : ''}{adjustRed}</span>
            </div>
          </div>
          {/* Point buttons: -2 -1 +1 +2 */}
          <div className="grid grid-cols-4 gap-2">
            <button onClick={() => addPenalty(match.id, 'red', activeRound?.id, -2)} disabled={busy || disqualifiedRed} className={`${PANEL_BUTTON_DANGER} text-base font-black`}>-2</button>
            <button onClick={() => addPenalty(match.id, 'red', activeRound?.id, -1)} disabled={busy || disqualifiedRed} className={`${PANEL_BUTTON_DANGER} text-base font-black`}>-1</button>
            <button onClick={() => addBonus(match.id, 'red', activeRound?.id, 1)} disabled={busy || disqualifiedRed} className={`${PANEL_BUTTON_SUCCESS} text-base font-black`}>+1</button>
            <button onClick={() => addBonus(match.id, 'red', activeRound?.id, 2)} disabled={busy || disqualifiedRed} className={`${PANEL_BUTTON_SUCCESS} text-base font-black`}>+2</button>
          </div>
          {/* Action buttons: +1 Abatere, +1 Avertisment */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button onClick={() => handleInfraction('red')} disabled={busy || disqualifiedRed} className={`${PANEL_BUTTON_NEUTRAL} text-sm`}>+1 Abatere</button>
            <button onClick={() => { addWarning(match.id, 'red', activeRound?.id); if (warningsRed + 1 >= 3 && !disqualifiedRed) addDisqualification(match.id, 'red'); }} disabled={busy || disqualifiedRed} className={`${PANEL_BUTTON_NEUTRAL} text-sm`}>+1 Avertisment</button>
          </div>
        </div>
        {/* BLUE corner */}
        <div className={`space-y-3 border-2 p-4 shadow-sm ${disqualifiedBlue ? 'border-gray-400 bg-gray-100 opacity-60' : 'border-blue-500 bg-blue-200/80'}`}>
          {disqualifiedBlue && <span className="inline-flex border border-red-700 bg-red-600 px-3 py-1 text-sm font-bold text-white">DESCALIFICAT</span>}
          {/* Indicators: Abateri, Avertismente, Puncte */}
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-gray-600">Abateri:</span>
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <button key={i} disabled={busy || i >= currentInfractionsBlue} onClick={() => removeLastEvent(match.id, 'infraction_blue')}
                    className={`flex h-7 w-7 cursor-pointer items-center justify-center border-2 text-[10px] font-bold transition disabled:cursor-default ${
                      i < currentInfractionsBlue ? 'border-yellow-600 bg-yellow-400 text-yellow-950 hover:bg-yellow-300' : 'border-gray-300 bg-white text-gray-300'
                    }`}>{i + 1}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-gray-600">Avertismente:</span>
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <button key={i} disabled={busy || i >= warningsBlue} onClick={() => removeLastEvent(match.id, 'warning_blue')}
                    className={`flex h-7 w-7 cursor-pointer items-center justify-center border-2 text-[10px] font-bold transition disabled:cursor-default ${
                      i < warningsBlue ? 'border-orange-600 bg-orange-500 text-white hover:bg-orange-400' : 'border-gray-300 bg-white text-gray-300'
                    }`}>{i + 1}</button>
                ))}
              </div>
              {warningsBlue > 0 && <span className="text-xs text-red-500 font-medium">({warningPenaltyBlue})</span>}
            </div>
            <div className="flex items-center gap-1.5 sm:ml-auto">
              <span className="text-sm text-gray-600">Puncte:</span>
              <span className={`border border-black px-2 py-0.5 text-xl font-black tabular-nums ${adjustBlue > 0 ? 'bg-green-200 text-green-700' : adjustBlue < 0 ? 'bg-red-200 text-red-700' : 'bg-white text-gray-500'}`}>{adjustBlue > 0 ? '+' : ''}{adjustBlue}</span>
            </div>
          </div>
          {/* Point buttons: -2 -1 +1 +2 */}
          <div className="grid grid-cols-4 gap-2">
            <button onClick={() => addPenalty(match.id, 'blue', activeRound?.id, -2)} disabled={busy || disqualifiedBlue} className={`${PANEL_BUTTON_DANGER} text-base font-black`}>-2</button>
            <button onClick={() => addPenalty(match.id, 'blue', activeRound?.id, -1)} disabled={busy || disqualifiedBlue} className={`${PANEL_BUTTON_DANGER} text-base font-black`}>-1</button>
            <button onClick={() => addBonus(match.id, 'blue', activeRound?.id, 1)} disabled={busy || disqualifiedBlue} className={`${PANEL_BUTTON_SUCCESS} text-base font-black`}>+1</button>
            <button onClick={() => addBonus(match.id, 'blue', activeRound?.id, 2)} disabled={busy || disqualifiedBlue} className={`${PANEL_BUTTON_SUCCESS} text-base font-black`}>+2</button>
          </div>
          {/* Action buttons: +1 Abatere, +1 Avertisment */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button onClick={() => handleInfraction('blue')} disabled={busy || disqualifiedBlue} className={`${PANEL_BUTTON_NEUTRAL} text-sm`}>+1 Abatere</button>
            <button onClick={() => { addWarning(match.id, 'blue', activeRound?.id); if (warningsBlue + 1 >= 3 && !disqualifiedBlue) addDisqualification(match.id, 'blue'); }} disabled={busy || disqualifiedBlue} className={`${PANEL_BUTTON_NEUTRAL} text-sm`}>+1 Avertisment</button>
          </div>
        </div>
      </div>

      {/* ── ROUNDS — responsive: horizontal on desktop, vertical on mobile/tablet ── */}
      <div className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold text-gray-600 uppercase tracking-[0.2em]">Reprize</p>
          </div>
          {matchRounds.length > 0 && (
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              {matchRounds.filter(r => r.status === 'completed').length}/{matchRounds.length} finalizate
            </span>
          )}
        </div>
        {matchRounds.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3 border-2 border-black bg-white px-4 py-4">
            <span className="text-sm text-gray-500">Nu există reprize. Alege presetul din panoul „Preset reprize” de mai sus.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
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
                  <div className={`${ROUND_CARD_SHELL} xl:flex-1 xl:min-w-0`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className={`inline-flex min-h-10 items-center border border-black px-3 text-sm font-black uppercase tracking-[0.18em] ${
                          isActive && isRoundPaused ? 'bg-yellow-200 text-yellow-900' :
                          isActive ? 'bg-green-600 text-white' :
                          isCompleted ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          Repriza {r.round_number}
                        </span>
                      </div>
                      <div className="text-right">
                        {isCompleted ? (
                          <span className="text-xs font-bold uppercase tracking-[0.18em] text-green-600">Finalizat</span>
                        ) : isActive && isRoundPaused ? (
                          <span className="text-xs font-bold uppercase tracking-[0.18em] text-yellow-700">Pauză</span>
                        ) : isActive ? (
                          <span className="text-xs font-bold uppercase tracking-[0.18em] text-green-600">Live</span>
                        ) : (
                          <span className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">În așteptare</span>
                        )}
                      </div>
                    </div>
                    {/* Round body — collapsed if completed */}
                    {isCompleted ? (
                      <div className={`${ROUND_BODY_PANEL} flex flex-col items-center justify-center gap-2 text-center`}>
                        <span className="flex h-12 w-12 items-center justify-center border border-black bg-green-100 text-2xl font-black text-green-700">
                          ✓
                        </span>
                        <button onClick={() => setShowRoundResetConfirm(r.id)} disabled={busy} className={ROUND_SECONDARY_BUTTON}>Reset</button>
                      </div>
                    ) : (
                      <div className={`${ROUND_BODY_PANEL} space-y-3 ${
                        isActive && isRoundPaused ? 'bg-yellow-50' :
                        isActive ? 'bg-green-50/70' :
                        'bg-white'
                      }`}>
                        {/* Timer / Status */}
                        <div className="flex min-h-[34px] items-center justify-center gap-2 text-center">
                          {isActive && <LiveTimer round={r} onTimeUp={() => endRound(r.id)} />}
                          {!isActive && r.status === 'scheduled' && <span className="text-sm font-medium text-gray-400">{r.duration_seconds}s</span>}
                          {isActive && isRoundPaused && <span className="px-2 py-1 text-xs font-bold uppercase tracking-[0.18em] text-yellow-700 bg-yellow-200 animate-pulse">Pauză</span>}
                        </div>
                        {r.extra_seconds !== 0 && (
                          <div className="text-center">
                            <span className={`inline-flex px-2 py-1 text-xs font-bold ${r.extra_seconds > 0 ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'}`}>
                              {r.extra_seconds > 0 ? '+' : ''}{r.extra_seconds}s
                            </span>
                          </div>
                        )}
                        {/* Action buttons */}
                        <div className="flex flex-wrap justify-center gap-2">
                          {r.status === 'scheduled' && (
                            <button onClick={() => { if (idx > 0 && breakTimers[idx - 1]) dismissBreak(idx - 1); startRound(r.id); }} disabled={busy || !!activeRound} className={`text-sm text-white px-5 py-2.5 font-semibold disabled:opacity-40 ${
                              (idx === 0 && isMatchDisplayStarted && !matchStarted)
                                ? 'border border-black bg-green-600 hover:bg-green-700 ring-4 ring-green-300 animate-pulse'
                                : idx > 0 && matchRounds[idx - 1]?.status === 'completed' && !breakTimers[idx - 1]
                                ? 'border border-black bg-green-600 hover:bg-green-700 ring-2 ring-green-300 animate-pulse'
                                : 'border border-black bg-green-600 hover:bg-green-700'
                            }`}>Start Repriza</button>
                          )}
                          {isActive && !isRoundPaused && (
                            <button onClick={() => pauseRound(match.id, r.id)} disabled={busy} className={MODAL_WARNING_BUTTON}>Pauză</button>
                          )}
                          {isActive && isRoundPaused && (
                            <button onClick={() => resumeRound(match.id, r.id)} disabled={busy} className={MODAL_SUCCESS_BUTTON}>Reluare</button>
                          )}
                          {isActive && (
                            <button onClick={() => setShowStopRoundConfirm(r.id)} disabled={busy} className={MODAL_DANGER_BUTTON}>Stop</button>
                          )}
                          <button onClick={() => setShowRoundResetConfirm(r.id)} disabled={busy} className={ROUND_SECONDARY_BUTTON}>Reset</button>
                        </div>
                        {/* Time adjust buttons */}
                        {isActive && (
                          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                            <button onClick={() => adjustTime(match.id, r.id, -10)} disabled={busy} className={PANEL_BUTTON_NEUTRAL}>-10s</button>
                            <button onClick={() => adjustTime(match.id, r.id, 10)} disabled={busy} className={PANEL_BUTTON_NEUTRAL}>+10s</button>
                            <button onClick={() => adjustTime(match.id, r.id, 30)} disabled={busy} className={PANEL_BUTTON_NEUTRAL}>+30s</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Break timer BETWEEN rounds */}
                  {idx < totalRounds - 1 && (
                    (showBreak || (showBreakPlaceholder && !breakTimers[idx])) ? (
                      <div className={`${ROUND_CARD_SHELL} bg-orange-50/40 xl:flex-1 xl:min-w-0`}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="inline-flex min-h-10 items-center border border-black px-3 text-sm font-black uppercase tracking-[0.18em] bg-orange-200 text-orange-900">
                            Pauză
                          </span>
                          <span className="text-xs font-bold uppercase tracking-[0.18em] text-orange-500">Între reprize</span>
                        </div>
                        {/* Break timer body */}
                        {showBreak && (
                          <div className={`${ROUND_BODY_PANEL} bg-white`}>
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
                          <button onClick={() => setBreakTimers(prev => ({ ...prev, [idx]: true }))} className="flex w-full items-center justify-center border border-black bg-white px-4 py-4 text-sm font-bold uppercase tracking-[0.18em] text-orange-600 transition hover:bg-orange-50 cursor-pointer">
                            Start Pauza
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="hidden xl:flex xl:w-6 xl:items-center xl:justify-center">
                        <div className={`h-0.5 w-full ${isCompleted ? 'bg-green-200' : 'bg-gray-200'}`} />
                      </div>
                    )
                  )}
                </React.Fragment>
              );
            })}

            {/* Decizia Arbitrilor step — visible after all rounds completed */}
            {allRoundsCompleted && (
            <>
            <div className="hidden xl:flex xl:w-6 xl:items-center xl:justify-center">
              <div className="h-0.5 w-full bg-black/20" />
            </div>
            <div className={`${ROUND_CARD_SHELL} xl:flex-1 xl:min-w-0`}>
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex min-h-10 items-center border border-black px-3 text-sm font-black uppercase tracking-[0.18em] bg-white text-black">
                  Decizia arbitrilor
                </span>
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">După reprize</span>
              </div>
              <div className={`${ROUND_BODY_PANEL} space-y-3`}>
                <span className="block text-xs text-gray-400 text-center">
                  {matchRefScores.filter(s => s.winner_choice && s.round == null).length}/{matchReferees.length || 5} decizii
                </span>
                {/* Big A1-A5 boxes */}
                <div className="flex gap-2 justify-center">
                  {matchRefSlots.map((ref) => {
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
                        className={`h-16 w-14 flex flex-col items-center justify-center border border-black text-sm font-black cursor-pointer transition hover:opacity-80 disabled:cursor-default ${
                        choice === 'red' ? 'bg-red-500 text-white' :
                        choice === 'blue' ? 'bg-blue-500 text-white' :
                        'bg-white text-gray-500 hover:bg-gray-100'
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
                      if (!ensureOperationalWrite()) return;
                      const submitted = matchRefScores.filter(s => s.winner_choice && s.round == null).length;
                      const total = matchReferees.length || 5;
                      if (submitted < total) {
                        setShowWinnerConfirm(true);
                      } else {
                        revealWinner();
                      }
                    }} disabled={busy || operationalLockActive}
                      className={`text-base text-white px-8 py-3 font-bold shadow-sm disabled:opacity-40 transition whitespace-nowrap ${allRefereesDecided ? 'bg-green-600 hover:bg-green-700 ring-4 ring-green-300 animate-pulse' : 'bg-green-600 hover:bg-green-700'}`}>
                      Afișează câștigător
                    </button>
                  )}
                  {session?.status === 'winner_revealed' && (
                    <button onClick={() => {
                      if (!ensureOperationalWrite()) return;
                      if (session) {
                        switchDisplay(session.current_category, session.current_match, session.current_athlete, 'displaying');
                      }
                    }} disabled={busy || operationalLockActive}
                      className="text-base bg-gray-500 hover:bg-gray-600 text-white px-8 py-3 font-bold shadow-sm disabled:opacity-40 transition whitespace-nowrap">
                      Ascunde câștigător
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
        <div className="w-full overflow-hidden border-2 border-black bg-white shadow-sm">
          <div className="border-b-2 border-black bg-gray-100 px-4 py-3">
            <p className="text-sm font-bold uppercase tracking-wide text-gray-700">Scoruri arbitri</p>
          </div>
          <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse border-0">
            <thead>
              <tr className="bg-gray-100">
                <th className="w-40 border border-black bg-gray-200 px-4 py-3 text-left text-sm font-bold uppercase tracking-wide text-gray-700">Arbitru</th>
                {matchRounds.map((r, rIdx) => (
                  <th key={r.id} colSpan={2} className={`border border-black bg-gray-200 px-2 py-3 text-center text-sm font-bold uppercase tracking-wide text-gray-700 ${rIdx > 0 ? 'border-l-[3px] border-l-black' : ''}`}>
                    R{r.round_number}
                  </th>
                ))}
                <th colSpan={2} className="border border-black border-l-[3px] border-l-black bg-yellow-300 px-2 py-3 text-center text-sm font-bold uppercase tracking-wide text-black">{isLiveScoringMatch ? 'Puncte validate' : 'TOTAL'}</th>
                {allRefereesDecided && <th className="border border-black bg-gray-200 px-2 py-3 text-center text-sm font-bold uppercase tracking-wide text-gray-700">Decizie</th>}
              </tr>
            </thead>
            <tbody>
              {matchRefSlots.map((ref, refIdx) => {
                const refScoresForRef = matchRefScores.filter(s => s.referee === ref.id);
                const winnerChoice = refScoresForRef.find(s => s.winner_choice && s.round == null)?.winner_choice;
                const livePointStats = ref.id ? pointStatsByRef[ref.id] : null;
                return (
                  <tr key={ref.pos} className={`${refIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} transition hover:bg-yellow-50/50`}>
                    <td className="max-w-[160px] truncate border border-black/20 px-4 py-2.5 text-sm font-medium text-gray-700"><span className="mr-1 font-bold text-black">A{ref.pos}</span> {ref.name || `Arbitru ${ref.pos}`}</td>
                    {matchRounds.map((r, rIdx) => {
                      const roundScore = refScoresForRef.find(s => s.round === r.id);
                      const redScore = roundScore?.red_corner_score != null ? Number(roundScore.red_corner_score) : null;
                      const blueScore = roundScore?.blue_corner_score != null ? Number(roundScore.blue_corner_score) : null;
                      const liveRoundStats = livePointStats?.rounds?.[r.id] || { sent: { red: 0, blue: 0 }, validated: { red: 0, blue: 0 } };
                      return (
                        <React.Fragment key={r.id}>
                          <td className={`border border-black/20 px-2 py-2.5 text-center text-sm font-bold tabular-nums ${rIdx > 0 ? 'border-l-[3px] border-l-black/50' : ''}`}>
                            {isLiveScoringMatch ? (
                              <div className="flex flex-col items-center leading-tight">
                                <span className="text-xs font-medium text-gray-400">{liveRoundStats.sent.red !== 0 ? liveRoundStats.sent.red : '—'}</span>
                                <span className={liveRoundStats.validated.red !== 0 ? 'text-red-600' : 'text-gray-300'}>{liveRoundStats.validated.red !== 0 ? liveRoundStats.validated.red : '—'}</span>
                              </div>
                            ) : redScore != null ? <span className="text-red-600">{redScore}</span> : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="border border-black/20 px-2 py-2.5 text-center text-sm font-bold tabular-nums">
                            {isLiveScoringMatch ? (
                              <div className="flex flex-col items-center leading-tight">
                                <span className="text-xs font-medium text-gray-400">{liveRoundStats.sent.blue !== 0 ? liveRoundStats.sent.blue : '—'}</span>
                                <span className={liveRoundStats.validated.blue !== 0 ? 'text-blue-600' : 'text-gray-300'}>{liveRoundStats.validated.blue !== 0 ? liveRoundStats.validated.blue : '—'}</span>
                              </div>
                            ) : blueScore != null ? <span className="text-blue-600">{blueScore}</span> : <span className="text-gray-300">-</span>}
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
                      const liveValidatedTotals = livePointStats?.totals?.validated || { red: 0, blue: 0 };
                      const hasLiveValidatedTotals = liveValidatedTotals.red !== 0 || liveValidatedTotals.blue !== 0;
                      return (
                        <>
                          <td className="border border-black/20 border-l-[3px] border-l-black bg-yellow-50 px-2 py-2.5 text-center text-sm font-bold tabular-nums">
                            {isLiveScoringMatch
                              ? (hasLiveValidatedTotals ? <span className="text-red-700">{liveValidatedTotals.red}</span> : <span className="text-gray-300">-</span>)
                              : (hasScores ? <span className="text-red-700">{refGrandRed} {adjustRed !== 0 && <span className={`text-xs font-medium ${adjustRed > 0 ? 'text-green-600' : 'text-red-500'}`}>({adjustRed > 0 ? '+' : ''}{adjustRed})</span>}</span> : <span className="text-gray-300">-</span>)}
                          </td>
                          <td className="border border-black/20 bg-yellow-50 px-2 py-2.5 text-center text-sm font-bold tabular-nums">
                            {isLiveScoringMatch
                              ? (hasLiveValidatedTotals ? <span className="text-blue-700">{liveValidatedTotals.blue}</span> : <span className="text-gray-300">-</span>)
                              : (hasScores ? <span className="text-blue-700">{refGrandBlue} {adjustBlue !== 0 && <span className={`text-xs font-medium ${adjustBlue > 0 ? 'text-green-600' : 'text-red-500'}`}>({adjustBlue > 0 ? '+' : ''}{adjustBlue})</span>}</span> : <span className="text-gray-300">-</span>)}
                          </td>
                        </>
                      );
                    })()}
                    {allRefereesDecided && (
                    <td className="border border-black/20 px-2 py-2.5 text-center">
                      {winnerChoice === 'red' ? (
                        <span className="inline-flex items-center gap-1 border border-black bg-red-500 px-2.5 py-1 text-xs font-bold text-white">Rosu</span>
                      ) : winnerChoice === 'blue' ? (
                        <span className="inline-flex items-center gap-1 border border-black bg-blue-500 px-2.5 py-1 text-xs font-bold text-white">Albastru</span>
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
          </div>
        </div>
      )}

      {/* EVENT LOG — always visible, scrollable, 10-row default height */}
      <div className="overflow-hidden border-2 border-black bg-white shadow-sm">
        <div className="border-b-2 border-black bg-gray-100 px-4 py-3">
          <p className="text-sm font-bold uppercase tracking-wide text-gray-700">Evenimente ({eventLogRows.length})</p>
        </div>
        <div className="overflow-y-auto" style={{ height: '320px' }}>
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-100">
                <th className="border border-black bg-gray-200 px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-gray-600">Ora</th>
                <th className="border border-black bg-gray-200 px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-gray-600">Eveniment</th>
                <th className="border border-black bg-gray-200 px-3 py-2 text-center text-xs font-bold uppercase tracking-wide text-gray-600">Valoare</th>
                <th className="border border-black bg-gray-200 px-3 py-2 text-center text-xs font-bold uppercase tracking-wide text-gray-600">Repriza</th>
              </tr>
            </thead>
            <tbody>
              {eventLogRows.length === 0 ? (
                <tr><td colSpan="4" className="border border-black/20 px-3 py-6 text-center text-sm italic text-gray-400">Niciun eveniment înregistrat</td></tr>
              ) : (
                eventLogRows.map((ev, evIdx) => {
                  return (
                    <tr key={ev.key} className={evIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="border border-black/20 px-3 py-1.5 text-xs text-gray-400 tabular-nums whitespace-nowrap">{ev.time}</td>
                      <td className="border border-black/20 px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 shrink-0 ${ev.dotClass}`} />
                          <div>
                            <span className={`text-sm font-medium ${ev.labelClass}`}>{ev.label}</span>
                            {ev.sublabel ? <p className="text-[11px] text-gray-500">{ev.sublabel}</p> : null}
                          </div>
                        </div>
                      </td>
                      <td className="border border-black/20 px-3 py-1.5 text-center text-sm font-bold tabular-nums">
                        <span className={ev.valueClass}>{ev.value}</span>
                      </td>
                      <td className="border border-black/20 px-3 py-1.5 text-center text-xs text-gray-500">{ev.roundLabel}</td>
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

function FullscreenModal({ onClose, title, description, maxWidth = 'max-w-md', actions, children }) {
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
