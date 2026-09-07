import { useEffect, useState } from 'react';
import { publicContentAPI } from '@shared/lib/api';
import { Alert, EmptyState, Skeleton } from '../components/ui';
import { PersonGrid } from '../components/PersonCard';
import Seo from '../components/Seo';

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

  const isEmpty = !loading && international.length === 0 && national.length === 0;

  return (
    <div className="flex flex-col gap-10">
      <Seo
        title="Arbitri"
        description="Arbitrii internaționali și naționali acreditați de Federația Română de Vovinam Việt Võ Đạo."
        path="/arbitri"
      />
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
              <PersonGrid people={international} />
            </section>
          )}
          {national.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="font-display text-xl font-semibold text-brand-navy">Arbitri naționali</h2>
              <PersonGrid people={national} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
