import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Spinner } from '@shared/components/ui';
import { matchAPI, matchRefereeScoreAPI } from '@shared/lib/api';
import { CentralizatorContext, GENDER_LABELS } from './CategoriesLayout';

const PODIUM_STYLES = {
  1: 'bg-yellow-100 text-yellow-900 border-yellow-300',
  2: 'bg-gray-100 text-gray-800 border-gray-300',
  3: 'bg-amber-100 text-amber-900 border-amber-300',
};

function normalizeListPayload(data) {
  return Array.isArray(data) ? data : data?.results ?? [];
}

function uniqueCompetitors(items) {
  const seen = new Set();
  return items.filter(item => {
    if (!item?.label) return false;
    const key = item.id ?? item.label;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getCornerCompetitor(match, corner) {
  if (!match) return null;

  const athleteId = match[`${corner}_corner`];
  const label = match[`${corner}_corner_full_name`] || '—';
  const club = match[`${corner}_corner_club_name`] || '';

  if (!athleteId && !label) return null;

  return {
    id: athleteId ?? `${corner}-${match.id}`,
    label,
    club,
  };
}

function getWinnerCompetitor(match) {
  if (!match?.resolvedWinnerCorner) return null;
  if (match.resolvedWinnerCorner === 'red') return getCornerCompetitor(match, 'red');
  if (match.resolvedWinnerCorner === 'blue') return getCornerCompetitor(match, 'blue');
  return null;
}

function getLoserCompetitor(match) {
  if (!match?.resolvedWinnerCorner) return null;
  if (match.resolvedWinnerCorner === 'red') return getCornerCompetitor(match, 'blue');
  if (match.resolvedWinnerCorner === 'blue') return getCornerCompetitor(match, 'red');
  return null;
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

  const graphFinals = matches
    .filter(match => match.match_type !== 'bronze' && !match.next_match)
    .sort((a, b) => (b.round_number || 0) - (a.round_number || 0) || (a.bracket_position || 0) - (b.bracket_position || 0));

  return graphFinals[0] || null;
}

function getBronzeMatch(matches) {
  const explicitBronze = matches
    .filter(match => match.match_type === 'bronze')
    .sort((a, b) => (b.round_number || 0) - (a.round_number || 0) || (a.bracket_position || 0) - (b.bracket_position || 0));

  if (explicitBronze.length > 0) return explicitBronze[0];

  const loserDriven = matches
    .filter(match => getIncomingLoserMatches(matches, match.id).length > 0)
    .sort((a, b) => (b.round_number || 0) - (a.round_number || 0) || (a.bracket_position || 0) - (b.bracket_position || 0));

  return loserDriven[0] || null;
}

function buildPodiumFromBracket(categoryMatches) {
  const podium = { 1: [], 2: [], 3: [] };
  const finalMatch = getFinalMatch(categoryMatches);
  const bronzeMatch = getBronzeMatch(categoryMatches);

  const firstPlace = getWinnerCompetitor(finalMatch);
  const secondPlace = getLoserCompetitor(finalMatch);

  if (firstPlace) podium[1] = [firstPlace];
  if (secondPlace) podium[2] = [secondPlace];

  const semifinalMatches = finalMatch
    ? getIncomingWinnerMatches(categoryMatches, finalMatch.id)
    : categoryMatches.filter(match => match.match_type === 'semi-finals');

  const semifinalLosers = uniqueCompetitors(
    semifinalMatches
      .map(getLoserCompetitor)
      .filter(Boolean)
      .filter(item => item.id !== firstPlace?.id && item.id !== secondPlace?.id)
  );

  const bronzeWinner = getWinnerCompetitor(bronzeMatch);
  const bronzeParticipants = uniqueCompetitors(
    bronzeMatch
      ? [getCornerCompetitor(bronzeMatch, 'red'), getCornerCompetitor(bronzeMatch, 'blue')].filter(Boolean)
      : []
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

function GroupHeader({ group }) {
  return (
    <>
      {group.name}
      {(group.birth_date_start || group.birth_year_start) && (
        <span className="font-normal ml-1">
          ( {group.birth_date_start
            ? `${new Date(group.birth_date_start).getFullYear()}–${new Date(group.birth_date_end).getFullYear()}`
            : `${group.birth_year_start}–${group.birth_year_end}`} )
        </span>
      )}
      {group.allowed_grade_type === 'inferior' && (
        <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-500/20 text-amber-800 text-[8px] font-medium px-1.5 py-0.5">
          Grade inferioare
        </span>
      )}
      {group.allowed_grade_type === 'superior' && (
        <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-500/20 text-emerald-800 text-[8px] font-medium px-1.5 py-0.5">
          Grade superioare
        </span>
      )}
    </>
  );
}

export default function ClasamenteLuptaPage() {
  const { id: eventId } = useParams();
  const ctx = useContext(CentralizatorContext);
  const [matches, setMatches] = useState([]);
  const [matchRefereeScores, setMatchRefereeScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const columnStructure = ctx?.columnStructure ?? [];

  useEffect(() => {
    let isMounted = true;

    const loadMatches = async () => {
      setLoading(true);
      try {
        const [{ data: matchData }, { data: scoreData }] = await Promise.all([
          matchAPI.list({ event_id: eventId }),
          matchRefereeScoreAPI.list({ event_id: eventId }),
        ]);
        if (isMounted) {
          setMatches(normalizeListPayload(matchData));
          setMatchRefereeScores(normalizeListPayload(scoreData));
        }
      } catch (error) {
        console.error('Failed to load fight rankings:', error);
        if (isMounted) {
          setMatches([]);
          setMatchRefereeScores([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadMatches();
    return () => {
      isMounted = false;
    };
  }, [eventId]);

  const fightGroups = useMemo(() => {
    const seenCatIds = new Set();
    return columnStructure
      .map(col => ({
        group: col.group,
        cats: col.cats.filter(cat => {
          if (seenCatIds.has(cat.id)) return false;
          if (cat.type !== 'fight') return false;
          seenCatIds.add(cat.id);
          return true;
        }),
      }))
      .filter(group => group.cats.length > 0);
  }, [columnStructure]);

  const podiumByCategory = useMemo(() => {
    const groupedMatches = new Map();
    const scoresByMatch = new Map();

    matchRefereeScores.forEach(score => {
      if (!scoresByMatch.has(score.match)) scoresByMatch.set(score.match, []);
      scoresByMatch.get(score.match).push(score);
    });

    matches.forEach(match => {
      const resolvedWinnerCorner = resolveWinnerCorner(match, scoresByMatch.get(match.id) || []);
      const enrichedMatch = { ...match, resolvedWinnerCorner };
      if (!groupedMatches.has(match.category)) groupedMatches.set(match.category, []);
      groupedMatches.get(match.category).push(enrichedMatch);
    });

    const podiumMap = new Map();

    groupedMatches.forEach((categoryMatches, categoryId) => {
      podiumMap.set(categoryId, buildPodiumFromBracket(categoryMatches));
    });

    return podiumMap;
  }, [matches, matchRefereeScores]);

  if (!ctx) return null;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <Spinner />
      </div>
    );
  }

  if (fightGroups.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white text-gray-400 text-sm italic p-4 text-center">
        <span>📋 Nu există categorii de tip Luptă pentru clasamente.</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-white p-2">
      {fightGroups.map(({ group, cats }) => (
        <div key={`clas-fight-${group.id}`} className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {cats.map(cat => {
            const podium = podiumByCategory.get(cat.id) || { 1: [], 2: [], 3: [] };

            return (
              <div key={cat.id} className="overflow-x-auto">
                <table className="border-collapse text-sm w-full">
                  <thead>
                    <tr>
                      <th
                        colSpan={3}
                        className="bg-yellow-300 border border-black px-2 sm:px-3 py-1.5 text-center font-bold text-sm text-gray-900"
                      >
                        <GroupHeader group={group} />
                      </th>
                    </tr>
                    <tr>
                      <th
                        colSpan={3}
                        className={`border border-black px-2 py-1.5 text-left font-bold text-xs uppercase tracking-wide ${
                          cat.gender === 'male'
                            ? 'bg-blue-100 text-blue-900'
                            : cat.gender === 'female'
                              ? 'bg-pink-100 text-pink-900'
                              : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        Clasament · {cat.name} · {GENDER_LABELS[cat.gender] || cat.gender}
                      </th>
                    </tr>
                    <tr>
                      <th className="bg-gray-200 border border-black px-2 py-1.5 text-center font-bold text-[11px] text-gray-900 uppercase tracking-wide w-[72px]">
                        Loc
                      </th>
                      <th className="bg-gray-200 border border-black px-2 py-1.5 text-left font-bold text-[11px] text-gray-900 uppercase tracking-wide">
                        Sportiv
                      </th>
                      <th className="bg-gray-200 border border-black px-2 py-1.5 text-left font-bold text-[11px] text-gray-900 uppercase tracking-wide w-[96px]">
                        Club
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3].map(place => {
                      const athletes = podium[place] || [];
                      const label = athletes.length ? athletes.map(item => item.label).join(place === 3 && athletes.length > 1 ? ' / ' : ', ') : '—';
                      const club = athletes.length ? athletes.map(item => item.club).filter(Boolean).join(place === 3 && athletes.length > 1 ? ' / ' : ', ') : '—';

                      return (
                        <tr key={`${cat.id}-${place}`}>
                          <td className="border border-black/30 px-2 py-1.5 text-center bg-gray-50 align-top">
                            <span className={`inline-flex min-w-[56px] justify-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${PODIUM_STYLES[place]}`}>
                              Locul {place}
                            </span>
                          </td>
                          <td className="border border-black/30 px-2 py-1.5 text-sm text-gray-900">
                            <div className="font-medium">{label}</div>
                            {place === 3 && athletes.length > 1 && (
                              <div className="text-[11px] text-gray-500 mt-0.5">Loc împărțit între semifinaliști</div>
                            )}
                          </td>
                          <td className="border border-black/30 px-2 py-1.5 text-sm text-gray-600">{club}</td>
                        </tr>
                      );
                    })}
                    {!podium[1]?.length && !podium[2]?.length && !podium[3]?.length && (
                      <tr>
                        <td colSpan={3} className="border border-black/30 px-3 py-4 text-center text-sm text-gray-400 italic">
                          Podiumul nu este încă stabilit pentru această categorie.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
