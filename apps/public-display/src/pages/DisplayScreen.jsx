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
  const [group, setGroup] = useState(null);
  const [event, setEvent] = useState(null);
  const [refScores, setRefScores] = useState([]);       // CategoryRefereeScore[]
  const [matchRefScores, setMatchRefScores] = useState([]); // MatchRefereeScore[]
  const [matchRefAssignment, setMatchRefAssignment] = useState(null); // MatchRefereeAssignment
  const [rounds, setRounds] = useState([]);              // MatchRound[]
  const [matchEvents, setMatchEvents] = useState([]);     // MatchEvent[]
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
        session={session}
      />
    );
  }

  // ── SOLO / TEAM DISPLAY ───────────────────────────
  return (
    <SoloTeamDisplay
      event={event}
      category={category}
      group={group}
      athlete={athlete}
      activeTeam={activeTeam}
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
  // ── Delayed total reveal: show referee scores first, then after 7s switch to total screen ──
  const [showTotalScreen, setShowTotalScreen] = useState(false);
  const totalTimerRef = useRef(null);

  useEffect(() => {
    if (revealed) {
      // Start timer to switch to total screen after 7 seconds
      totalTimerRef.current = setTimeout(() => setShowTotalScreen(true), 7000);
    } else {
      // Reset when scores are hidden
      setShowTotalScreen(false);
      if (totalTimerRef.current) clearTimeout(totalTimerRef.current);
    }
    return () => { if (totalTimerRef.current) clearTimeout(totalTimerRef.current); };
  }, [revealed]);

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
  const rawTeamName = !isSolo
    ? (activeTeam?.team_name || activeTeam?.name || teamMembersLabel || session?.current_athlete_name || '—')
    : '';
  const athleteName = isSolo
    ? (athlete ? `${athlete.last_name || ''} ${athlete.first_name || ''}`.trim() : '—')
    : normalizeTeamDisplayName(rawTeamName, activeTeam?.team_club_name || activeTeam?.club_name || '');
  const clubName = isSolo
    ? (athlete?.club?.name || '')
    : (activeTeam?.team_club_name || activeTeam?.club_name || '');
  const hasDisplaySubject = isSolo ? !!athlete : !!activeTeam || !!teamMembersLabel;

  // Group display with years
  const groupDisplay = (() => {
    if (!group?.name) return '';
    const ys = group.birth_year_start || category?.birth_year_start;
    const ye = group.birth_year_end || category?.birth_year_end;
    if (ys && ye) return `${group.name} (${ye} - ${ys})`;
    if (ys) return `${group.name} (${ys})`;
    return group.name;
  })();

  const genderLabel = category?.gender === 'male' ? 'Masculin' : category?.gender === 'female' ? 'Feminin' : category?.gender === 'mixt' ? 'Mixt' : '';
  const categoryDisplay = [category?.name, genderLabel].filter(Boolean).join(', ');
  const typeLabel = isTeamCategoryType(category?.type) ? 'ECHIPE' : 'SOLO';

  return (
    <div className="h-screen w-screen bg-black flex flex-col overflow-hidden select-none" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      {/* ═══ TOP BAR: logos + competition title ═══ */}
      <div className="flex items-center justify-between px-[3vw] py-[1vh] shrink-0">
        <img src="/frvv-logo.png" alt="FRVV" className="h-[20vh] w-auto object-contain" />
        <h1 className="text-[3.5vw] font-normal text-yellow-400 text-center leading-tight tracking-wide uppercase" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
          {event?.name || 'CAMPIONATUL NATIONAL DE VOVINAM'}
        </h1>
        <img src="/vovinam-logo.png" alt="Vovinam" className="h-[24vh] w-auto object-contain" />
      </div>

      {/* ═══ CATEGORY INFO BAR ═══ */}
      <div className="flex items-center justify-center px-[3vw] -mt-[1vh] shrink-0 gap-[2vw]">
        {groupDisplay && <p className="text-[2.2vw] font-bold text-yellow-300 leading-tight">{groupDisplay}</p>}
        {groupDisplay && categoryDisplay && <span className="text-[2.2vw] text-yellow-400/50 font-light">|</span>}
        {categoryDisplay && <p className="text-[2.2vw] font-bold text-yellow-300 leading-tight">{categoryDisplay}</p>}
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex-1 flex flex-col items-center justify-center px-[3vw] py-[2vh] min-h-0">
        {/* Athlete / Team name */}
        {hasDisplaySubject ? (
          <div className="text-center mb-[3vh]">
            <h2 className={`text-[5vw] font-black leading-tight tracking-tight ${isDisqualified ? 'text-red-400 line-through' : 'text-white'}`}>
              {athleteName}
            </h2>
            {clubName && (
              <p className="text-[2.5vw] font-black text-white/70 uppercase mt-[0.5vh]">{clubName}</p>
            )}
            {!isSolo && teamMembersLabel && teamMembersLabel !== athleteName && (
              <p className="text-[1.6vw] font-medium text-white/55 mt-[0.8vh]">{teamMembersLabel}</p>
            )}
            {isDisqualified && (
              <p className="text-[3vw] font-black text-red-500 uppercase mt-[1vh] animate-pulse">DESCALIFICAT</p>
            )}
          </div>
        ) : (
          <div className="text-center mb-[3vh]">
            <p className="text-[2.5vw] text-gray-500 animate-pulse">Se așteaptă sportivul…</p>
          </div>
        )}

        {/* ═══ PHASE 1: Referee boxes (no total) — shown first when scores revealed ═══ */}
        {(!revealed || !showTotalScreen) && (
          <div className="flex gap-[1.5vw] mb-[2vh]">
            {[0, 1, 2, 3, 4].map(i => {
              const hasScore = revealed && i < allScores.length;
              const score = hasScore ? allScores[i] : null;
              const mark = hasScore ? marks[i] : null;
              const isCancelled = mark === 'low' || mark === 'high';

              return (
                <div key={i} className="flex flex-col items-center gap-[1vh]">
                  <div className={`relative w-[16vw] h-[30vh] flex flex-col items-center justify-center transition-all duration-500 ${
                    hasScore
                      ? isCancelled ? 'bg-red-600/30 border-4 border-red-500' : 'bg-green-600/30 border-4 border-green-500'
                      : 'bg-gray-700'
                  }`}>
                    <span className="text-[1.5vw] font-black text-gray-400 mb-[1vh]">A{i + 1}</span>
                    <span className={`text-[5vw] font-black tabular-nums ${
                      hasScore
                        ? isCancelled ? 'text-red-400' : 'text-white'
                        : 'text-gray-600'
                    }`}>
                      {hasScore ? Math.round(score) : '—'}
                    </span>
                    {/* Red diagonal slash for cancelled (min/max) scores */}
                    {hasScore && isCancelled && (
                      <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        <div className="absolute inset-0" style={{
                          background: 'linear-gradient(to top right, transparent calc(50% - 3px), #ef4444 calc(50% - 3px), #ef4444 calc(50% + 3px), transparent calc(50% + 3px))'
                        }} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ PHASE 2: Total box — same size as a referee box, green ═══ */}
        {revealed && showTotalScreen && total != null && (
          <div className="flex flex-col items-center justify-center animate-[fadeScaleIn_0.8s_ease-out]">
            <div className="relative w-[16vw] h-[30vh] flex flex-col items-center justify-center bg-green-600/30 border-4 border-green-500">
              <span className="text-[1.5vw] font-black text-green-300 mb-[1vh] uppercase tracking-wider">TOTAL</span>
              <span className="text-[5vw] font-black text-white tabular-nums leading-none">
                {Math.round(total)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Keyframe animation for total reveal ═══ */}
      <style>{`
        @keyframes fadeScaleIn {
          0% { opacity: 0; transform: scale(0.7); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   FIGHT DISPLAY — TV-optimised, black background,
   large scaleable text, mockup-matching layout
   ═══════════════════════════════════════════════════════ */
function FightDisplay({ event, category, group, match, rounds, matchRefScores, matchRefAssignment, matchEvents, session }) {
  // Winner flash animation
  const [flashOn, setFlashOn] = useState(true);

  // Determine current round
  const sortedRounds = [...rounds].sort((a, b) => a.round_number - b.round_number);
  const activeRound = sortedRounds.find(r => r.status === 'active');
  const completedRounds = sortedRounds.filter(r => r.status === 'completed').length;
  const totalRounds = sortedRounds.length || match?.total_rounds || 3;
  const allRoundsDone = completedRounds >= totalRounds && totalRounds > 0;

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
    timerLabel = 'ARBITRII';
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
  const grandTotalRed = allRoundScores.reduce((s, sc) => s + Number(sc.red_corner_score || 0), 0) + adjustRed;
  const grandTotalBlue = allRoundScores.reduce((s, sc) => s + Number(sc.blue_corner_score || 0), 0) + adjustBlue;

  // Build referee list from assignment (same logic as admin)
  const assignedReferees = [];
  if (matchRefAssignment) {
    for (let i = 1; i <= 5; i++) {
      const id = matchRefAssignment[`referee_${i}`];
      const name = matchRefAssignment[`referee_${i}_name`];
      if (id) assignedReferees.push({ pos: i, id, name: name || `A${i}` });
    }
  }
  // Fallback: if no assignment, use unique refs from scores, or default 5 empty
  const uniqueRefIds = [...new Set(matchRefScores.map(s => s.referee))];
  const totalRefCount = assignedReferees.length || uniqueRefIds.length || 5;
  // Build slots for all referees
  const refereeDecisionData = Array.from({ length: totalRefCount }, (_, i) => {
    const ref = assignedReferees[i] || null;
    const refId = ref?.id || uniqueRefIds[i] || null;
    if (!refId) return { slot: i + 1, refId: null, name: `A${i + 1}`, choice: null, totalRed: 0, totalBlue: 0 };
    const decision = matchRefScores.find(s => s.referee === refId && s.round == null && s.winner_choice);
    const refRoundScores = allRoundScores.filter(s => s.referee === refId);
    const totalRed = refRoundScores.reduce((s, sc) => s + Number(sc.red_corner_score || 0), 0);
    const totalBlue = refRoundScores.reduce((s, sc) => s + Number(sc.blue_corner_score || 0), 0);
    const refName = ref?.name || decision?.referee_name || matchRefScores.find(s => s.referee === refId)?.referee_name || `A${i + 1}`;
    return { slot: i + 1, refId, name: refName, choice: decision?.winner_choice || null, totalRed, totalBlue };
  });

  // Admin controls reveal via monitor session status
  const winnerRevealed = session?.status === 'winner_revealed';

  // Winner — computed from disqualification or referee decisions
  const winner =
    disqualifiedRed ? { name: match.blue_corner_full_name || 'Sportiv 2', corner: 'blue', club: match.blue_corner_club_name || '', reason: 'DESCALIFICARE' }
    : disqualifiedBlue ? { name: match.red_corner_full_name || 'Sportiv 1', corner: 'red', club: match.red_corner_club_name || '', reason: 'DESCALIFICARE' }
    : decisions.length > 0 && redVotes > blueVotes ? { name: match.red_corner_full_name || 'Sportiv 1', corner: 'red', club: match.red_corner_club_name || '', reason: null }
    : decisions.length > 0 && blueVotes > redVotes ? { name: match.blue_corner_full_name || 'Sportiv 2', corner: 'blue', club: match.blue_corner_club_name || '', reason: null }
    : null;

  // Flash effect for winner card
  useEffect(() => {
    if (!winner || !winnerRevealed) return;
    const id = setInterval(() => setFlashOn(f => !f), 600);
    return () => clearInterval(id);
  }, [winner, winnerRevealed]);

  // 7-second delay after winner_revealed before transitioning from decisions to winner screen
  const [showWinnerScreen, setShowWinnerScreen] = useState(false);
  useEffect(() => {
    if (!winnerRevealed) {
      setShowWinnerScreen(false);
      return;
    }
    const timer = setTimeout(() => setShowWinnerScreen(true), 7000);
    return () => clearTimeout(timer);
  }, [winnerRevealed]);

  // Display states:
  // 1. Athletes view: during rounds and breaks
  // 2. Referee boxes view: all rounds done — gray placeholders until winner revealed,
  //    then colored boxes with scores for 7s before winner screen
  // 3. Winner view: 7s after admin pressed "Afișează câștigătorul"
  const showWinnerView = allRoundsDone && winnerRevealed && showWinnerScreen && winner;
  const showRefBoxesView = allRoundsDone && !showWinnerView;
  const showAthletesView = !allRoundsDone;

  // Group display with years
  const groupDisplay = (() => {
    if (!group?.name) return '';
    const ys = group.birth_year_start || category?.birth_year_start;
    const ye = group.birth_year_end || category?.birth_year_end;
    if (ys && ye) return `${group.name} (${ye} - ${ys})`;
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
    <div className="h-screen w-screen bg-black flex flex-col overflow-hidden select-none relative" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      {/* ═══ TOP BAR: logos + competition title ═══ */}
      <div className="flex items-center justify-between px-[3vw] py-[1vh] shrink-0">
        <img src="/frvv-logo.png" alt="FRVV" className="h-[20vh] w-auto object-contain" />
        <h1 className="text-[3.5vw] font-normal text-yellow-400 text-center leading-tight tracking-wide uppercase" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
          {event?.name || 'CAMPIONATUL NATIONAL DE VOVINAM'}
        </h1>
        <img src="/vovinam-logo.png" alt="Vovinam" className="h-[24vh] w-auto object-contain" />
      </div>

      {/* ═══ TIMER (centered) + CATEGORY INFO (absolute right) ═══ */}
      <div className="relative flex items-center justify-center px-[3vw] -mt-[1vh] shrink-0">
        {/* Timer box — centered on screen */}
        <div className={`${timerBg} px-[3vw] py-[1vh] text-center`} style={{ minWidth: '35vw' }}>
          <p className="text-[1.5vw] font-black text-gray-900 uppercase tracking-wider leading-tight">{timerLabel}</p>
          <div className="text-[8vw] font-black text-gray-900 tabular-nums leading-none py-[0.5vh]">
            {allRoundsDone ? (
              'DECIZIA'
            ) : isInBreak ? (
              <BreakCountdown endedAt={lastCompletedRound?.ended_at} session={session} />
            ) : (
              <RoundTimer round={displayRound} />
            )}
          </div>
        </div>
        {/* Category info — positioned absolute to the right */}
        <div className="absolute right-[3vw] top-1/2 -translate-y-1/2 text-right">
          {roundTypeLabel && <p className="text-[2.5vw] font-black text-yellow-400 uppercase leading-tight">{roundTypeLabel}</p>}
          {groupDisplay && <p className="text-[2.2vw] font-bold text-yellow-300 leading-tight mt-[0.3vh]">{groupDisplay}</p>}
          {categoryDisplay && <p className="text-[2.2vw] font-bold text-yellow-300 leading-tight mt-[0.3vh]">{categoryDisplay}</p>}
        </div>
      </div>

      {/* ═══ MAIN CONTENT AREA ═══ */}
      <div className="flex-1 flex flex-col justify-center px-[3vw] py-[2vh] min-h-0">
        {/* ── ATHLETES VIEW: during rounds and breaks ── */}
        {showAthletesView && (
          <div className="flex gap-[1.5vw] flex-1 min-h-0">
            {/* RED corner */}
            <div className={`flex-1 flex flex-col justify-center px-[3vw] py-[2vh] border-4 ${disqualifiedRed ? 'bg-gray-700 border-gray-600' : 'bg-red-600 border-red-500'}`}>
              <h2 className="text-[4.5vw] font-black text-white leading-tight">
                {match?.red_corner_full_name || 'TBD'}
              </h2>
              <p className="text-[2.5vw] font-black text-white/80 uppercase mt-[0.5vh]">
                {match?.red_corner_club_name || ''}
              </p>
              {disqualifiedRed && <p className="text-[2vw] font-black text-red-400 uppercase mt-[0.5vh]">DESCALIFICAT</p>}
            </div>

            {/* BLUE corner */}
            <div className={`flex-1 flex flex-col justify-center px-[3vw] py-[2vh] border-4 ${disqualifiedBlue ? 'bg-gray-700 border-gray-600' : 'bg-blue-600 border-blue-500'}`}>
              <h2 className="text-[4.5vw] font-black text-white leading-tight">
                {match?.blue_corner_full_name || 'TBD'}
              </h2>
              <p className="text-[2.5vw] font-black text-white/80 uppercase mt-[0.5vh]">
                {match?.blue_corner_club_name || ''}
              </p>
              {disqualifiedBlue && <p className="text-[2vw] font-black text-blue-400 uppercase mt-[0.5vh]">DESCALIFICAT</p>}
            </div>
          </div>
        )}

        {/* ── REFEREE BOXES VIEW: all rounds done — boxes color as referees submit decisions ── */}
        {showRefBoxesView && (
          <div className="flex flex-col items-center justify-center flex-1">
            {/* Disqualification / KO banner */}
            {(disqualifiedRed || disqualifiedBlue) && (
              <div className="mb-[2vh] text-center">
                <p className="text-[3vw] font-black text-red-500 uppercase tracking-wider">
                  {disqualifiedRed ? `${match?.red_corner_full_name || 'Roșu'} — DESCALIFICAT` : `${match?.blue_corner_full_name || 'Albastru'} — DESCALIFICAT`}
                </p>
              </div>
            )}
            <div className="flex gap-[1.5vw] mb-[2vh]">
              {refereeDecisionData.map((ref) => {
                // Show colored box if decision is submitted AND admin pressed winner reveal
                const showChoice = winnerRevealed && ref.choice;
                return (
                  <div key={ref.slot} className="flex flex-col items-center gap-[1vh]">
                    <div className={`w-[16vw] h-[30vh] flex items-center justify-center text-[6vw] font-black ${
                      showChoice && ref.choice === 'red' ? 'bg-red-600 text-white'
                      : showChoice && ref.choice === 'blue' ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-500'
                    }`} style={!showChoice ? { animationDelay: `${ref.slot * 0.3}s` } : undefined}>
                      A{ref.slot}
                    </div>
                    {/* Total scores per referee: red | blue (including admin adjustments) — shown only after decisions revealed */}
                    {showChoice ? (
                      <div className="flex gap-[1.5vw] items-center">
                        <span className="text-[1.4vw] font-black text-red-500 tabular-nums">{ref.totalRed + adjustRed}</span>
                        <span className="text-[1vw] text-gray-600">—</span>
                        <span className="text-[1.4vw] font-black text-blue-500 tabular-nums">{ref.totalBlue + adjustBlue}</span>
                      </div>
                    ) : (
                      <div className="flex gap-[1vw]">
                        <div className="w-[3vw] h-[0.6vh] bg-gray-600" />
                        <div className="w-[3vw] h-[0.6vh] bg-gray-600" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── WINNER VIEW: side-by-side with flashing winner ── */}
        {showWinnerView && winner && (
          <div className="flex gap-[1.5vw] flex-1 min-h-0">
            {/* RED corner */}
            <div className={`flex-1 flex flex-col justify-center px-[3vw] py-[2vh] border-4 transition-colors duration-300 ${
              winner.corner === 'red'
                ? (flashOn ? 'bg-white border-white' : 'bg-red-600 border-red-500')
                : 'bg-red-600 border-red-500'
            }`}>
              <h2 className={`text-[4.5vw] font-black leading-tight ${
                winner.corner === 'red' && flashOn ? 'text-red-600' : 'text-white'
              }`}>
                {match?.red_corner_full_name || 'TBD'}
              </h2>
              <p className={`text-[2.5vw] font-black uppercase mt-[0.5vh] ${
                winner.corner === 'red' && flashOn ? 'text-red-600/70' : 'text-white/80'
              }`}>
                {match?.red_corner_club_name || ''}
              </p>
            </div>

            {/* BLUE corner */}
            <div className={`flex-1 flex flex-col justify-center px-[3vw] py-[2vh] border-4 transition-colors duration-300 ${
              winner.corner === 'blue'
                ? (flashOn ? 'bg-white border-white' : 'bg-blue-600 border-blue-500')
                : 'bg-blue-600 border-blue-500'
            }`}>
              <h2 className={`text-[4.5vw] font-black leading-tight ${
                winner.corner === 'blue' && flashOn ? 'text-blue-600' : 'text-white'
              }`}>
                {match?.blue_corner_full_name || 'TBD'}
              </h2>
              <p className={`text-[2.5vw] font-black uppercase mt-[0.5vh] ${
                winner.corner === 'blue' && flashOn ? 'text-blue-600/70' : 'text-white/80'
              }`}>
                {match?.blue_corner_club_name || ''}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ═══ PERSISTENT BOTTOM BAR ═══ */}
      {(showAthletesView || showRefBoxesView) && (
        <div className="flex items-center justify-between px-[3vw] py-[0.8vh] shrink-0">
          {/* Red side stats */}
          <div className="flex items-center gap-[2vw]">
            {/* Infraction boxes — hidden during referee decision phase */}
            {!showRefBoxesView && (
              <div className="flex gap-[0.5vw]">
                {[0, 1, 2].map(i => (
                  <div key={i} className={`w-[2.5vw] h-[2.5vw] ${
                    i < currentInfractionsRed ? 'bg-yellow-500' : 'bg-gray-700'
                  }`} />
                ))}
              </div>
            )}
            <div>
              <p className="text-[1.6vw] text-orange-400 font-bold">
                Avertismente: {warningsRed}
                {showRefBoxesView && adjustRed !== 0 && (
                  <span className="text-red-500 ml-[1vw]">({adjustRed >= 0 ? '+' : ''}{adjustRed} pct)</span>
                )}
              </p>
              {/* Abateri — hidden during referee decision phase */}
              {!showRefBoxesView && (
                <p className="text-[1.6vw] text-yellow-400 font-bold">Abateri: {currentInfractionsRed}</p>
              )}
            </div>
          </div>

          {/* Blue side stats */}
          <div className="flex items-center gap-[2vw]">
            {/* Infraction boxes — hidden during referee decision phase */}
            {!showRefBoxesView && (
              <div className="flex gap-[0.5vw]">
                {[0, 1, 2].map(i => (
                  <div key={i} className={`w-[2.5vw] h-[2.5vw] ${
                    i < currentInfractionsBlue ? 'bg-yellow-500' : 'bg-gray-700'
                  }`} />
                ))}
              </div>
            )}
            <div>
              <p className="text-[1.6vw] text-orange-400 font-bold">
                Avertismente: {warningsBlue}
                {showRefBoxesView && adjustBlue !== 0 && (
                  <span className="text-blue-500 ml-[1vw]">({adjustBlue >= 0 ? '+' : ''}{adjustBlue} pct)</span>
                )}
              </p>
              {/* Abateri — hidden during referee decision phase */}
              {!showRefBoxesView && (
                <p className="text-[1.6vw] text-yellow-400 font-bold">Abateri: {currentInfractionsBlue}</p>
              )}
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
