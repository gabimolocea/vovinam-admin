import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, MapPin } from 'lucide-react';
import { publicContentAPI } from '@shared/lib/api';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Skeleton } from '../components/ui';

const EVENT_TYPE_LABELS = {
  competition: 'Competiție',
  examination: 'Examen',
  training_seminar: 'Seminar de pregătire',
};

const STATUS_LABELS = {
  upcoming: 'Viitor',
  ongoing: 'În desfășurare',
  past: 'Încheiat',
};

// All events, past and upcoming, come back in one page (there are only a
// few dozen in total) rather than adding pagination controls for this list.
const PAGE_SIZE = 50;

function formatDateRange(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const options = { day: 'numeric', month: 'long', year: 'numeric' };
  const startLabel = startDate.toLocaleDateString('ro-RO', options);
  const endLabel = endDate.toLocaleDateString('ro-RO', options);
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

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
      <div>
        <h1 className="font-display text-3xl font-semibold">Competiții și evenimente</h1>
        <p className="mt-1 text-sm text-muted-foreground">Toate competițiile, examenele și stagiile organizate de federație, trecute și viitoare.</p>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64" />)}
        </div>
      ) : events.length === 0 ? (
        <EmptyState title="Niciun eveniment găsit" message="Reveniți mai târziu pentru anunțuri noi." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <Link key={event.slug} to={`/competitii/${event.slug}`} className="block transition-shadow hover:shadow-md">
              <Card className="flex h-full flex-col overflow-hidden">
                {event.featured_image ? (
                  <div className="flex h-40 w-full items-center justify-center bg-sky-50">
                    <img src={event.featured_image} alt={event.title} className="h-full w-full object-contain" />
                  </div>
                ) : (
                  <div className="flex h-40 w-full items-center justify-center bg-sky-50">
                    <CalendarDays className="h-10 w-10 text-brand-navy/30" />
                  </div>
                )}
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                  <CardTitle as="h2" className="text-lg">{event.title}</CardTitle>
                  {event.status === 'past' ? (
                    <Badge variant="outline">{STATUS_LABELS.past}</Badge>
                  ) : (
                    <Badge variant="secondary">{STATUS_LABELS[event.status] || event.status}</Badge>
                  )}
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-2">
                  <CardDescription className="flex items-center gap-1"><CalendarDays className="h-4 w-4" />{formatDateRange(event.start_date, event.end_date)}</CardDescription>
                  {(event.city || event.address) && (
                    <CardDescription className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      {[event.city, event.address].filter(Boolean).join(' · ')}
                    </CardDescription>
                  )}
                  <div className="mt-auto pt-2">
                    <Badge variant="outline">{EVENT_TYPE_LABELS[event.event_type] || event.event_type}</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
