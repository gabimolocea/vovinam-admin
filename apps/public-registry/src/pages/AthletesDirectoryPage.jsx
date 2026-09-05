import { useDeferredValue, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, RotateCcw, Search, UserRound } from 'lucide-react';
import { athleteAPI, cityAPI, clubAPI, gradeAPI } from '@shared/lib/api';
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Select, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui';

export default function AthletesDirectoryPage() {
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [clubFilter, setClubFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [ageGroupFilter, setAgeGroupFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [clubs, setClubs] = useState([]);
  const [grades, setGrades] = useState([]);
  const [cities, setCities] = useState([]);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const deferredQuery = useDeferredValue(query.trim());

  useEffect(() => {
    Promise.all([clubAPI.list(), gradeAPI.list(), cityAPI.list()]).then(([clubResponse, gradeResponse, cityResponse]) => {
      setClubs(Array.isArray(clubResponse.data) ? clubResponse.data : clubResponse.data?.results ?? []);
      setGrades(Array.isArray(gradeResponse.data) ? gradeResponse.data : gradeResponse.data?.results ?? []);
      setCities(Array.isArray(cityResponse.data) ? cityResponse.data : cityResponse.data?.results ?? []);
    }).catch(() => {
      setError('Filtrele nu au putut fi încărcate complet.');
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function fetchAthletes() {
      setLoading(true);
      setError('');
      try {
        const response = await athleteAPI.list({
          paginate: true,
          page,
          page_size: 20,
          q: deferredQuery || undefined,
          club: clubFilter === 'all' ? undefined : clubFilter,
          grade: gradeFilter === 'all' ? undefined : gradeFilter,
          city: cityFilter === 'all' ? undefined : cityFilter,
          age_group: ageGroupFilter === 'all' ? undefined : ageGroupFilter,
        });
        if (!isMounted) return;
        const payload = response?.data || {};
        setAthletes(Array.isArray(payload) ? payload : payload.results ?? []);
        setCount(Array.isArray(payload) ? payload.length : payload.count ?? 0);
        setHasNext(Boolean(payload.next));
      } catch (err) {
        if (!isMounted) return;
        const message = err?.response?.data?.detail || err?.message || 'Nu s-a putut încărca lista sportivilor.';
        setError(message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchAthletes();
    return () => {
      isMounted = false;
    };
  }, [page, deferredQuery, clubFilter, gradeFilter, ageGroupFilter, cityFilter]);

  const updateFilter = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  return (
    <section className="space-y-5">
      <Card className="registry-panel">
        <CardHeader>
          <Badge variant="outline" className="mb-2 w-fit"><UserRound className="mr-1.5 h-3.5 w-3.5" />Federația Română de Vovinam</Badge>
          <CardTitle className="font-display text-2xl">Registrul public al sportivilor</CardTitle>
          <CardDescription>
          Profiluri publice validate. Caută sportivii după nume, club sau grad.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="registry-panel">
        <CardContent className="pt-5">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            className="pl-9"
            placeholder="Caută nume, club, grad"
          />
          </div>
          <Select
            value={clubFilter}
            onChange={updateFilter(setClubFilter)}
          >
            <option value="all">Toate cluburile</option>
            {clubs.map((club) => (
              <option key={club.id} value={club.id}>{club.name}</option>
            ))}
          </Select>

          <Select
            value={gradeFilter}
            onChange={updateFilter(setGradeFilter)}
          >
            <option value="all">Toate gradele</option>
            {grades.map((grade) => (
              <option key={grade.id} value={grade.id}>{grade.name}</option>
            ))}
          </Select>

          <Select
            value={ageGroupFilter}
            onChange={updateFilter(setAgeGroupFilter)}
          >
            <option value="all">Toate vârstele</option>
            <option value="u12">Sub 12</option>
            <option value="u16">12-15</option>
            <option value="u21">16-20</option>
            <option value="senior">21+</option>
          </Select>

          <Select
            value={cityFilter}
            onChange={updateFilter(setCityFilter)}
          >
            <option value="all">Toate orașele</option>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>{city.name}</option>
            ))}
          </Select>
        </div>

        <div className="mt-4 flex items-center justify-between border-t pt-4 text-sm text-muted-foreground">
          <span>{loading ? 'Se încarcă...' : `${count} sportivi găsiți`}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery('');
              setClubFilter('all');
              setGradeFilter('all');
              setAgeGroupFilter('all');
              setCityFilter('all');
              setPage(1);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />Resetează
          </Button>
        </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">{error}</Alert>
      )}

      <Card className="registry-panel overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/60">
            <tr>
              <TableHead>Sportiv</TableHead>
              <TableHead>Club</TableHead>
              <TableHead>Grad</TableHead>
              <TableHead className="text-right">Profil</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {loading && [0, 1, 2].map((row) => (
              <TableRow key={row}><TableCell colSpan={4}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
            ))}
            {!loading && athletes.length === 0 && (
              <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">Nu au fost găsiți sportivi.</TableCell></TableRow>
            )}
            {athletes.map((athlete) => {
              return (
                <TableRow key={athlete.id}>
                  <TableCell className="font-medium text-foreground">
                    {athlete.first_name} {athlete.last_name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{athlete?.club?.name || '-'}</TableCell>
                  <TableCell><Badge variant="secondary">{athlete?.current_grade?.name || 'Fără grad'}</Badge></TableCell>
                  <TableCell className="text-right"><Button asChild variant="ghost" size="sm"><Link to={`/athletes/${athlete.id}`}>Vezi profil<ArrowRight className="h-4 w-4" /></Link></Button></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" disabled={page === 1 || loading} onClick={() => setPage((value) => value - 1)}><ArrowLeft className="h-4 w-4" />Anterior</Button>
        <Badge variant="outline">Pagina {page}</Badge>
        <Button type="button" variant="outline" disabled={!hasNext || loading} onClick={() => setPage((value) => value + 1)}>Următor<ArrowRight className="h-4 w-4" /></Button>
      </div>
    </section>
  );
}
