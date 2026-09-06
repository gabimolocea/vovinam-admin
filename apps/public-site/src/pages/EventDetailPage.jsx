import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, MapPin } from 'lucide-react';
import { publicContentAPI } from '@shared/lib/api';
import { Alert, Badge, Skeleton } from '../components/ui';

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

function formatDateRange(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const options = { day: 'numeric', month: 'long', year: 'numeric' };
  const startLabel = startDate.toLocaleDateString('ro-RO', options);
  const endLabel = endDate.toLocaleDateString('ro-RO', options);
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

export default function EventDetailPage() {
  const { slug } = useParams();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await publicContentAPI.events.get(slug);
        if (isMounted) setEvent(response.data);
      } catch (err) {
        if (!isMounted) return;
        setError(err?.response?.status === 404 ? 'Acest eveniment nu a fost găsit.' : 'Nu am putut încărca evenimentul.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !event) {
    return <Alert variant="destructive">{error || 'Evenimentul nu a fost găsit.'}</Alert>;
  }

  return (
    <article className="flex flex-col gap-6">
      <Link to="/competitii" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />Înapoi la competiții
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-3xl font-semibold">{event.title}</h1>
          <Badge variant={event.status === 'past' ? 'outline' : 'secondary'}>{STATUS_LABELS[event.status] || event.status}</Badge>
        </div>
        <p className="flex items-center gap-1 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" />{formatDateRange(event.start_date, event.end_date)}</p>
        {(event.city || event.address) && (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            {[event.city, event.address].filter(Boolean).join(' · ')}
          </p>
        )}
        <div>
          <Badge variant="outline">{EVENT_TYPE_LABELS[event.event_type] || event.event_type}</Badge>
        </div>
      </header>

      {event.featured_image && (
        <div className="flex max-h-[28rem] w-full items-center justify-center overflow-hidden rounded-lg bg-sky-50">
          <img src={event.featured_image} alt={event.title} className="max-h-[28rem] w-full object-contain" />
        </div>
      )}

      {event.description && (
        <div className="prose-content max-w-none" dangerouslySetInnerHTML={{ __html: event.description }} />
      )}
    </article>
  );
}
