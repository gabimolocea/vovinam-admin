import { useEffect, useState } from 'react';
import { Alert, EmptyState, Skeleton } from '../components/ui';
import EventCard from '../components/EventCard';
import Breadcrumbs from '../components/Breadcrumbs';
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
    <div className="flex flex-col">
      <Seo
        title="Competiții și evenimente"
        description="Calendarul competițiilor, examenelor și seminariilor de pregătire organizate de Federația Română de Vovinam Việt Võ Đạo."
        path="/calendar"
      />

      <div className="site-full-bleed relative flex flex-col items-center overflow-hidden pb-16 sm:pb-20">
        <img src="/events-section-bg.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(12,33,61,0.6) 0%, rgba(12,33,61,0.68) 100%)' }}
        />
        <Breadcrumbs items={[{ label: 'Calendar' }]} showCurrent overlay />
        <div className="relative mx-auto mt-8 w-full max-w-7xl px-4 sm:mt-10">
          <h1 className="text-fluid-display font-display font-bold text-white">Calendar</h1>
        </div>
      </div>

      <div className="flex flex-col gap-6 py-10 sm:py-16">
        {error && <Alert variant="destructive">{error}</Alert>}

        {loading ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-80" />)}
          </div>
        ) : events.length === 0 ? (
          <EmptyState title="Niciun eveniment găsit" message="Reveniți mai târziu pentru anunțuri noi." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {events.map((event) => <EventCard key={event.slug} event={event} />)}
          </div>
        )}
      </div>
    </div>
  );
}
