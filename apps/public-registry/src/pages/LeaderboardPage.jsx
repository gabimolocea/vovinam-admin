import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Medal, RotateCcw, Trophy } from 'lucide-react';
import { athleteAPI, scoreAPI } from '@shared/lib/api';
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Select, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui';

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
    <section className="space-y-5">
      <Card className="registry-panel">
        <CardHeader>
        <Badge variant="outline" className="mb-2 w-fit"><Trophy className="mr-1.5 h-3.5 w-3.5" />Performanță oficială</Badge>
        <CardTitle className="font-display text-2xl">Clasamentul sportivilor</CardTitle>
        <CardDescription>
          Clasament bazat pe rezultate validate (approved), podium și scorurile oficiale.
        </CardDescription>
        </CardHeader>
      </Card>

      <Card className="registry-panel"><CardContent className="pt-5">
        <div className="grid gap-3 md:grid-cols-4">
          <Select
            value={clubFilter}
            onChange={(e) => setClubFilter(e.target.value)}
          >
            <option value="all">Toate cluburile</option>
            {clubOptions.map((club) => (
              <option key={club.id} value={club.id}>{club.name}</option>
            ))}
          </Select>

          <Select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
          >
            <option value="all">Toate gradele</option>
            {gradeOptions.map((gradeName) => (
              <option key={gradeName} value={gradeName}>{gradeName}</option>
            ))}
          </Select>

          <Select
            value={ageGroupFilter}
            onChange={(e) => setAgeGroupFilter(e.target.value)}
          >
            <option value="all">Toate grupele</option>
            <option value="u12">Sub 12</option>
            <option value="u16">12-15</option>
            <option value="u21">16-20</option>
            <option value="senior">21+</option>
          </Select>

          <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 text-sm text-muted-foreground">
            <span>{loading ? 'Se încarcă...' : `${leaderboardRows.length} sportivi`}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setClubFilter('all');
                setGradeFilter('all');
                setAgeGroupFilter('all');
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />Reset
            </Button>
          </div>
        </div>
      </CardContent></Card>

      {error && (
        <Alert variant="destructive">{error}</Alert>
      )}

      <Card className="registry-panel overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/60">
            <tr>
              <TableHead>Loc</TableHead><TableHead>Sportiv</TableHead><TableHead>Club</TableHead><TableHead>Podium</TableHead><TableHead>Participări</TableHead><TableHead>Scor mediu</TableHead><TableHead className="text-right">Punctaj</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {loading && [0, 1, 2].map((row) => <TableRow key={row}><TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell></TableRow>)}
            {!loading && leaderboardRows.length === 0 && (
              <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Nu există date pentru filtrele selectate.</TableCell></TableRow>
            )}
            {leaderboardRows.map((row, index) => (
              <TableRow key={row.athleteId}>
                <TableCell><Badge variant={index < 3 ? 'default' : 'outline'}><Medal className="mr-1 h-3 w-3" />{index + 1}</Badge></TableCell>
                <TableCell><Button asChild variant="ghost" size="sm" className="px-0"><Link to={`/athletes/${row.athleteId}`}>{row.athlete?.first_name} {row.athlete?.last_name}<ArrowRight className="h-3.5 w-3.5" /></Link></Button></TableCell>
                <TableCell className="text-muted-foreground">{row.athlete?.club?.name || '-'}</TableCell>
                <TableCell>{row.firstPlaces} / {row.secondPlaces} / {row.thirdPlaces}</TableCell>
                <TableCell>{row.appearances}</TableCell>
                <TableCell>{row.averageScore.toFixed(2)}</TableCell>
                <TableCell className="text-right font-semibold">{row.rankingPoints.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </section>
  );
}
