import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, MapPin } from 'lucide-react';
import { EVENT_TYPE_LABELS, formatEventDateRange } from '../lib/events';

/** Grid tile for an event/competition - same card shell, spacing, and
 * hover state as NewsCard, so the "Evenimente" list reads as one visual
 * family with "Noutăți" instead of a bespoke layout of its own. Event
 * posters are portrait graphics with text baked in, so the image area
 * uses object-contain over a light placeholder instead of cropping to
 * cover like a news photo. */
export default function EventCard({ event }) {
  const isUpcoming = new Date(event.end_date || event.start_date) >= new Date().setHours(0, 0, 0, 0);

  return (
    <Link
      to={`/calendar/${event.slug}`}
      className={`group flex flex-col rounded-xl bg-white p-2 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-[#0a4c75] hover:shadow-lg ${
        isUpcoming ? 'border-2 border-[#edb654]' : 'border border-[#dce0e5]'
      }`}
    >
      <div className="relative aspect-[490/273] w-full overflow-hidden rounded-lg bg-sky-50">
        {event.featured_image ? (
          <img
            src={event.featured_image}
            alt={event.title}
            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <CalendarDays className="h-10 w-10 text-brand-navy/30" />
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
          {EVENT_TYPE_LABELS[event.event_type] || event.event_type}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-4 px-4 py-6">
        <p className="text-sm uppercase text-[#00334d]">{formatEventDateRange(event.start_date, event.end_date)}</p>
        <h3 className="text-fluid-h3 font-display font-bold text-[#00334d] transition-colors group-hover:text-[#0a4c75]">{event.title}</h3>
        {(event.city || event.address) && (
          <p className="flex items-center gap-1 text-base text-[#00334d]/80">
            <MapPin className="h-4 w-4 shrink-0" />
            {[event.city, event.address].filter(Boolean).join(' · ')}
          </p>
        )}
        <span className="text-fluid-button mt-auto inline-flex w-fit items-center gap-2 font-bold uppercase text-[#00334d]">
          <span className="site-underline-grow">Detalii</span>
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}
