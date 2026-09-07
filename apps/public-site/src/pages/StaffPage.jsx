import { useEffect, useState } from 'react';
import { publicContentAPI } from '@shared/lib/api';
import { Alert, EmptyState, Skeleton } from '../components/ui';
import { PersonGrid } from '../components/PersonCard';
import Seo from '../components/Seo';

export default function StaffPage() {
  const [council, setCouncil] = useState([]);
  const [masters, setMasters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await publicContentAPI.staff.list();
        if (isMounted) {
          setCouncil(response.data?.council ?? []);
          setMasters(response.data?.masters ?? []);
        }
      } catch {
        if (isMounted) setError('Nu am putut încărca lista staff-ului federației.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const isEmpty = !loading && council.length === 0 && masters.length === 0;

  return (
    <div className="flex flex-col gap-10">
      <Seo
        title="Staff federație"
        description="Consiliul actual și titlurile de Maestru acordate de Ministerul Sportului în cadrul Federației Române de Vovinam Việt Võ Đạo."
        path="/staff"
      />
      <h1 className="font-display text-3xl font-semibold">Staff federație</h1>

      {error && <Alert variant="destructive">{error}</Alert>}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : isEmpty ? (
        <EmptyState title="Conținut în curând" message="Lista membrilor staff-ului federației va fi publicată în curând." />
      ) : (
        <>
          {council.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="font-display text-xl font-semibold text-brand-navy">Membrii actuali ai consiliului</h2>
              <PersonGrid people={council} />
            </section>
          )}
          {masters.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="font-display text-xl font-semibold text-brand-navy">Titluri de Maestru acordate de Ministrul Sportului</h2>
              <PersonGrid people={masters} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
