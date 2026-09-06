import { useEffect, useState } from 'react';
import { publicContentAPI } from '@shared/lib/api';
import { Alert, Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton } from '../components/ui';

export default function RefereesPage() {
  const [international, setInternational] = useState([]);
  const [national, setNational] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await publicContentAPI.referees.list();
        if (isMounted) {
          setInternational(response.data?.international ?? []);
          setNational(response.data?.national ?? []);
        }
      } catch {
        if (isMounted) setError('Nu am putut încărca lista arbitrilor.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const renderGrid = (people) => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {people.map((person, i) => (
        <Card key={`${person.full_name}-${i}`} className="overflow-hidden text-center">
          {person.profile_image && (
            <img src={person.profile_image} alt={person.full_name} className="h-40 w-full object-cover" />
          )}
          <CardHeader>
            <CardTitle as="h2" className="text-base">{person.full_name}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-2">
            {person.title && <span className="text-sm text-muted-foreground">{person.title}</span>}
            {person.grade && <span className="text-xs font-medium uppercase tracking-wide text-brand-navy">{person.grade}</span>}
            {person.club && <span className="text-sm text-muted-foreground">{person.club}</span>}
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const isEmpty = !loading && international.length === 0 && national.length === 0;

  return (
    <div className="flex flex-col gap-10">
      <h1 className="font-display text-3xl font-semibold">Arbitri</h1>

      {error && <Alert variant="destructive">{error}</Alert>}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : isEmpty ? (
        <EmptyState title="Conținut în curând" message="Lista arbitrilor acreditați va fi publicată în curând." />
      ) : (
        <>
          {international.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="font-display text-xl font-semibold text-brand-navy">Arbitri internaționali</h2>
              {renderGrid(international)}
            </section>
          )}
          {national.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="font-display text-xl font-semibold text-brand-navy">Arbitri naționali</h2>
              {renderGrid(national)}
            </section>
          )}
        </>
      )}
    </div>
  );
}
