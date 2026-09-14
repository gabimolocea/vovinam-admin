import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarDays, MapPin } from 'lucide-react';
import { publicContentAPI } from '@shared/lib/api';
import { Alert, Skeleton } from '../components/ui';
import Seo, { sportsEventJsonLd } from '../components/Seo';
import Breadcrumbs from '../components/Breadcrumbs';
import ShareButton from '../components/ShareButton';
import Lightbox from '../components/Lightbox';
import { excerpt, DEFAULT_OG_IMAGE } from '../lib/seo';
import { formatEventDateRange, getEventTypeLabels } from '../lib/events';

export default function EventDetailPage() {
  const { slug } = useParams();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [posterOpen, setPosterOpen] = useState(false);

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
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !event) {
    return <Alert variant="destructive">{error || 'Evenimentul nu a fost găsit.'}</Alert>;
  }

  return (
    <article className="flex flex-col">
      <Seo
        title={event.title}
        description={event.description ? excerpt(event.description) : `${getEventTypeLabels(event).join(' / ') || 'Eveniment'} organizat de Federația Română de Vovinam Việt Võ Đạo.`}
        path={`/calendar/${slug}`}
        image={event.featured_image || DEFAULT_OG_IMAGE}
        type="article"
        jsonLd={sportsEventJsonLd(event, `/calendar/${slug}`)}
      />

      {/* Title band: same treatment as NewsDetailPage, but dark navy (matching
          the footer) instead of light gray, and the hero image sits beside
          the title on desktop instead of overlapping below it. The backdrop
          is the event's own poster, blurred and mirrored, over a navy tint -
          kept in its own clipped layer so the blur doesn't bleed past the
          band while the poster image itself is still free to overlap down
          onto the white section below. */}
      <div className="site-full-bleed relative" style={{ backgroundColor: '#0c223d' }}>
        {event.featured_image && (
          <div className="absolute inset-0 overflow-hidden">
            <img
              src={event.featured_image}
              alt=""
              aria-hidden="true"
              className="h-full w-full scale-110 scale-x-[-1] object-cover blur-2xl"
            />
            <div className="absolute inset-0 bg-[#0c223d]/80" />
          </div>
        )}

        <div className="relative">
          <Breadcrumbs items={[{ label: 'Calendar', to: '/calendar' }, { label: event.title }]} overlay />

          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 pb-6 pt-4 sm:pb-8 sm:pt-6 lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:pb-8 lg:pt-8">
            <div className="flex flex-col items-start gap-4 text-left">
              <div className="flex flex-wrap gap-1.5">
                {getEventTypeLabels(event).map((label) => (
                  <span key={label} className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                    {label}
                  </span>
                ))}
              </div>

              <h1 className="text-fluid-display font-display font-bold text-white">{event.title}</h1>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-base text-white/70">
                <span className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 shrink-0" />
                  {formatEventDateRange(event.start_date, event.end_date)}
                </span>
                {(event.city || event.address) && (
                  <span className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 shrink-0" />
                    {[event.city, event.address].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
            </div>

            {event.featured_image && (
              <div className="relative z-10 -mb-10 flex w-full max-w-sm shrink-0 items-center justify-center sm:-mb-14 lg:w-[760px] lg:-mb-40">
                <button
                  type="button"
                  onClick={() => setPosterOpen(true)}
                  className="w-full border-0 bg-transparent p-0 cursor-zoom-in"
                  aria-label="Extinde afișul"
                >
                  <img src={event.featured_image} alt={event.title} className="max-h-[22rem] w-full object-contain lg:max-h-[44rem]" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 py-8 sm:py-10">
        <div className="flex w-full max-w-2xl flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <ShareButton title={event.title} />
          </div>

          {event.description && (
            <div className="prose-content ck-content max-w-none" dangerouslySetInnerHTML={{ __html: event.description }} />
          )}
        </div>
      </div>

      <Lightbox
        image={posterOpen ? { image: event.featured_image, alt_text: event.title } : null}
        onClose={() => setPosterOpen(false)}
      />
    </article>
  );
}
