import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Spinner } from '@shared/components/ui';
import { matchAPI, matchRefereeScoreAPI, scoreAPI } from '@shared/lib/api';
import { CentralizatorContext } from './CategoriesLayout';

const PODIUM_STYLES = {
  1: 'bg-yellow-100 text-yellow-900 border-yellow-300',
  2: 'bg-gray-100 text-gray-800 border-gray-300',
  3: 'bg-amber-100 text-amber-900 border-amber-300',
};

function normalizeListPayload(data) {
  return Array.isArray(data) ? data : data?.results ?? [];
}

function getTechniqueDisplayTotal(result) {
  const refereeScores = Array.isArray(result?.referee_scores) ? result.referee_scores : [];
  const numericScores = refereeScores.map(score => Number(score?.score)).filter(Number.isFinite);
  if (numericScores.length >= 3) {
    const sorted = [...numericScores].sort((a, b) => a - b);
    return sorted.slice(1, -1).reduce((sum, value) => sum + value, 0);
  }
  if (numericScores.length > 0) return numericScores.reduce((sum, value) => sum + value, 0);
  return null;
}

function uniqueByKey(items, getKey) {
  const seen = new Set();
  return items.filter(item => {
    const key = getKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveWinnerCorner(match, refereeScores) {
  if (match?.winner && match.winner === match.red_corner) return 'red';
  if (match?.winner && match.winner === match.blue_corner) return 'blue';
  const decisions = (refereeScores || []).filter(score => score.round == null);
  const redVotes = decisions.filter(score => Number(score.red_corner_score) > Number(score.blue_corner_score)).length;
  const blueVotes = decisions.filter(score => Number(score.blue_corner_score) > Number(score.red_corner_score)).length;
  if (redVotes > blueVotes) return 'red';
  if (blueVotes > redVotes) return 'blue';
  return null;
}

function getIncomingWinnerMatches(matches, targetMatchId) {
  return matches.filter(match => match.next_match === targetMatchId);
}

function getIncomingLoserMatches(matches, targetMatchId) {
  return matches.filter(match => match.loser_next_match === targetMatchId);
}

function getFinalMatch(matches) {
  const explicitFinals = matches
    .filter(match => match.match_type === 'finals')
    .sort((a, b) => (b.round_number || 0) - (a.round_number || 0) || (a.bracket_position || 0) - (b.bracket_position || 0));
  if (explicitFinals.length > 0) return explicitFinals[0];
  return matches
    .filter(match => match.match_type !== 'bronze' && !match.next_match)
    .sort((a, b) => (b.round_number || 0) - (a.round_number || 0) || (a.bracket_position || 0) - (b.bracket_position || 0))[0] || null;
}

function getBronzeMatch(matches) {
  const explicitBronze = matches
    .filter(match => match.match_type === 'bronze')
    .sort((a, b) => (b.round_number || 0) - (a.round_number || 0) || (a.bracket_position || 0) - (b.bracket_position || 0));
  if (explicitBronze.length > 0) return explicitBronze[0];
  return matches
    .filter(match => getIncomingLoserMatches(matches, match.id).length > 0)
    .sort((a, b) => (b.round_number || 0) - (a.round_number || 0) || (a.bracket_position || 0) - (b.bracket_position || 0))[0] || null;
}

function getCornerCompetitor(match, corner, athleteClubMap) {
  if (!match) return null;
  const athleteId = match[`${corner}_corner`];
  const clubFromAthlete = athleteClubMap.get(athleteId);
  const clubName = clubFromAthlete?.name || match[`${corner}_corner_club_name`] || '';
  return athleteId || clubName ? {
    id: athleteId ?? `${corner}-${match.id}`,
    clubId: clubFromAthlete?.id ?? clubName,
    clubName,
  } : null;
}

function getWinnerCompetitor(match, athleteClubMap) {
  if (!match?.resolvedWinnerCorner) return null;
  return getCornerCompetitor(match, match.resolvedWinnerCorner, athleteClubMap);
}

function getLoserCompetitor(match, athleteClubMap) {
  if (!match?.resolvedWinnerCorner) return null;
  return getCornerCompetitor(match, match.resolvedWinnerCorner === 'red' ? 'blue' : 'red', athleteClubMap);
}

function buildFightPodiumFromBracket(categoryMatches, athleteClubMap) {
  const podium = { 1: [], 2: [], 3: [] };
  const finalMatch = getFinalMatch(categoryMatches);
  const bronzeMatch = getBronzeMatch(categoryMatches);
  const firstPlace = getWinnerCompetitor(finalMatch, athleteClubMap);
  const secondPlace = getLoserCompetitor(finalMatch, athleteClubMap);
  if (firstPlace) podium[1] = [firstPlace];
  if (secondPlace) podium[2] = [secondPlace];

  const semifinalMatches = finalMatch
    ? getIncomingWinnerMatches(categoryMatches, finalMatch.id)
    : categoryMatches.filter(match => match.match_type === 'semi-finals');

  const semifinalLosers = uniqueByKey(
    semifinalMatches
      .map(match => getLoserCompetitor(match, athleteClubMap))
      .filter(Boolean)
      .filter(item => item.id !== firstPlace?.id && item.id !== secondPlace?.id),
    item => item.id,
  );

  const bronzeWinner = getWinnerCompetitor(bronzeMatch, athleteClubMap);
  const bronzeParticipants = uniqueByKey(
    bronzeMatch
      ? [getCornerCompetitor(bronzeMatch, 'red', athleteClubMap), getCornerCompetitor(bronzeMatch, 'blue', athleteClubMap)].filter(Boolean)
      : [],
    item => item.id,
  );

  const bronzeIsStandard = bronzeParticipants.length >= 2
    && bronzeParticipants.every(item => semifinalLosers.some(semiLoser => semiLoser.id === item.id));

  if (bronzeWinner && bronzeWinner.id !== firstPlace?.id && bronzeWinner.id !== secondPlace?.id && bronzeIsStandard) {
    podium[3] = [bronzeWinner];
  } else if (semifinalLosers.length > 0) {
    podium[3] = semifinalLosers.slice(0, 2);
  }

  return podium;
}

function medalKey(place) {
  return place === 1 ? 'gold' : place === 2 ? 'silver' : 'bronze';
}

export default function ClasamentCluburiPage() {
  const { id: eventId } = useParams();
  const ctx = useContext(CentralizatorContext);
  const [scores, setScores] = useState([]);
  const [matches, setMatches] = useState([]);
  const [matchRefereeScores, setMatchRefereeScores] = useState([]);
  const [loading, setLoading] = useState(true);

  const categories = ctx?.categories ?? [];

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      setLoading(true);
      try {
        const [{ data: scoreData }, { data: matchData }, { data: matchScoreData }] = await Promise.all([
          scoreAPI.list({ event_id: eventId }),
          matchAPI.list({ event_id: eventId }),
          matchRefereeScoreAPI.list({ event_id: eventId }),
        ]);

        if (isMounted) {
          setScores(normalizeListPayload(scoreData));
          setMatches(normalizeListPayload(matchData));
          setMatchRefereeScores(normalizeListPayload(matchScoreData));
        }
      } catch (error) {
        console.error('Failed to load club standings:', error);
        if (isMounted) {
          setScores([]);
          setMatches([]);
          setMatchRefereeScores([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();
    return () => { isMounted = false; };
  }, [eventId]);

  const athleteClubMap = useMemo(() => {
    const map = new Map();
    categories.forEach(category => {
      (category.enrolled_athletes || []).forEach(enrollment => {
        const athleteId = enrollment.athlete;
        const details = enrollment.athlete_details || {};
        const club = details.club || null;
        const clubName = club?.name || details.club_name || '';
        if (athleteId && clubName) {
          map.set(athleteId, { id: club?.id ?? clubName, name: clubName });
        }
      });
    });
    return map;
  }, [categories]);

  const clubMedals = useMemo(() => {
    const medalMap = new Map();

    const ensureClub = (clubId, clubName) => {
      const key = clubId ?? clubName;
      if (!key || !clubName) return null;
      if (!medalMap.has(key)) {
        medalMap.set(key, { clubId: key, clubName, gold: 0, silver: 0, bronze: 0, total: 0 });
      }
      return medalMap.get(key);
    };

    const addClubMedal = (clubId, clubName, place) => {
      const club = ensureClub(clubId, clubName);
      if (!club) return;
      club[medalKey(place)] += 1;
      club.total += 1;
    };

    const techniqueByCategory = new Map();
    scores
      .filter(result => result?.status !== 'rejected' && getTechniqueDisplayTotal(result) != null)
      .forEach(result => {
        if (!techniqueByCategory.has(result.category)) techniqueByCategory.set(result.category, []);
        techniqueByCategory.get(result.category).push(result);
      });

    techniqueByCategory.forEach(results => {
      results.sort((a, b) => getTechniqueDisplayTotal(b) - getTechniqueDisplayTotal(a));
      results.slice(0, 3).forEach((result, index) => {
        const place = index + 1;
        const athleteId = result.athlete?.id ?? result.athlete;
        const teamClubs = Array.isArray(result.team_members)
          ? uniqueByKey(
              result.team_members
                .map(member => athleteClubMap.get(member.id))
                .filter(Boolean),
              club => club.id,
            )
          : [];

        if (teamClubs.length > 0) {
          teamClubs.forEach(club => addClubMedal(club.id, club.name, place));
        } else {
          const club = athleteClubMap.get(athleteId);
          if (club) addClubMedal(club.id, club.name, place);
        }
      });
    });

    const scoresByMatch = new Map();
    matchRefereeScores.forEach(score => {
      if (!scoresByMatch.has(score.match)) scoresByMatch.set(score.match, []);
      scoresByMatch.get(score.match).push(score);
    });

    const fightByCategory = new Map();
    matches.forEach(match => {
      const enrichedMatch = {
        ...match,
        resolvedWinnerCorner: resolveWinnerCorner(match, scoresByMatch.get(match.id) || []),
      };
      if (!fightByCategory.has(match.category)) fightByCategory.set(match.category, []);
      fightByCategory.get(match.category).push(enrichedMatch);
    });

    fightByCategory.forEach(categoryMatches => {
      const podium = buildFightPodiumFromBracket(categoryMatches, athleteClubMap);
      [1, 2, 3].forEach(place => {
        (podium[place] || []).forEach(item => addClubMedal(item.clubId, item.clubName, place));
      });
    });

    return [...medalMap.values()]
      .filter(club => club.total > 0)
      .sort((a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || a.clubName.localeCompare(b.clubName));
      
  }, [scores, matches, matchRefereeScores, athleteClubMap]);

  if (!ctx) return null;

  if (loading) {
    return <div className="flex-1 flex items-center justify-center bg-white"><Spinner /></div>;
  }

  if (clubMedals.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white text-gray-400 text-sm italic p-4 text-center">
        <span>📋 Nu există încă medalii atribuite cluburilor.</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-white p-2">
      <div className="mx-auto max-w-6xl overflow-x-auto">
        <table className="border-collapse text-sm w-full">
          <thead>
            <tr>
              <th
                colSpan={6}
                className="bg-yellow-300 border border-black px-2 sm:px-3 py-1.5 text-center font-bold text-sm text-gray-900 uppercase tracking-wide"
              >
                Clasament Cluburi
              </th>
            </tr>
            <tr>
              <th className="bg-gray-200 border border-black px-2 py-1.5 text-center font-bold text-[11px] text-gray-900 uppercase tracking-wide w-[88px]">Loc</th>
              <th className="bg-gray-200 border border-black px-2 py-1.5 text-left font-bold text-[11px] text-gray-900 uppercase tracking-wide">Club</th>
              <th className="bg-gray-200 border border-black px-2 py-1.5 text-center font-bold text-[11px] text-gray-900 uppercase tracking-wide w-[86px]">Aur</th>
              <th className="bg-gray-200 border border-black px-2 py-1.5 text-center font-bold text-[11px] text-gray-900 uppercase tracking-wide w-[86px]">Argint</th>
              <th className="bg-gray-200 border border-black px-2 py-1.5 text-center font-bold text-[11px] text-gray-900 uppercase tracking-wide w-[86px]">Bronz</th>
              <th className="bg-gray-200 border border-black px-2 py-1.5 text-center font-bold text-[11px] text-gray-900 uppercase tracking-wide w-[86px]">Total</th>
            </tr>
          </thead>
          <tbody>
            {clubMedals.map((club, index) => (
              <tr key={club.clubId}>
                <td className="border border-black/30 px-2 py-1.5 text-center bg-gray-50">
                  <span className={`inline-flex min-w-[56px] justify-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${PODIUM_STYLES[index + 1] || 'bg-gray-100 text-gray-700 border-gray-300'}`}>
                    Locul {index + 1}
                  </span>
                </td>
                <td className="border border-black/30 px-2 py-1.5 text-sm text-gray-900 font-medium">{club.clubName}</td>
                <td className="border border-black/30 px-2 py-1.5 text-center text-sm font-bold text-yellow-700">{club.gold}</td>
                <td className="border border-black/30 px-2 py-1.5 text-center text-sm font-bold text-gray-700">{club.silver}</td>
                <td className="border border-black/30 px-2 py-1.5 text-center text-sm font-bold text-amber-700">{club.bronze}</td>
                <td className="border border-black/30 px-2 py-1.5 text-center text-sm font-bold text-gray-900">{club.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}