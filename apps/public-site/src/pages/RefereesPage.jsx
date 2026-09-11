import { useEffect, useState } from 'react';
import { publicContentAPI } from '@shared/lib/api';
import { Alert, EmptyState, Skeleton } from '../components/ui';
import { PersonGrid } from '../components/PersonCard';
import Breadcrumbs from '../components/Breadcrumbs';
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
    <div className="flex flex-col">
      <Seo
        title="Arbitri"
        description="Arbitrii internaționali și naționali acreditați de Federația Română de Vovinam Việt Võ Đạo."
        path="/arbitri"
      />

      <Breadcrumbs items={[{ label: 'Federație', to: '/despre' }, { label: 'Arbitri' }]} />

      <div className="site-full-bleed bg-[#e9ecef]">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:py-16">
          <h1 className="text-fluid-h2 font-display font-bold text-[#00334d]">Arbitri</h1>
        </div>
      </div>

      <div className="flex flex-col gap-10 pt-8">
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
              <section className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center gap-6">
                  <h2 className="text-fluid-h3 font-display shrink-0 font-bold text-[#00334d]">Arbitri internaționali</h2>
                  <span className="h-px flex-1 bg-[#edb654]" aria-hidden="true" />
                </div>
                <PersonGrid people={international} />
              </section>
            )}
            {national.length > 0 && (
              <section className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center gap-6">
                  <h2 className="text-fluid-h3 font-display shrink-0 font-bold text-[#00334d]">Arbitri naționali</h2>
                  <span className="h-px flex-1 bg-[#edb654]" aria-hidden="true" />
                </div>
                <PersonGrid people={national} />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
