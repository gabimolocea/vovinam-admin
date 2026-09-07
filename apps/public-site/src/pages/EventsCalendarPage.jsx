import { useEffect, useState } from 'react';
import { Alert, EmptyState, Skeleton } from '../components/ui';
import EventCard from '../components/EventCard';
import Seo from '../components/Seo';
import { publicContentAPI } from '@shared/lib/api';

// All events, past and upcoming, come back in one page (there are only a
// few dozen in total) rather than adding pagination controls for this list.
const PAGE_SIZE = 50;


export default function EventsCalendarPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await publicContentAPI.events.list({ page_size: PAGE_SIZE });
        if (isMounted) setEvents(response.data?.results ?? []);
      } catch {
        if (isMounted) setError('Nu am putut încărca lista competițiilor.');
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
        title="Competiții și evenimente"
        description="Calendarul competițiilor, examenelor și seminariilor de pregătire organizate de Federația Română de Vovinam Việt Võ Đạo."
        path="/competitii"
      />
      <div>
        <h1 className="font-display text-3xl font-semibold">Competiții și evenimente</h1>
        <p className="mt-1 text-sm text-muted-foreground">Toate competițiile, examenele și stagiile organizate de federație, trecute și viitoare.</p>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {loading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
        </div>
      ) : events.length === 0 ? (
        <EmptyState title="Niciun eveniment găsit" message="Reveniți mai târziu pentru anunțuri noi." />
      ) : (
        <div className="flex flex-col gap-4">
          {events.map((event) => (
            <EventCard key={event.slug} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
