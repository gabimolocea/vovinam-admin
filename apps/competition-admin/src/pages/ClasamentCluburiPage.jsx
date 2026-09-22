import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { scoreAPI } from '@shared/lib/api';
import { CentralizatorContext } from './CategoriesLayout';
import { Badge, Spinner, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui';

const PODIUM_STYLES = {
  1: 'border-transparent bg-yellow-100 text-yellow-900',
  2: 'border-transparent bg-gray-100 text-gray-800',
  3: 'border-transparent bg-amber-100 text-amber-900',
};

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

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

// Reads the same persisted CategoryAthlete.place the bracket page's own
// medal display already trusts (set server-side by _set_category_place on
// match advance), instead of independently re-walking the match tree and
// re-deriving a winner from match.winner/referee scores - see the
// matching comment in ClasamenteLuptaPage.jsx for why that re-derivation
// can silently come up empty even when the real placement was recorded.
function buildFightPodiumFromEnrollment(category, athleteClubMap) {
  const podium = { 1: [], 2: [], 3: [] };
  (category.enrolled_athletes || []).forEach(enrollment => {
    const place = enrollment.place;
    if (place !== 1 && place !== 2 && place !== 3) return;
    const club = athleteClubMap.get(enrollment.athlete);
    if (!club) return;
    podium[place].push({ id: enrollment.athlete, clubId: club.id, clubName: club.name });
  });
  return podium;
}

function medalKey(place) {
  return place === 1 ? 'gold' : place === 2 ? 'silver' : 'bronze';
}

export default function ClasamentCluburiPage() {
  const { id: eventId } = useParams();
  const ctx = useContext(CentralizatorContext);
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);

  const categories = ctx?.categories ?? [];

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      setLoading(true);
      try {
        const { data: scoreData } = await scoreAPI.list({ event_id: eventId });
        if (isMounted) setScores(normalizeListPayload(scoreData));
      } catch (error) {
        console.error('Failed to load club standings:', error);
        if (isMounted) setScores([]);
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

    categories.forEach(category => {
      if (category.type !== 'fight') return;
      const podium = buildFightPodiumFromEnrollment(category, athleteClubMap);
      [1, 2, 3].forEach(place => {
        (podium[place] || []).forEach(item => addClubMedal(item.clubId, item.clubName, place));
      });
    });

    return [...medalMap.values()]
      .filter(club => club.total > 0)
      .sort((a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || a.clubName.localeCompare(b.clubName));

  }, [scores, categories, athleteClubMap]);

  if (!ctx) return null;

  if (loading) {
    return <div className="flex-1 flex items-center justify-center bg-background"><Spinner /></div>;
  }

  if (clubMedals.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background text-sm italic text-muted-foreground p-4 text-center">
        <span>📋 Nu există încă medalii atribuite cluburilor.</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-background p-2">
      <div className="mx-auto max-w-6xl">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead colSpan={6} className="bg-muted text-center text-sm uppercase tracking-wide text-foreground">
                Clasament Cluburi
              </TableHead>
            </TableRow>
            <TableRow>
              <TableHead className="w-[88px] text-center">Loc</TableHead>
              <TableHead>Club</TableHead>
              <TableHead className="w-[86px] text-center">Aur</TableHead>
              <TableHead className="w-[86px] text-center">Argint</TableHead>
              <TableHead className="w-[86px] text-center">Bronz</TableHead>
              <TableHead className="w-[86px] text-center">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clubMedals.map((club, index) => (
              <TableRow key={club.clubId}>
                <TableCell className="text-center">
                  <Badge className={PODIUM_STYLES[index + 1] || 'border-transparent bg-secondary text-secondary-foreground'}>
                    {MEDALS[index + 1] ? `${MEDALS[index + 1]} ` : ''}Locul {index + 1}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium text-foreground">{club.clubName}</TableCell>
                <TableCell className="text-center font-bold text-yellow-700">{club.gold}</TableCell>
                <TableCell className="text-center font-bold text-muted-foreground">{club.silver}</TableCell>
                <TableCell className="text-center font-bold text-amber-700">{club.bronze}</TableCell>
                <TableCell className="text-center font-bold text-foreground">{club.total}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}