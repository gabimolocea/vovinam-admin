import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { athleteAPI, scoreAPI } from '@shared/lib/api';

function getAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

function getAgeGroup(age) {
  if (age == null) return 'unknown';
  if (age < 12) return 'u12';
  if (age < 16) return 'u16';
  if (age < 21) return 'u21';
  return 'senior';
}

function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function parseScoreValue(score) {
  const parsed = Number(score);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function LeaderboardPage() {
  const [athletes, setAthletes] = useState([]);
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [clubFilter, setClubFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [ageGroupFilter, setAgeGroupFilter] = useState('all');

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const [athleteResponse, scoreResponse] = await Promise.all([
          athleteAPI.list(),
          scoreAPI.list({ status: 'approved' }),
        ]);

        if (!isMounted) return;

        setAthletes(toArray(athleteResponse?.data));
        setScores(toArray(scoreResponse?.data));
      } catch (err) {
        if (!isMounted) return;
        const message = err?.response?.data?.detail || err?.message || 'Nu s-a putut încărca clasamentul.';
        setError(message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const athleteMap = useMemo(() => {
    const map = new Map();
    athletes.forEach((athlete) => {
      if (athlete?.id) map.set(Number(athlete.id), athlete);
    });
    return map;
  }, [athletes]);

  const clubOptions = useMemo(() => {
    const map = new Map();
    athletes.forEach((athlete) => {
      if (athlete?.club?.id) {
        map.set(String(athlete.club.id), athlete.club.name || 'Club necunoscut');
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [athletes]);

  const gradeOptions = useMemo(() => {
    const set = new Set();
    athletes.forEach((athlete) => {
      const gradeName = athlete?.current_grade?.name;
      if (gradeName) set.add(gradeName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [athletes]);

  const leaderboardRows = useMemo(() => {
    const byAthlete = new Map();

    scores.forEach((scoreItem) => {
      if (String(scoreItem?.status || '').toLowerCase() !== 'approved') return;
      if (String(scoreItem?.type || '').toLowerCase() === 'teams') return;

      const athleteId = Number(scoreItem?.athlete?.id || scoreItem?.athlete);
      if (!Number.isFinite(athleteId)) return;

      const athlete = athleteMap.get(athleteId);
      if (!athlete) return;

      if (athlete?.status && athlete.status !== 'approved') return;

      const age = getAge(athlete?.date_of_birth);
      const ageGroup = getAgeGroup(age);
      const clubId = String(athlete?.club?.id || '');
      const gradeName = athlete?.current_grade?.name || '';

      if (clubFilter !== 'all' && clubFilter !== clubId) return;
      if (gradeFilter !== 'all' && gradeFilter !== gradeName) return;
      if (ageGroupFilter !== 'all' && ageGroupFilter !== ageGroup) return;

      const current = byAthlete.get(athleteId) || {
        athleteId,
        athlete,
        appearances: 0,
        firstPlaces: 0,
        secondPlaces: 0,
        thirdPlaces: 0,
        totalScore: 0,
      };

      current.appearances += 1;
      current.totalScore += parseScoreValue(scoreItem?.score);

      if (scoreItem?.placement_claimed === '1st') current.firstPlaces += 1;
      if (scoreItem?.placement_claimed === '2nd') current.secondPlaces += 1;
      if (scoreItem?.placement_claimed === '3rd') current.thirdPlaces += 1;

      byAthlete.set(athleteId, current);
    });

    return Array.from(byAthlete.values())
      .map((row) => {
        const rankingPoints = (row.firstPlaces * 5) + (row.secondPlaces * 3) + (row.thirdPlaces * 2) + row.appearances + (row.totalScore * 0.1);
        return {
          ...row,
          rankingPoints,
          averageScore: row.appearances > 0 ? row.totalScore / row.appearances : 0,
        };
      })
      .sort((a, b) => {
        if (b.rankingPoints !== a.rankingPoints) return b.rankingPoints - a.rankingPoints;
        if (b.firstPlaces !== a.firstPlaces) return b.firstPlaces - a.firstPlaces;
        if (b.secondPlaces !== a.secondPlaces) return b.secondPlaces - a.secondPlaces;
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        const aName = `${a.athlete?.last_name || ''} ${a.athlete?.first_name || ''}`.toLowerCase();
        const bName = `${b.athlete?.last_name || ''} ${b.athlete?.first_name || ''}`.toLowerCase();
        return aName.localeCompare(bName);
      });
  }, [scores, athleteMap, clubFilter, gradeFilter, ageGroupFilter]);

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h1 className="text-xl font-black text-gray-900">Clasament Public Sportivi</h1>
        <p className="mt-1 text-sm text-gray-600">
          Clasament bazat pe rezultate validate (approved), podium și scorurile oficiale.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <select
            value={clubFilter}
            onChange={(e) => setClubFilter(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-blue-500 focus:ring"
          >
            <option value="all">Toate cluburile</option>
            {clubOptions.map((club) => (
              <option key={club.id} value={club.id}>{club.name}</option>
            ))}
          </select>

          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-blue-500 focus:ring"
          >
            <option value="all">Toate gradele</option>
            {gradeOptions.map((gradeName) => (
              <option key={gradeName} value={gradeName}>{gradeName}</option>
            ))}
          </select>

          <select
            value={ageGroupFilter}
            onChange={(e) => setAgeGroupFilter(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-blue-500 focus:ring"
          >
            <option value="all">Toate grupele</option>
            <option value="u12">Sub 12</option>
            <option value="u16">12-15</option>
            <option value="u21">16-20</option>
            <option value="senior">21+</option>
          </select>

          <div className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700">
            <span>{loading ? 'Se încarcă...' : `${leaderboardRows.length} sportivi`}</span>
            <button
              type="button"
              onClick={() => {
                setClubFilter('all');
                setGradeFilter('all');
                setAgeGroupFilter('all');
              }}
              className="text-xs font-semibold text-blue-700 hover:underline"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Loc</th>
              <th className="px-4 py-3">Sportiv</th>
              <th className="px-4 py-3">Club</th>
              <th className="px-4 py-3">1st / 2nd / 3rd</th>
              <th className="px-4 py-3">Participări</th>
              <th className="px-4 py-3">Scor mediu</th>
              <th className="px-4 py-3">Punctaj clasament</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!loading && leaderboardRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">Nu există date pentru filtrele selectate.</td>
              </tr>
            )}
            {leaderboardRows.map((row, index) => (
              <tr key={row.athleteId} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-black text-gray-900">#{index + 1}</td>
                <td className="px-4 py-3 text-gray-900">
                  <Link to={`/athletes/${row.athleteId}`} className="font-semibold text-blue-700 hover:underline">
                    {row.athlete?.first_name} {row.athlete?.last_name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-700">{row.athlete?.club?.name || '-'}</td>
                <td className="px-4 py-3 text-gray-700">{row.firstPlaces} / {row.secondPlaces} / {row.thirdPlaces}</td>
                <td className="px-4 py-3 text-gray-700">{row.appearances}</td>
                <td className="px-4 py-3 text-gray-700">{row.averageScore.toFixed(2)}</td>
                <td className="px-4 py-3 font-semibold text-gray-900">{row.rankingPoints.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
