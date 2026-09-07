import { Link } from 'react-router-dom';
import { CalendarDays, MapPin } from 'lucide-react';
import { Badge, Card, CardDescription, CardTitle } from './ui';
import { EVENT_TYPE_LABELS, STATUS_LABELS, formatEventDateRange } from '../lib/events';

// Portrait on mobile (image on top, like the news cards) and landscape
// from the sm breakpoint up (image on the left). Used both on the
// homepage's "next competition" section and on the full events list, so
// the two stay visually consistent.
export default function EventCard({ event }) {
  return (
    <Card
      as={Link}
      to={`/competitii/${event.slug}`}
      className="flex flex-col overflow-hidden transition hover:border-primary/50 hover:shadow-md sm:flex-row"
    >
      <div className="flex aspect-video w-full shrink-0 items-center justify-center overflow-hidden bg-sky-50 px-8 sm:aspect-auto sm:h-full sm:w-64 sm:self-stretch sm:px-8">
        {event.featured_image ? (
          <img src={event.featured_image} alt={event.title} className="h-full w-full object-contain" />
        ) : (
          <CalendarDays className="h-10 w-10 text-brand-navy/30" />
        )}
      </div>
      <div className="flex flex-1 flex-col justify-center gap-2 p-4 sm:p-5">
        <div className="flex flex-row flex-wrap items-start justify-between gap-2">
          <CardTitle as="h2" className="text-lg">{event.title}</CardTitle>
          {event.status === 'past' ? (
            <Badge variant="outline">{STATUS_LABELS.past}</Badge>
          ) : (
            <Badge variant="secondary">{STATUS_LABELS[event.status] || event.status}</Badge>
          )}
        </div>
        <CardDescription className="flex items-center gap-1"><CalendarDays className="h-4 w-4" />{formatEventDateRange(event.start_date, event.end_date)}</CardDescription>
        {(event.city || event.address) && (
          <CardDescription className="flex items-center gap-1">
            <MapPin className="h-4 w-4" />
            {[event.city, event.address].filter(Boolean).join(' · ')}
          </CardDescription>
        )}
        <div>
          <Badge variant="outline">{EVENT_TYPE_LABELS[event.event_type] || event.event_type}</Badge>
        </div>
      </div>
    </Card>
  );
}
