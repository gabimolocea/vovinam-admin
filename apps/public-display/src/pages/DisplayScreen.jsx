import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import api from '@shared/lib/api';

const POLL_INTERVAL = 2000;

const normalizeId = (value) => {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
};

const normalizeName = (value = '') => String(value)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const teamMatchesCurrentAthlete = (team, athleteId, athleteName) => {
  const members = team?.team_members || team?.members || [];
  const normalizedAthleteId = normalizeId(athleteId);
  const normalizedAthleteName = normalizeName(athleteName);

  return members.some(member => {
    const memberId = normalizeId(member?.id);
    if (normalizedAthleteId != null && memberId === normalizedAthleteId) {
      return true;
    }

    const candidateNames = [
      member?.name,
      [member?.first_name, member?.last_name].filter(Boolean).join(' '),
      [member?.last_name, member?.first_name].filter(Boolean).join(' '),
    ].map(normalizeName).filter(Boolean);

    return normalizedAthleteName && candidateNames.includes(normalizedAthleteName);
  });
};

const joinTeamMemberNames = (members = []) => members
  .map(member => member?.name || [member?.first_name, member?.last_name].filter(Boolean).join(' ').trim())
  .filter(Boolean)
  .join(' & ');

const stripTrailingClubSuffix = (teamName = '', clubName = '') => {
  const normalizedTeamName = String(teamName || '').trim();
  const normalizedClubName = String(clubName || '').trim();

  if (!normalizedTeamName || !normalizedClubName) {
    return normalizedTeamName;
  }

  const suffix = ` (${normalizedClubName})`;
  if (normalizedTeamName.endsWith(suffix)) {
    return normalizedTeamName.slice(0, -suffix.length).trim();
  }

  return normalizedTeamName;
};

const normalizeTeamDisplayName = (teamName = '', clubName = '') => stripTrailingClubSuffix(teamName, clubName).replace(/\s+și\s+/gi, ' & ').trim();

const isTeamCategoryType = (value) => ['team', 'teams'].includes(value);


export default function DisplayScreen() {
  const { fieldId } = useParams();
  const [session, setSession] = useState(null);
  const [category, setCategory] = useState(null);
  const [match, setMatch] = useState(null);
  const [athlete, setAthlete] = useState(null);
  const [activeTeam, setActiveTeam] = useState(null);
  const stableTeamRef = useRef(null); // keeps last valid activeTeam to prevent flicker
  const [group, setGroup] = useState(null);
  const [event, setEvent] = useState(null);
  const [refScores, setRefScores] = useState([]);       // CategoryRefereeScore[]
  const [matchRefScores, setMatchRefScores] = useState([]); // MatchRefereeScore[]
  const [matchRefAssignment, setMatchRefAssignment] = useState(null); // MatchRefereeAssignment
  const [rounds, setRounds] = useState([]);              // MatchRound[]
  const [matchEvents, setMatchEvents] = useState([]);     // MatchEvent[]
  const [pointEvents, setPointEvents] = useState([]);     // RefereePointEvent[]
  const [revealed, setRevealed] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const intervalRef = useRef(null);

  const fetchSession = useCallback(async () => {
    try {
      let currentCategoryData = null;

      // Get monitor session for this field
      const { data: sessions } = await api.get('/monitor-sessions/', { params: { field: fieldId } });
      const list = Array.isArray(sessions) ? sessions : sessions.results ?? [];
      const sess = list[0] || null;
      setSession(sess);

      if (!sess || sess.status === 'idle') {
        setCategory(null);
        setMatch(null);
        setAthlete(null);
        setActiveTeam(null);
        setRefScores([]);
        setMatchRefScores([]);
        setMatchRefAssignment(null);
        setMatchEvents([]);
        setPointEvents([]);
        setRevealed(false);
        return;
      }

      const sessionTeamFallback = sess.current_team_name
        ? {
            team_name: sess.current_team_name,
            team_club_name: sess.current_team_club_name || '',
            team_members: Array.isArray(sess.current_team_members) ? sess.current_team_members : [],
            members: Array.isArray(sess.current_team_members) ? sess.current_team_members : [],
            id: sess.current_athlete_score_id || null,
          }
        : null;
      setActiveTeam(sessionTeamFallback || null);
      if (sessionTeamFallback) stableTeamRef.current = sessionTeamFallback;

      // Fetch current athlete (for solo/team)
      if (sess.current_athlete) {
        const { data: ath } = await api.get(`/athletes/${sess.current_athlete}/`);
        setAthlete(ath);
      } else {
        setAthlete(null);
      }

      // Fetch match details (for fight)
      if (sess.current_match) {
        const { data: m } = await api.get(`/matches/${sess.current_match}/`);
        setMatch(m);
        // Fetch match rounds
        const { data: rds } = await api.get('/match-rounds/', { params: { match_id: sess.current_match } });
        setRounds(Array.isArray(rds) ? rds : rds.results ?? []);
        // Fetch match referee scores
        const { data: mrs } = await api.get('/match-referee-scores/', { params: { match_id: sess.current_match } });
        setMatchRefScores(Array.isArray(mrs) ? mrs : mrs.results ?? []);
        // Fetch match events (warnings, penalties, pauses)
        const { data: mev } = await api.get('/match-events/', { params: { match_id: sess.current_match } });
        setMatchEvents(Array.isArray(mev) ? mev : mev.results ?? []);
        const { data: pte } = await api.get(`/matches/${sess.current_match}/point_events/`);
        setPointEvents(Array.isArray(pte) ? pte : pte.results ?? []);
        // Fetch match referee assignment (to know total referee count)
        const { data: mra } = await api.get('/match-referee-assignments/', { params: { match_id: sess.current_match } });
        const mraList = Array.isArray(mra) ? mra : mra.results ?? [];
        setMatchRefAssignment(mraList[0] || null);

        const categoryId = sess.current_category || m.category || null;
        if (categoryId) {
          const { data: cat } = await api.get(`/categories/${categoryId}/`);
          currentCategoryData = cat;
          setCategory(cat);

          if (cat.group) {
            const { data: grp } = await api.get(`/groups/${cat.group}/`);
            setGroup(grp);
          } else {
            setGroup(null);
          }

          if (cat.event) {
            const { data: evt } = await api.get(`/competitions/${cat.event}/`);
            setEvent(evt);
          } else {
            setEvent(null);
          }
        } else {
          setCategory(null);
          setGroup(null);
          setEvent(null);
        }
      } else {
        setMatch(null);
        setRounds([]);
        setMatchRefScores([]);
        setMatchRefAssignment(null);
        setMatchEvents([]);
        setPointEvents([]);

        if (sess.current_category) {
          const { data: cat } = await api.get(`/categories/${sess.current_category}/`);
          currentCategoryData = cat;
          setCategory(cat);

          if (cat.group) {
            const { data: grp } = await api.get(`/groups/${cat.group}/`);
            setGroup(grp);
          } else {
            setGroup(null);
          }

          if (cat.event) {
            const { data: evt } = await api.get(`/competitions/${cat.event}/`);
            setEvent(evt);
          } else {
            setEvent(null);
          }
        } else {
          setCategory(null);
          setGroup(null);
          setEvent(null);
        }
      }

      // Fetch category referee scores (for solo/team — scores for current athlete)
      if (sess.current_category && (sess.current_athlete || sess.current_athlete_score_id || sess.current_team_name)) {
        if (isTeamCategoryType(currentCategoryData?.type)) {
          const activeAthleteId = normalizeId(sess.current_athlete);
          const activeAthleteName = sess.current_athlete_name || [athlete?.first_name, athlete?.last_name].filter(Boolean).join(' ');
          const activeEnrollment = (currentCategoryData?.enrolled_teams || []).find(team => teamMatchesCurrentAthlete(team, activeAthleteId, activeAthleteName));
          const currentTeam = activeEnrollment || sessionTeamFallback || null;
          if (currentTeam) stableTeamRef.current = currentTeam;
          setActiveTeam(currentTeam);

          const { data: crs } = await api.get('/category-referee-score/', {
            params: sess.current_athlete_score_id
              ? { category: sess.current_category, athlete_score: sess.current_athlete_score_id }
              : { category: sess.current_category }
          });
          const scores = Array.isArray(crs) ? crs : crs.results ?? [];
          const targetAthleteScoreId = sess.current_athlete_score_id || null;
          setRefScores(targetAthleteScoreId ? scores.filter(score => normalizeId(score.athlete_score) === normalizeId(targetAthleteScoreId)) : []);
        } else {
          const { data: crs } = await api.get('/category-referee-score/', {
            params: { category: sess.current_category, athlete: sess.current_athlete }
          });
          const scores = Array.isArray(crs) ? crs : crs.results ?? [];
          setRefScores(scores);
        }

        // Reveal only when admin explicitly sets scores_revealed
        if (sess.status === 'scores_revealed') {
          setRevealed(true);
        } else {
          setRevealed(false);
        }
      } else {
        setRefScores([]);
        setRevealed(false);
      }

    } catch (err) {
      console.error('Poll error:', err);
    } finally {
      setInitialLoading(false);
    }
  }, [fieldId]);

  useEffect(() => {
    fetchSession();
    intervalRef.current = setInterval(fetchSession, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [fetchSession]);

  // ── LOADING STATE — black screen while first fetch is in progress ──
  if (initialLoading) {
    return <div className="h-screen w-screen bg-black" />;
  }

  // ── IDLE STATE ────────────────────────────────────
  if (!session || session.status === 'idle' || (!session.current_category && !session.current_match)) {
    return <IdleScreen event={event} />;
  }

  // ── FIGHT DISPLAY ─────────────────────────────────
  if (match) {
    return (
      <FightDisplay
        event={event}
        category={category}
        group={group}
        match={match}
        rounds={rounds}
        matchRefScores={matchRefScores}
        matchRefAssignment={matchRefAssignment}
        matchEvents={matchEvents}
        pointEvents={pointEvents}
        session={session}
      />
    );
  }

  // ── FIGHT CATEGORY but no match yet — black waiting screen ──
  if (category?.type === 'fight') {
    return (
      <div className="h-screen w-screen bg-white flex flex-col items-center justify-center gap-[3vh]">
        <img src="/frvv-logo.png" alt="FRVV" className="w-auto object-contain opacity-80" style={{ height: 'min(18vh, 10vw)' }} />
        <h1 className="text-[3.5vw] font-black text-gray-900 tracking-tight text-center uppercase" style={{ hyphens: 'none' }}>
          {event?.name || 'CAMPIONATUL NATIONAL DE VOVINAM'}
        </h1>
        {category && (
          <p className="text-[2vw] text-gray-700 font-semibold text-center">
            {[group?.name, category?.name].filter(Boolean).join(' · ')}
          </p>
        )}
        <p className="text-[1.4vw] text-gray-400 animate-pulse mt-[2vh]">Se așteaptă începerea meciului…</p>
      </div>
    );
  }

  // ── SOLO / TEAM DISPLAY ───────────────────────────
  return (
    <SoloTeamDisplay
      event={event}
      category={category}
      group={group}
      athlete={athlete}
      activeTeam={activeTeam || stableTeamRef.current}
      refScores={refScores}
      revealed={revealed}
      isSolo={!isTeamCategoryType(category?.type)}
      session={session}
      isDisqualified={!!(category?.enrolled_athletes || []).find(ea => (ea.athlete?.id ?? ea.athlete) === session?.current_athlete)?.disqualified}
    />
  );
}

/* ═══════════════════════════════════════════════════════
   IDLE SCREEN — waiting for admin to start a category
   ═══════════════════════════════════════════════════════ */
function IdleScreen({ event }) {
  return (
    <div className="h-screen w-screen bg-black flex flex-col items-center justify-center">
      <img src="/frvv-logo.png" alt="FRVV" className="w-80 h-80 object-contain mb-8" />
      <h1 className="text-[4vw] font-black text-yellow-400 tracking-tight text-center uppercase">
        {event?.name || 'CAMPIONATUL NATIONAL DE VOVINAM'}
      </h1>
      <p className="text-[1.5vw] text-yellow-300/70 mt-3">Federația Română de Vovinam Viet-Vo-Dao</p>
      <p className="text-[1.2vw] text-gray-500 mt-8 animate-pulse">Se așteaptă începerea competiției…</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   SOLO / TEAM DISPLAY — TV-optimised, black background,
   same visual language as FightDisplay
   ═══════════════════════════════════════════════════════ */
function SoloTeamDisplay({ event, category, group, athlete, activeTeam, refScores, revealed, isSolo, session, isDisqualified }) {
  // Calculate scores
  const allScores = refScores.map(rs => Number(rs.score)).filter(s => !isNaN(s));
  const sortedScores = [...allScores].sort((a, b) => a - b);
  let marks = allScores.map(() => 'mid');
  let total = null;

  if (allScores.length >= 3) {
    const low = sortedScores[0];
    const high = sortedScores[sortedScores.length - 1];
    let foundLow = false, foundHigh = false;
    marks = allScores.map(v => {
      if (!foundLow && v === low) { foundLow = true; return 'low'; }
      if (!foundHigh && v === high) { foundHigh = true; return 'high'; }
      return 'mid';
    });
    total = sortedScores.slice(1, -1).reduce((s, v) => s + v, 0);
  } else if (allScores.length > 0) {
    total = allScores.reduce((s, v) => s + v, 0);
  }

  const teamMembersLabel = !isSolo && Array.isArray(activeTeam?.team_members || activeTeam?.members)
    ? joinTeamMemberNames(activeTeam.team_members || activeTeam.members)
    : '';
  // For teams: use session fields (stable, server-computed) as primary source
  const rawTeamName = !isSolo
    ? (session?.current_team_name || session?.current_athlete_name || activeTeam?.team_name || activeTeam?.name || teamMembersLabel || '—')
    : '';
  const athleteName = isSolo
    ? (athlete ? `${athlete.last_name || ''} ${athlete.first_name || ''}`.trim() : '—')
    : normalizeTeamDisplayName(rawTeamName, session?.current_team_club_name || activeTeam?.team_club_name || activeTeam?.club_name || '');
  const clubName = isSolo
    ? (athlete?.club?.name || '')
    : (session?.current_team_club_name || activeTeam?.team_club_name || activeTeam?.club_name || '');
  const hasDisplaySubject = isSolo ? !!athlete : !!(session?.current_team_name || activeTeam || teamMembersLabel);

  // Group display with years
  const groupDisplay = (() => {
    if (!group?.name) return '';
    const ys = group.birth_year_start || category?.birth_year_start;
    const ye = group.birth_year_end || category?.birth_year_end;
    if (ys && ye) return `${group.name} (${ys} - ${ye})`;
    if (ys) return `${group.name} (${ys})`;
    return group.name;
  })();

  const genderLabel = category?.gender === 'male' ? 'Masculin' : category?.gender === 'female' ? 'Feminin' : category?.gender === 'mixt' ? 'Mixt' : '';
  const categoryDisplay = [category?.name, genderLabel].filter(Boolean).join(', ');
  const typeLabel = isTeamCategoryType(category?.type) ? 'ECHIPE' : 'SOLO';

  return (
    <div className="h-screen w-screen bg-white flex flex-col overflow-hidden select-none" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      {/* ═══ TOP BAR: logos + competition title ═══ */}
      <div className="flex items-center justify-between px-[3vw] py-[3vh] shrink-0">
        <img src="/frvv-logo.png" alt="FRVV" className="w-auto object-contain" style={{ height: 'min(17vh, 9vw)' }} />
        <div className="flex flex-col items-center text-center flex-1 px-[2vw]">
          <h1 className="text-[3.2vw] text-gray-900 font-semibold leading-tight tracking-normal uppercase" style={{ hyphens: 'none', wordBreak: 'keep-all', overflowWrap: 'normal' }}>
            {(event?.name || 'CAMPIONATUL NATIONAL DE VOVINAM')
              .replace(/-/g, '\u2011')
              .replace(/\s+(\S*\u2011\S*)/g, '\u00a0$1')}
          </h1>
        </div>
        <img src="/Vovinam@2x.png" alt="Vovinam" className="w-auto object-contain" style={{ height: 'min(16vh, 8vw)' }} />
      </div>

      {/* ═══ PROBA (group & category) — above athlete ═══ */}
      {(groupDisplay || categoryDisplay) && (
        <div className="text-left mt-[0.5vh] shrink-0 px-[3vw]">
          <p className="text-[2vw] text-gray-950 font-semibold leading-tight">
            Proba: <span className="ml-3 italic">{[groupDisplay, categoryDisplay].filter(Boolean).join(' | ')}</span>
          </p>
        </div>
      )}

      {/* ═══ ATHLETE / TEAM NAME — directly under category, compact ═══ */}
      {hasDisplaySubject ? (
        <div className="text-left mt-[0.5vh] shrink-0 px-[3vw]">
          {isSolo ? (
            <h2 className={`text-[2vw] font-semibold leading-tight tracking-tight ${isDisqualified ? 'text-red-700 line-through' : 'text-gray-950'}`}>
              Sportiv: <span className="ml-3 italic">{athleteName}{clubName ? ` (${clubName})` : ''}</span>
            </h2>
          ) : (
            <h2 className={`text-[2vw] font-semibold leading-tight tracking-tight ${isDisqualified ? 'text-red-700 line-through' : 'text-gray-950'}`}>
              Sportivi: <span className="ml-3 italic">{athleteName}{clubName ? ` (${clubName})` : ''}</span>
            </h2>
          )}
          {isDisqualified && (
            <p className="text-[2vw] text-red-500 uppercase mt-[0.5vh] animate-pulse">DESCALIFICAT</p>
          )}
        </div>
      ) : (
        <div className="text-left mt-[0.5vh] shrink-0 px-[3vw]">
          <h2 className="text-[2vw] font-semibold leading-tight tracking-tight text-gray-950">
            Sportiv: <span className="ml-3 italic">{athleteName}</span>
          </h2>
        </div>
      )}

      {/* ═══ MAIN CONTENT — scores dominate the screen ═══ */}
      <div className="flex-1 flex flex-col items-center justify-start px-[3vw] pt-[5vh] pb-[1vh] min-h-0">
        {/* ═══ PHASE 1: Referee boxes ═══ */}
        {true && (
          <div className="flex flex-col items-center">
            <div className="flex gap-[2vw]">
              {[0, 1, 2, 3, 4].map(i => {
                const hasScore = revealed && i < allScores.length;
                const score = hasScore ? allScores[i] : null;
                const mark = hasScore ? marks[i] : null;
                const isCancelled = mark === 'low' || mark === 'high';

                return (
                  <div key={i} className="flex flex-col items-center gap-[0.5vh]">
                    <span className="text-[1.3vw] italic font-semibold tracking-wide" style={{ color: '#000000' }}>Arbitru {i + 1}</span>
                    <div className={`relative w-[16vw] h-[11vw] flex flex-col items-center justify-center transition-all duration-500 border-4 ${hasScore && !isCancelled ? 'bg-yellow-100 border-black' : isCancelled ? 'bg-gray-100 border-gray-400' : 'bg-white border-black'}`}>
                      <span className={`text-[9vw] tabular-nums leading-none ${hasScore && isCancelled ? 'text-gray-400' : 'text-gray-900'}`}>
                        {hasScore ? Math.round(score) : '–'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ TOTAL box — shown below referee boxes ═══ */}
        {true && (
          <div className="flex flex-col items-center mt-[1.5vh]">
            <div className="relative w-[48vh] h-[30vh] max-w-[44vw] flex flex-col items-center justify-center bg-yellow-300 border-4 border-black">
              <span className="text-gray-900 tabular-nums leading-none" style={{fontSize: 'min(20vh, 18vw)'}}>
                {revealed && total != null ? Math.round(total) : '–'}
              </span>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   FIGHT DISPLAY — TV-optimised, black background,
   large scaleable text, mockup-matching layout
   ═══════════════════════════════════════════════════════ */
const REAL_TIME_POINT_VALIDATION_WINDOW_MS = 1500;
const REAL_TIME_REFEREE_HIGHLIGHT_MS = 1500;

function getRealtimePointRoundKey(event) {
  const metadata = event?.metadata || {};
  return metadata.round_id || metadata.round || 'unassigned';
}

function getRealtimePointComparisonTimestamp(event) {
  const metadata = event?.metadata || {};
  const clientTimestamp = Number(metadata.client_timestamp_ms);
  if (Number.isFinite(clientTimestamp)) return clientTimestamp;
  const serverTimestamp = new Date(event?.timestamp || 0).getTime();
  return Number.isFinite(serverTimestamp) ? serverTimestamp : 0;
}

function aggregateRealtimeValidatedPoints(pointEvents) {
  const groupedEvents = new Map();

  (pointEvents || [])
    .filter((event) => event && event.validation_status === 'validated' && event.event_type !== 'penalty')
    .sort((a, b) => {
      const timeA = getRealtimePointComparisonTimestamp(a);
      const timeB = getRealtimePointComparisonTimestamp(b);
      if (timeA !== timeB) return timeA - timeB;
      return (a.id || 0) - (b.id || 0);
    })
    .forEach((event) => {
      const groupKey = [
        getRealtimePointRoundKey(event),
        event.side || 'red',
        Number(event.points || 0),
        event.event_type || 'score',
      ].join('|');
      const currentGroups = groupedEvents.get(groupKey) || [];
      const eventTimestamp = getRealtimePointComparisonTimestamp(event);
      const lastGroup = currentGroups[currentGroups.length - 1];

      if (!lastGroup || eventTimestamp - lastGroup.anchorTimestamp >= REAL_TIME_POINT_VALIDATION_WINDOW_MS) {
        currentGroups.push({
          anchorTimestamp: eventTimestamp,
          events: [event],
          refereeIds: new Set(event.referee ? [event.referee] : []),
        });
      } else {
        lastGroup.events.push(event);
        if (event.referee) {
          lastGroup.refereeIds.add(event.referee);
        }
      }

      groupedEvents.set(groupKey, currentGroups);
    });

  let red = 0;
  let blue = 0;

  groupedEvents.forEach((groups) => {
    groups.forEach((group) => {
      if (group.refereeIds.size < 2 || !group.events.length) return;
      const awardedEvent = group.events[0];
      const awardedPoints = Number(awardedEvent.points || 0);
      if (awardedEvent.side === 'blue') {
        blue += awardedPoints;
      } else {
        red += awardedPoints;
      }
    });
  });

  return { red, blue };
}

function getRealtimeRefereeIndicators(matchRefAssignment, pointEvents) {
  const labels = [1, 2, 3, 4, 5].map((index) => ({
    slot: index,
    label: `A${index}`,
    refereeId: matchRefAssignment?.[`referee_${index}`] || null,
  }));

  const now = Date.now();
  const activeBySide = { red: new Set(), blue: new Set() };

  (pointEvents || []).forEach((event) => {
    if (!event || event.validation_status === 'rejected' || !event.referee) return;
    const side = event.side === 'blue' ? 'blue' : 'red';
    const eventTimestamp = getRealtimePointComparisonTimestamp(event);
    if (!eventTimestamp || now - eventTimestamp > REAL_TIME_REFEREE_HIGHLIGHT_MS) return;
    activeBySide[side].add(event.referee);
  });

  return {
    red: labels.map((item) => ({ ...item, active: !!item.refereeId && activeBySide.red.has(item.refereeId) })),
    blue: labels.map((item) => ({ ...item, active: !!item.refereeId && activeBySide.blue.has(item.refereeId) })),
  };
}

function RefereeSignalColumn({ indicators = [], align = 'left' }) {
  return (
    <div className={`absolute top-[1.5vh] flex flex-col gap-[0.9vh] ${align === 'right' ? 'right-[1.2vw] items-end' : 'left-[1.2vw] items-start'}`}>
      {indicators.map((indicator) => (
        <div
          key={indicator.label}
          className={`flex min-h-[4.8vh] min-w-[5vw] items-center justify-center px-[0.85vw] text-[1.35vw] font-black uppercase tracking-[0.12em] ${indicator.active ? 'bg-yellow-300 text-black' : 'bg-gray-300 text-gray-700'}`}
        >
          {indicator.label}
        </div>
      ))}
    </div>
  );
}

function FightDisplay({ event, category, group, match, rounds, matchRefScores, matchRefAssignment, matchEvents, pointEvents, session }) {
  // Winner flash animation
  const [flashOn, setFlashOn] = useState(true);

  // Determine current round
  const sortedRounds = [...rounds].sort((a, b) => a.round_number - b.round_number);
  const activeRound = sortedRounds.find(r => r.status === 'active');
  const completedRounds = sortedRounds.filter(r => r.status === 'completed').length;
  const totalRounds = sortedRounds.length || match?.total_rounds || 3;
  const allRoundsDone = completedRounds >= totalRounds && totalRounds > 0;
  const isRealTimeMode = match?.display_mode === 'real_time';
  const winnerRevealed = session?.status === 'winner_revealed';

  // Break detection
  const lastCompletedIdx = sortedRounds.reduce((acc, r, i) => r.status === 'completed' ? i : acc, -1);
  const nextScheduledRound = lastCompletedIdx >= 0 && lastCompletedIdx < sortedRounds.length - 1
    ? sortedRounds[lastCompletedIdx + 1] : null;
  const isInBreak = !activeRound && !allRoundsDone && nextScheduledRound?.status === 'scheduled' && completedRounds > 0;

  // Round type label
  const roundTypeLabel = (
    match?.match_type === 'finals' ? 'FINALA'
    : match?.match_type === 'semi-finals' ? 'SEMIFINALA'
    : match?.match_type === 'quarter-finals' ? 'SFERTURI'
    : match?.match_type === 'bronze' ? 'MECI BRONZ'
    : match?.match_type === 'qualifications' ? 'CALIFICARE'
    : match?.match_type ? String(match.match_type).replace(/-/g, ' ').toUpperCase()
    : ''
  );

  // Current display round (active, or last completed for frozen time)
  const lastCompletedRound = sortedRounds.filter(r => r.status === 'completed').slice(-1)[0] || null;
  const displayRound = activeRound || lastCompletedRound;

  // Timer label
  let timerLabel = '';
  if (allRoundsDone) {
    timerLabel = isRealTimeMode
      ? `REPRIZA ${lastCompletedRound?.round_number || totalRounds} — TERMINATĂ`
      : 'ARBITRII';
  } else if (isInBreak && nextScheduledRound) {
    timerLabel = `REPRIZA ${nextScheduledRound.round_number} ÎNCEPE ÎN`;
  } else if (activeRound) {
    timerLabel = `REPRIZA ${activeRound.round_number}`;
    if (activeRound.is_paused) timerLabel += ' — PAUZĂ';
  } else if (displayRound) {
    timerLabel = `REPRIZA ${displayRound.round_number}`;
  } else if (totalRounds > 0) {
    timerLabel = `REPRIZA ${completedRounds + 1}`;
  }

  // Count warnings/infractions from events
  const warningsRed = (matchEvents || []).filter(e => e.event_type === 'warning_red').length;
  const warningsBlue = (matchEvents || []).filter(e => e.event_type === 'warning_blue').length;
  const infractionsRed = (matchEvents || []).filter(e => e.event_type === 'infraction_red').length;
  const infractionsBlue = (matchEvents || []).filter(e => e.event_type === 'infraction_blue').length;
  const penaltyEventsRed = (matchEvents || []).filter(e => e.event_type === 'penalty_red');
  const penaltyEventsBlue = (matchEvents || []).filter(e => e.event_type === 'penalty_blue');
  const bonusEventsRed = (matchEvents || []).filter(e => e.event_type === 'bonus_red');
  const bonusEventsBlue = (matchEvents || []).filter(e => e.event_type === 'bonus_blue');
  const disqualifiedRed = (matchEvents || []).some(e => e.event_type === 'disqualify_red');
  const disqualifiedBlue = (matchEvents || []).some(e => e.event_type === 'disqualify_blue');
  // Penalty point adjustments (same logic as admin)
  const totalPenaltyRed = penaltyEventsRed.reduce((s, e) => s + (e.value || 0), 0);
  const totalPenaltyBlue = penaltyEventsBlue.reduce((s, e) => s + (e.value || 0), 0);
  const totalBonusRed = bonusEventsRed.reduce((s, e) => s + (e.value || 0), 0);
  const totalBonusBlue = bonusEventsBlue.reduce((s, e) => s + (e.value || 0), 0);
  const warningPenaltyRed = warningsRed * -2;
  const warningPenaltyBlue = warningsBlue * -2;
  const adjustRed = totalPenaltyRed + totalBonusRed + warningPenaltyRed;
  const adjustBlue = totalPenaltyBlue + totalBonusBlue + warningPenaltyBlue;
  const currentInfractionsRed = infractionsRed % 3;
  const currentInfractionsBlue = infractionsBlue % 3;

  // Referee decisions (only final decisions where round is null)
  const decisions = matchRefScores.filter(s => s.winner_choice && s.round == null);
  const redVotes = decisions.filter(d => d.winner_choice === 'red').length;
  const blueVotes = decisions.filter(d => d.winner_choice === 'blue').length;

  // Total scores from all referees' round scores + adjustments
  const allRoundScores = matchRefScores.filter(s => s.round != null);
  const realtimeConsensusTotals = aggregateRealtimeValidatedPoints(pointEvents || []);
  const refereeIndicators = getRealtimeRefereeIndicators(matchRefAssignment, pointEvents || []);
  const grandTotalRed = (isRealTimeMode
    ? realtimeConsensusTotals.red
    : allRoundScores.reduce((s, sc) => s + Number(sc.red_corner_score || 0), 0)) + adjustRed;
  const grandTotalBlue = (isRealTimeMode
    ? realtimeConsensusTotals.blue
    : allRoundScores.reduce((s, sc) => s + Number(sc.blue_corner_score || 0), 0)) + adjustBlue;

  // Winner — computed from disqualification or referee decisions
  const winner =
    disqualifiedRed ? { name: match.blue_corner_full_name || 'Sportiv 2', corner: 'blue', club: match.blue_corner_club_name || '', reason: 'DESCALIFICARE' }
    : disqualifiedBlue ? { name: match.red_corner_full_name || 'Sportiv 1', corner: 'red', club: match.red_corner_club_name || '', reason: 'DESCALIFICARE' }
    : isRealTimeMode && allRoundsDone && grandTotalRed > grandTotalBlue ? { name: match.red_corner_full_name || 'Sportiv 1', corner: 'red', club: match.red_corner_club_name || '', reason: null }
    : isRealTimeMode && allRoundsDone && grandTotalBlue > grandTotalRed ? { name: match.blue_corner_full_name || 'Sportiv 2', corner: 'blue', club: match.blue_corner_club_name || '', reason: null }
    : decisions.length > 0 && redVotes > blueVotes ? { name: match.red_corner_full_name || 'Sportiv 1', corner: 'red', club: match.red_corner_club_name || '', reason: null }
    : decisions.length > 0 && blueVotes > redVotes ? { name: match.blue_corner_full_name || 'Sportiv 2', corner: 'blue', club: match.blue_corner_club_name || '', reason: null }
    : null;

  // Display states:
  const showWinnerView = isRealTimeMode
    ? allRoundsDone && winnerRevealed && !!winner
    : allRoundsDone && !!winner;
  const showAthletesView = !showWinnerView;

  // Flash effect for winner card
  useEffect(() => {
    if (!winner || !showWinnerView) return;
    const id = setInterval(() => setFlashOn(f => !f), 600);
    return () => clearInterval(id);
  }, [winner, showWinnerView]);
  const validatedPointEvents = (pointEvents || []).filter(event => event.validation_status !== 'rejected');
  const latestPointEvent = validatedPointEvents.length ? validatedPointEvents[validatedPointEvents.length - 1] : null;
  const liveTickerLabel = latestPointEvent
    ? `${latestPointEvent.referee_name || 'Arbitru'} · ${latestPointEvent.side === 'red' ? 'ROȘU' : 'ALBASTRU'} ${Number(latestPointEvent.points) > 0 ? '+' : ''}${latestPointEvent.points}`
    : 'Se așteaptă puncte validate';

  // Group display with years
  const groupDisplay = (() => {
    if (!group?.name) return '';
    const ys = group.birth_year_start || category?.birth_year_start;
    const ye = group.birth_year_end || category?.birth_year_end;
    if (ys && ye) return `${group.name} (${ys} - ${ye})`;
    if (ys) return `${group.name} (${ys})`;
    return group.name;
  })();

  // Gender label
  const genderLabel = (
    category?.gender === 'male' ? 'Masculin'
    : category?.gender === 'female' ? 'Feminin'
    : category?.gender === 'mixt' ? 'Mixt'
    : ''
  );

  // Category display with gender
  const categoryDisplay = [category?.name, genderLabel].filter(Boolean).join(', ');

  // Timer box bg: white during break, yellow otherwise
  const timerBg = isInBreak ? 'bg-white' : 'bg-yellow-400';

  return (
    <div className="h-screen w-screen bg-white flex flex-col overflow-hidden select-none relative" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      {/* ═══ TOP BAR: logos + competition title ═══ */}
      <div className="flex items-center justify-between px-[3vw] py-[3vh] shrink-0">
        <img src="/frvv-logo.png" alt="FRVV" className="w-auto object-contain" style={{ height: 'min(17vh, 9vw)' }} />
        <div className="flex flex-col items-center text-center flex-1 px-[2vw]">
          <h1 className="text-[3.2vw] text-gray-900 font-semibold leading-tight tracking-normal uppercase" style={{ hyphens: 'none', wordBreak: 'keep-all', overflowWrap: 'normal' }}>
            {(event?.name || 'CAMPIONATUL NATIONAL DE VOVINAM')
              .replace(/-/g, '\u2011')
              .replace(/\s+(\S*\u2011\S*)/g, '\u00a0$1')}
          </h1>
        </div>
        <img src="/Vovinam@2x.png" alt="Vovinam" className="w-auto object-contain" style={{ height: 'min(16vh, 8vw)' }} />
      </div>

      {/* ═══ TIMER (centered) + CATEGORY INFO (absolute right) ═══ */}
      <div className="relative flex items-center justify-center px-[3vw] -mt-[1vh] shrink-0">
        {/* Timer box — centered on screen */}
        <div className={`${timerBg} px-[3vw] py-[1vh] text-center`} style={{ minWidth: '35vw' }}>
          <p className="text-[1.5vw] font-black text-gray-900 uppercase tracking-wider leading-tight">{timerLabel}</p>
          <div className="text-[8vw] font-black text-gray-900 tabular-nums leading-none py-[0.5vh]">
            {allRoundsDone && !showWinnerView ? (
              isRealTimeMode ? '00:00' : 'DECIZIA'
            ) : showWinnerView ? (
              isRealTimeMode ? 'FINAL' : 'DECIZIA'
            ) : isInBreak ? (
              <BreakCountdown endedAt={lastCompletedRound?.ended_at} session={session} />
            ) : (
              <RoundTimer round={displayRound} />
            )}
          </div>
        </div>
        {/* Category info — positioned absolute to the right */}
        <div className="absolute right-[3vw] top-1/2 -translate-y-1/2 text-right">
          {roundTypeLabel && <p className="text-[2.5vw] font-black text-gray-900 uppercase leading-tight">{roundTypeLabel}</p>}
          {groupDisplay && <p className="text-[2.2vw] font-bold text-gray-700 leading-tight mt-[0.3vh]">{groupDisplay}</p>}
          {categoryDisplay && <p className="text-[2.2vw] font-bold text-gray-700 leading-tight mt-[0.3vh]">{categoryDisplay}</p>}
        </div>
      </div>

      {/* ═══ MAIN CONTENT AREA ═══ */}
      <div className="flex-1 flex flex-col justify-center px-[3vw] py-[2vh] min-h-0">
        {/* ── ATHLETES VIEW: during rounds and breaks ── */}
        {showAthletesView && (
          <div className="flex gap-[1.5vw] flex-1 min-h-0">
            {/* RED corner */}
            <div className={`relative flex-1 px-[3vw] py-[2vh] ${disqualifiedRed ? 'bg-gray-700' : 'bg-red-600'}`}>
              {isRealTimeMode && <RefereeSignalColumn indicators={refereeIndicators.red} align="left" />}
              {isRealTimeMode && (
                <p className="absolute left-1/2 top-[43%] -translate-x-1/2 -translate-y-1/2 text-[16vw] font-black text-white tabular-nums leading-none">
                  {grandTotalRed}
                </p>
              )}
              <div className={`${isRealTimeMode ? 'absolute bottom-[2vh] left-[3vw] text-left' : 'flex h-full flex-col justify-center'}`}>
                <h2 className={`${isRealTimeMode ? 'text-[2.6vw]' : 'text-[4.5vw]'} font-black text-white leading-tight`}>
                  {match?.red_corner_full_name || 'TBD'}
                </h2>
                <p className={`${isRealTimeMode ? 'text-[1.45vw]' : 'text-[2.5vw]'} font-black text-white/80 uppercase mt-[0.7vh]`}>
                  {match?.red_corner_club_name || ''}
                </p>
              </div>
              {disqualifiedRed && <p className="text-[2vw] font-black text-red-400 uppercase mt-[0.5vh]">DESCALIFICAT</p>}
            </div>

            {/* BLUE corner */}
            <div className={`relative flex-1 px-[3vw] py-[2vh] ${disqualifiedBlue ? 'bg-gray-700' : 'bg-gray-900'}`}>
              {isRealTimeMode && <RefereeSignalColumn indicators={refereeIndicators.blue} align="right" />}
              {isRealTimeMode && (
                <p className="absolute left-1/2 top-[43%] -translate-x-1/2 -translate-y-1/2 text-[16vw] font-black text-white tabular-nums leading-none">
                  {grandTotalBlue}
                </p>
              )}
              <div className={`${isRealTimeMode ? 'absolute bottom-[2vh] left-[3vw] text-left' : 'flex h-full flex-col justify-center'}`}>
                <h2 className={`${isRealTimeMode ? 'text-[2.6vw]' : 'text-[4.5vw]'} font-black text-white leading-tight`}>
                  {match?.blue_corner_full_name || 'TBD'}
                </h2>
                <p className={`${isRealTimeMode ? 'text-[1.45vw]' : 'text-[2.5vw]'} font-black text-white/80 uppercase mt-[0.7vh]`}>
                  {match?.blue_corner_club_name || ''}
                </p>
              </div>
              {disqualifiedBlue && <p className="text-[2vw] font-black text-gray-400 uppercase mt-[0.5vh]">DESCALIFICAT</p>}
            </div>
          </div>
        )}

        {/* ── WINNER VIEW: side-by-side with flashing winner ── */}
        {showWinnerView && winner && (
          <div className="flex gap-[1.5vw] flex-1 min-h-0">
            {/* RED corner */}
            <div className={`relative flex-1 px-[3vw] py-[2vh] transition-colors duration-300 ${
              winner.corner === 'red'
                ? (flashOn ? 'bg-white' : 'bg-red-600')
                : 'bg-red-600'
            }`}>
              {isRealTimeMode && (
                <p className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[16vw] font-black tabular-nums leading-none ${
                  winner.corner === 'red' && flashOn ? 'text-red-600' : 'text-white'
                }`}>
                  {grandTotalRed}
                </p>
              )}
              <div className={`${isRealTimeMode ? 'absolute bottom-[2vh] left-[3vw] text-left' : 'flex h-full flex-col justify-center'}`}>
                <h2 className={`${isRealTimeMode ? 'text-[2.8vw]' : 'text-[4.5vw]'} font-black leading-tight ${
                  winner.corner === 'red' && flashOn ? 'text-red-600' : 'text-white'
                }`}>
                  {match?.red_corner_full_name || 'TBD'}
                </h2>
                <p className={`${isRealTimeMode ? 'text-[1.55vw]' : 'text-[2.5vw]'} font-black uppercase mt-[0.7vh] ${
                  winner.corner === 'red' && flashOn ? 'text-red-600/70' : 'text-white/80'
                }`}>
                  {match?.red_corner_club_name || ''}
                </p>
              </div>
            </div>

            {/* BLUE corner */}
            <div className={`relative flex-1 px-[3vw] py-[2vh] transition-colors duration-300 ${
              winner.corner === 'blue'
                ? (flashOn ? 'bg-white' : 'bg-gray-900')
                : 'bg-gray-900'
            }`}>
              {isRealTimeMode && (
                <p className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[16vw] font-black tabular-nums leading-none ${
                  winner.corner === 'blue' && flashOn ? 'text-gray-900' : 'text-white'
                }`}>
                  {grandTotalBlue}
                </p>
              )}
              <div className={`${isRealTimeMode ? 'absolute bottom-[2vh] left-[3vw] text-left' : 'flex h-full flex-col justify-center'}`}>
                <h2 className={`${isRealTimeMode ? 'text-[2.8vw]' : 'text-[4.5vw]'} font-black leading-tight ${
                  winner.corner === 'blue' && flashOn ? 'text-gray-900' : 'text-white'
                }`}>
                  {match?.blue_corner_full_name || 'TBD'}
                </h2>
                <p className={`${isRealTimeMode ? 'text-[1.55vw]' : 'text-[2.5vw]'} font-black uppercase mt-[0.7vh] ${
                  winner.corner === 'blue' && flashOn ? 'text-gray-900/70' : 'text-white/80'
                }`}>
                  {match?.blue_corner_club_name || ''}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ PERSISTENT BOTTOM BAR ═══ */}
      {showAthletesView && (
        <div className="flex items-center justify-between px-[3vw] py-[0.8vh] shrink-0">
          {/* Red side stats */}
          <div className="flex items-center gap-[2vw]">
            {/* Infraction boxes — hidden during referee decision phase */}
            <>
              <div className="flex gap-[0.5vw]">
                {[0, 1, 2].map(i => (
                  <div key={i} className={`w-[2.5vw] h-[2.5vw] ${
                    i < currentInfractionsRed ? 'bg-yellow-500' : 'bg-gray-300'
                  }`} />
                ))}
              </div>
            </>
            <div>
              <p className="text-[1.6vw] text-orange-600 font-bold">
                Avertismente: {warningsRed}
              </p>
              <p className="text-[1.6vw] text-yellow-600 font-bold">Abateri: {currentInfractionsRed}</p>
            </div>
          </div>

          {/* Blue side stats */}
          <div className="flex items-center gap-[2vw]">
            {/* Infraction boxes — hidden during referee decision phase */}
            <>
              <div className="flex gap-[0.5vw]">
                {[0, 1, 2].map(i => (
                  <div key={i} className={`w-[2.5vw] h-[2.5vw] ${
                    i < currentInfractionsBlue ? 'bg-yellow-500' : 'bg-gray-300'
                  }`} />
                ))}
              </div>
            </>
            <div>
              <p className="text-[1.6vw] text-orange-600 font-bold">
                Avertismente: {warningsBlue}
              </p>
              <p className="text-[1.6vw] text-yellow-600 font-bold">Abateri: {currentInfractionsBlue}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ROUND TIMER — countdown display for public TV
   ═══════════════════════════════════════════════════════ */
function RoundTimer({ round }) {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!round || !round.started_at) {
      setTimeLeft(null);
      return;
    }

    const duration = (round.duration_seconds || 180) + (round.extra_seconds || 0);
    const started = new Date(round.started_at).getTime();
    const pauseAcc = (round.accumulated_pause_seconds || 0) * 1000;

    // Completed round: show frozen final time
    if (round.status === 'completed') {
      if (round.ended_at) {
        const ended = new Date(round.ended_at).getTime();
        const elapsed = Math.floor((ended - started - pauseAcc) / 1000);
        setTimeLeft(Math.max(0, duration - elapsed));
      } else {
        setTimeLeft(0);
      }
      return;
    }

    // Paused: show frozen paused time
    if (round.is_paused && round.paused_at) {
      const pausedTime = new Date(round.paused_at).getTime();
      const elapsed = Math.floor((pausedTime - started - pauseAcc) / 1000);
      setTimeLeft(Math.max(0, duration - elapsed));
      return;
    }

    // Active and running: live countdown
    const tick = () => {
      const elapsed = Math.floor((Date.now() - started - pauseAcc) / 1000);
      setTimeLeft(Math.max(0, duration - elapsed));
    };

    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [round, round?.status, round?.started_at, round?.ended_at, round?.is_paused, round?.paused_at, round?.accumulated_pause_seconds, round?.extra_seconds]);

  if (timeLeft == null) {
    return <span>--:--</span>;
  }

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const isLow = timeLeft <= 10;

  return (
    <span className={isLow && !round?.is_paused ? 'animate-pulse' : ''}>
      {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════
   BREAK COUNTDOWN — synced from session break fields (admin-controlled)
   Falls back to round ended_at if session has no break state.
   ═══════════════════════════════════════════════════════ */
function BreakCountdown({ endedAt, duration = 60, session }) {
  const computeRemaining = useCallback(() => {
    // Priority 1: session break fields (synced from admin)
    if (session?.break_paused) {
      return session.break_paused_remaining || 0;
    }
    if (session?.break_end_time) {
      const remaining = (new Date(session.break_end_time).getTime() - Date.now()) / 1000;
      return Math.max(0, Math.ceil(remaining));
    }
    // If session exists but all break fields are cleared → admin skipped/finished break
    if (session && !session.break_end_time && !session.break_paused) {
      return 0;
    }
    // Priority 2: compute from round ended_at (fallback when no session data yet)
    if (!endedAt) return duration;
    const elapsed = (Date.now() - new Date(endedAt).getTime()) / 1000;
    return Math.max(0, Math.ceil(duration - elapsed));
  }, [endedAt, duration, session?.break_end_time, session?.break_paused, session?.break_paused_remaining]);

  const [secondsLeft, setSecondsLeft] = useState(computeRemaining);
  useEffect(() => {
    setSecondsLeft(computeRemaining());
    const id = setInterval(() => setSecondsLeft(computeRemaining()), 500);
    return () => clearInterval(id);
  }, [computeRemaining]);
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  // If break is done (session says no break), show 00:00
  if (session?.break_end_time === null && !session?.break_paused && session?.break_paused_remaining === 0 && secondsLeft === 0) {
    return <span>00:00</span>;
  }

  return (
    <span className={secondsLeft <= 5 ? 'animate-pulse' : ''}>
      {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
    </span>
  );
}
