import { useEffect, useState } from 'react';
import { CalendarDays, MapPin } from 'lucide-react';
import { publicContentAPI } from '@shared/lib/api';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Skeleton } from '../components/ui';

const EVENT_TYPE_LABELS = {
  competition: 'Competiție',
  examination: 'Examen',
  training_seminar: 'Seminar de pregătire',
};

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
        const response = await publicContentAPI.events.upcoming();
        if (isMounted) setEvents(response.data ?? []);
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
      <h1 className="font-display text-3xl font-semibold">Competiții viitoare</h1>

      {error && <Alert variant="destructive">{error}</Alert>}

      {loading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : events.length === 0 ? (
        <EmptyState title="Nicio competiție programată" message="Reveniți mai târziu pentru anunțuri noi." />
      ) : (
        <div className="flex flex-col gap-4">
          {events.map((event) => (
            <Card key={event.slug}>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>{event.title}</CardTitle>
                  <CardDescription className="mt-1 flex items-center gap-1"><CalendarDays className="h-4 w-4" />{formatDateRange(event.start_date, event.end_date)}</CardDescription>
                </div>
                <Badge variant="secondary">{EVENT_TYPE_LABELS[event.event_type] || event.event_type}</Badge>
              </CardHeader>
              {(event.city || event.address) && (
                <CardContent className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  {[event.city, event.address].filter(Boolean).join(' · ')}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
