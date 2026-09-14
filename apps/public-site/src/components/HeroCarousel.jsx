import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const AUTOPLAY_MS = 6000;

// News posts don't have a real "category" field, only a freeform
// comma-separated `tags` string — use the first tag as the category shown
// on the slide badge, since that's the closest thing to real data.
function primaryCategory(slide) {
  return slide.tags?.split(',')[0]?.trim() || '';
}

/** Homepage hero carousel (full-bleed, matching Figma node 221:2961) driven
 * by featured ("highlighted") news posts. Auto-advances every 6s, pauses on
 * hover/focus, and exposes a per-slide progress bar (titled on larger
 * screens, plain bars + a "next" preview on mobile) as navigation.
 * Renders nothing if there are no slides so the homepage degrades
 * gracefully while content is curated. */
export default function HeroCarousel({ slides }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);
  const navigate = useNavigate();

  const goTo = useCallback((i) => {
    setIndex((current) => {
      const count = slides.length;
      if (count === 0) return current;
      return (i + count) % count;
    });
  }, [slides.length]);

  useEffect(() => {
    if (paused || slides.length <= 1) return undefined;
    timerRef.current = setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, AUTOPLAY_MS);
    return () => clearInterval(timerRef.current);
  }, [paused, slides.length]);

  if (slides.length === 0) return null;

  return (
    <section
      className="site-hero site-full-bleed relative -mt-8 overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Noutăți evidențiate"
    >
      <div className="relative h-[451px] w-full lg:h-[620px]">
        {slides.map((slide, i) => (
          <div
            key={slide.slug}
            className="absolute inset-0 transition-opacity duration-700"
            style={{ opacity: i === index ? 1 : 0, pointerEvents: i === index ? 'auto' : 'none' }}
            aria-hidden={i !== index}
          >
            {/* Mobile/tablet: the photo only fills the top portion of the
                slide (not the full height) so it visibly "sits above" the
                title instead of the title floating over a full-bleed photo
                - the scrim then blends its bottom edge into the navy panel
                behind it. Desktop keeps the original full-bleed photo. */}
            <div className="site-hero-media absolute inset-x-0 top-0 h-[52%] overflow-hidden lg:inset-0 lg:h-full">
              {slide.featured_image ? (
                <>
                  {/* Mirrored, blurred backdrop (desktop only): fills the
                      letterboxed edges when the photo isn't wide enough to
                      cover the banner, instead of cropping it or leaving
                      empty bars. Mobile/tablet crop to cover instead, like
                      FIBA's hero, since there's less width to letterbox. */}
                  <img
                    src={slide.featured_image}
                    alt=""
                    aria-hidden="true"
                    className="site-hero-bg-mirror absolute inset-0 hidden h-full w-full object-cover lg:block"
                    loading={i === 0 ? 'eager' : 'lazy'}
                  />
                  <div className="site-hero-bg-scrim absolute inset-0 hidden lg:block" />
                  <img
                    src={slide.featured_image}
                    alt={slide.featured_image_alt || ''}
                    className="site-hero-photo relative h-full w-full object-cover object-top lg:object-contain"
                    loading={i === 0 ? 'eager' : 'lazy'}
                  />
                </>
              ) : (
                <div className="site-hero-fallback h-full w-full" />
              )}
              <div className="site-hero-scrim absolute inset-0" />
            </div>

            <div className="relative mx-auto flex h-full w-full max-w-7xl flex-col justify-end gap-8 px-4 pb-[92px] sm:px-6 lg:pb-36">
              <div className="flex max-w-2xl flex-col items-start gap-3">
                {primaryCategory(slide) && (
                  <span className="bg-secondary/60 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                    {primaryCategory(slide)}
                  </span>
                )}
                <h1 className="text-fluid-display font-display font-bold text-white">
                  {slide.title}
                </h1>
              </div>
              <Link
                to={`/noutati/${slide.slug}`}
                className="text-fluid-button hidden w-fit items-center gap-2 rounded-lg bg-[#da3b26] px-4 py-3 font-bold uppercase text-white transition hover:bg-[#da3b26]/90 lg:inline-flex"
              >
                Citește mai mult
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Mobile/tablet: the whole slide is the tap target (desktop
                keeps the explicit CTA button as the only click target). */}
            <button
              type="button"
              className="absolute inset-0 lg:hidden"
              onClick={() => navigate(`/noutati/${slide.slug}`)}
              aria-label={slide.title}
            />
          </div>
        ))}

        {slides.length > 1 && (
          <>
            <div className="absolute inset-x-0 bottom-6 z-10 lg:bottom-10">
              <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
                <div className="flex gap-4 sm:gap-6">
                  {slides.map((slide, i) => (
                    <button
                      key={slide.slug}
                      type="button"
                      className="group flex flex-1 flex-col items-start gap-3 text-left"
                      aria-label={`Mergi la noutatea ${i + 1}`}
                      aria-current={i === index}
                      onClick={() => goTo(i)}
                    >
                      <span
                        className={`relative h-[3px] w-full overflow-hidden rounded-full transition-colors ${
                          i === index ? 'bg-white/30' : 'bg-white/30 group-hover:bg-white/50'
                        }`}
                      >
                        {i === index && (
                          <span
                            key={index}
                            className="site-hero-progress-fill absolute inset-y-0 left-0 block h-full rounded-full bg-white"
                            style={{
                              animationDuration: `${AUTOPLAY_MS}ms`,
                              animationPlayState: paused ? 'paused' : 'running',
                            }}
                          />
                        )}
                      </span>
                      <span
                        className={`hidden text-sm font-medium leading-snug transition-colors lg:line-clamp-3 lg:block ${
                          i === index ? 'text-white' : 'text-white/50 group-hover:text-white/80'
                        }`}
                      >
                        {slide.title}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Mobile/tablet: bars have no room for every title, so
                    just preview the next slide's full title beneath them. */}
                <button
                  type="button"
                  className="relative z-[1] mt-4 flex items-start gap-3 text-left lg:hidden"
                  onClick={() => goTo(index + 1)}
                >
                  <span className="mt-0.5 shrink-0 rounded border border-white/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                    Următor
                  </span>
                  <span className="line-clamp-2 text-xs leading-snug text-white/70">
                    {slides[(index + 1) % slides.length].title}
                  </span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
