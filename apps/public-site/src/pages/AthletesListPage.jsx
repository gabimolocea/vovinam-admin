import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { athleteAPI } from '@shared/lib/api';
import { Alert, Button, EmptyState, Input, Skeleton } from '../components/ui';
import Seo from '../components/Seo';
import AthletesTable from '../components/AthletesTable';

export default function AthletesListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') || '1');
  const q = searchParams.get('q') || '';

  const [athletes, setAthletes] = useState([]);
  const [count, setCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
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
        });
        if (!isMounted) return;
        setAthletes(response.data?.results ?? []);
        setCount(response.data?.count ?? 0);
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
  }, [page, q]);

  return (
    <div className="flex flex-col gap-6">
      <Seo
        title="Sportivi"
        description="Lista sportivilor legitimați ai Federației Române de Vovinam Việt Võ Đạo."
        path="/sportivi"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Sportivi</h1>
          <p className="text-sm text-muted-foreground">{count} sportivi</p>
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get('q');
            setSearchParams(value ? { q: String(value) } : {});
          }}
        >
          <Input name="q" defaultValue={q} placeholder="Caută după nume, club, grad…" className="w-64" />
          <Button type="submit" size="sm" variant="outline">Caută</Button>
          {q && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setSearchParams({})}>Resetează</Button>
          )}
        </form>
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
          <AthletesTable athletes={athletes} />

          <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setSearchParams({ ...(q ? { q } : {}), page: String(page - 1) })}
            >
              Anterior
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!hasNext}
              onClick={() => setSearchParams({ ...(q ? { q } : {}), page: String(page + 1) })}
            >
              Următor
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
