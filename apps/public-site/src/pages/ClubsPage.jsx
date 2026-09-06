import { useEffect, useState } from 'react';
import { publicContentAPI } from '@shared/lib/api';
import { Alert, Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton } from '../components/ui';
import Seo from '../components/Seo';

export default function ClubsPage() {
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await publicContentAPI.clubs.list();
        if (isMounted) setClubs(response.data ?? []);
      } catch {
        if (isMounted) setError('Nu am putut încărca lista cluburilor.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <Seo
        title="Cluburi afiliate"
        description="Lista cluburilor sportive afiliate Federației Române de Vovinam Việt Võ Đạo, cu antrenori și localizare."
        path="/cluburi"
      />
      <h1 className="font-display text-3xl font-semibold">Cluburi afiliate</h1>

      {error && <Alert variant="destructive">{error}</Alert>}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : clubs.length === 0 ? (
        <EmptyState title="Niciun club afișat momentan" message="Lista cluburilor afiliate va fi publicată în curând." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clubs.map((club) => (
            <Card key={club.name} className="overflow-hidden">
              {club.logo && (
                <img src={club.logo} alt={club.name} className="h-32 w-full object-cover" />
              )}
              <CardHeader>
                <CardTitle as="h2" className="text-lg">{club.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
                {club.coaches?.length > 0 && (
                  <span className="font-medium text-brand-navy">
                    Antrenor{club.coaches.length > 1 ? 'i' : ''}: {club.coaches.join(', ')}
                  </span>
                )}
                {club.city && <span>{club.city}</span>}
                {club.address && <span>{club.address}</span>}
                {club.mobile_number && <span>{club.mobile_number}</span>}
                {club.website && (
                  <a href={club.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {club.website}
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
