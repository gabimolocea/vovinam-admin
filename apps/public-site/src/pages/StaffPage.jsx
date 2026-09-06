import { useEffect, useState } from 'react';
import { publicContentAPI } from '@shared/lib/api';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton } from '../components/ui';
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
            {person.federation_role && <Badge variant="secondary">{person.federation_role}</Badge>}
            {person.title && <span className="text-sm text-muted-foreground">{person.title}</span>}
            {person.grade && <span className="text-xs font-medium uppercase tracking-wide text-brand-navy">{person.grade}</span>}
            {person.club && <span className="text-sm text-muted-foreground">{person.club}</span>}
          </CardContent>
        </Card>
      ))}
    </div>
  );

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
              {renderGrid(council)}
            </section>
          )}
          {masters.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="font-display text-xl font-semibold text-brand-navy">Titluri de Maestru acordate de Ministrul Sportului</h2>
              {renderGrid(masters)}
            </section>
          )}
        </>
      )}
    </div>
  );
}
