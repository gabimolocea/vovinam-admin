import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, MapPin } from 'lucide-react';
import { EVENT_TYPE_LABELS, formatEventDateRange } from '../lib/events';
import { excerpt } from '../lib/seo';

/** "Evenimente & Competiții" homepage section, matching Figma node
 * 306:4471: a branded photo backdrop (real competition photo + navy-to-red
 * gradient) framing the next upcoming event as a white card. The card
 * itself reuses the same styling as the /calendar EventCard (badge,
 * border, "Detalii" CTA) but stays landscape on desktop instead of
 * stacking, since there's only ever one card in this section. */
export default function NextEventSection({ event }) {
  if (!event) return null;

  const isUpcoming = new Date(event.end_date || event.start_date) >= new Date().setHours(0, 0, 0, 0);

  return (
    <section className="site-full-bleed bg-white pb-12 pt-12 sm:pb-16 sm:pt-16">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4">
        <div className="flex flex-wrap items-center gap-6">
          <h2 className="text-fluid-h2 font-display shrink-0 font-bold text-[#00334d]">
            Evenimente &amp; Competiții
          </h2>
          <span className="hidden h-px flex-1 bg-[#edb654] sm:block" aria-hidden="true" />
          <Link
            to="/calendar"
            className="text-fluid-button ml-auto hidden items-center gap-2 rounded-lg border-2 !border-[#0a4c75] bg-transparent px-4 py-3 font-bold uppercase text-[#0a4c75] transition hover:bg-[#0a4c75]/5 sm:ml-0 sm:inline-flex"
          >
            Toate evenimentele
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="relative overflow-hidden rounded-2xl px-4 py-6 lg:px-10 lg:py-10">
          <img
            src="/events-section-bg.jpg"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(90deg, rgba(3,16,33,0.9) 40%, rgba(150,35,20,0.9) 100%)' }}
          />

          <Link
            to={`/calendar/${event.slug}`}
            className={`group relative flex flex-col overflow-hidden rounded-xl bg-white p-2 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-[#0a4c75] hover:shadow-lg sm:flex-row ${
              isUpcoming ? 'border-2 border-[#edb654]' : 'border border-[#dce0e5]'
            }`}
          >
            <div className="relative flex w-full shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sky-50 sm:aspect-auto sm:h-60 sm:w-[427px]">
              {event.featured_image ? (
                <img
                  src={event.featured_image}
                  alt={event.title}
                  className="h-auto max-h-[240px] w-auto max-w-full object-contain transition-transform duration-300 group-hover:scale-105 sm:h-full sm:max-h-none sm:w-full"
                />
              ) : (
                <CalendarDays className="h-10 w-10 text-[#00334d]/30" />
              )}
              {EVENT_TYPE_LABELS[event.event_type] && (
                <span className="absolute left-2 top-2 rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                  {EVENT_TYPE_LABELS[event.event_type]}
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col justify-center gap-2 px-4 py-4 lg:gap-4 lg:py-6">
              <p className="text-sm uppercase text-[#00334d]">
                {formatEventDateRange(event.start_date, event.end_date)}
              </p>
              <h3 className="text-fluid-h3 font-display font-bold text-[#00334d] transition-colors group-hover:text-[#0a4c75]">
                {event.title}
              </h3>
              {(event.city || event.address) && (
                <p className="flex items-center gap-1 text-base text-[#00334d]/80">
                  <MapPin className="h-4 w-4 shrink-0" />
                  {[event.city, event.address].filter(Boolean).join(' · ')}
                </p>
              )}
              {event.description && (
                <p className="hidden line-clamp-3 text-base text-[#00334d]/80 lg:block">
                  {excerpt(event.description, 220)}
                </p>
              )}
              <span className="text-fluid-button mt-auto inline-flex w-fit items-center gap-2 font-bold uppercase text-[#00334d]">
                <span className="site-underline-grow">Detalii</span>
                <ArrowRight className="h-4 w-4" />
              </span>
            </div>
          </Link>
        </div>

        <Link
          to="/calendar"
          className="text-fluid-button inline-flex items-center justify-center gap-2 rounded-lg border-2 !border-[#0a4c75] bg-transparent px-4 py-3 font-bold uppercase text-[#0a4c75] transition hover:bg-[#0a4c75]/5 sm:hidden"
        >
          Toate evenimentele
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
