import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@shared';
import { athleteAPI } from '@shared/lib/api';
import {
  Alert, Button, EmptyState, Input, Skeleton,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui';
import Breadcrumbs from '../components/Breadcrumbs';
import Seo from '../components/Seo';
import AthletesTable from '../components/AthletesTable';

export default function AthletesListPage() {
  const { user, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') || '1');
  const q = searchParams.get('q') || '';
  const ordering = searchParams.get('ordering') === 'grade' ? 'grade' : 'name';

  const [athletes, setAthletes] = useState([]);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading || !user) return undefined;
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await athleteAPI.list({
          paginate: true,
          page_size: 20,
          page,
          q: q || undefined,
          ordering,
        });
        if (!isMounted) return;
        setAthletes(response.data?.results ?? []);
        setHasNext(Boolean(response.data?.next));
      } catch {
        if (!isMounted) return;
        setError('Nu am putut încărca lista sportivilor.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [page, q, ordering, user, authLoading]);

  function updateParams(patch) {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    setSearchParams(next);
  }

  if (authLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (!user) return <Navigate to="/cont" replace />;

  return (
    <div className="flex flex-col gap-6">
      <Seo
        title="Sportivi"
        description="Lista sportivilor legitimați ai Federației Române de Vovinam Việt Võ Đạo."
        path="/sportivi"
        noindex
      />

      <Breadcrumbs items={[{ label: 'Federație', to: '/despre' }, { label: 'Sportivi' }]} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold">Sportivi</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={ordering} onValueChange={(value) => updateParams({ ordering: value === 'name' ? null : value, page: null })}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Sortează după" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Nume (A-Z)</SelectItem>
              <SelectItem value="grade">Grad</SelectItem>
            </SelectContent>
          </Select>
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const value = new FormData(event.currentTarget).get('q');
              updateParams({ q: value ? String(value) : null, page: null });
            }}
          >
            <Input name="q" defaultValue={q} placeholder="Caută după nume, club, grad…" className="w-64" />
            <Button type="submit" size="sm" variant="outline">Caută</Button>
            {q && (
              <Button type="button" size="sm" variant="ghost" onClick={() => updateParams({ q: null, page: null })}>Resetează</Button>
            )}
          </form>
        </div>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : athletes.length === 0 ? (
        <EmptyState title="Niciun sportiv găsit" message={q ? `Nu există sportivi pentru „${q}”.` : 'Reveniți mai târziu.'} />
      ) : (
        <>
          <AthletesTable athletes={athletes} showStatus={false} showResults={false} />

          <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => updateParams({ page: String(page - 1) })}
            >
              Anterior
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!hasNext}
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              Următor
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
