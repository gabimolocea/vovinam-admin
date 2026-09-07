import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui';

const AUTOPLAY_MS = 6000;

/** Homepage hero carousel (content-width, matching the rest of the page)
 * driven by featured ("highlighted") news posts. Auto-advances every 6s,
 * pauses on hover/focus, and exposes dot navigation + prev/next arrows.
 * Renders nothing if there are no slides so the homepage degrades
 * gracefully while content is curated. */
export default function HeroCarousel({ slides }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);

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
      className="site-hero relative overflow-hidden rounded-xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Noutăți evidențiate"
    >
      <div className="relative h-[360px] w-full sm:h-[420px] lg:h-[480px]">
        {slides.map((slide, i) => (
          <div
            key={slide.slug}
            className="absolute inset-0 transition-opacity duration-700"
            style={{ opacity: i === index ? 1 : 0, pointerEvents: i === index ? 'auto' : 'none' }}
            aria-hidden={i !== index}
          >
            <div className="site-hero-media absolute inset-0">
              {slide.featured_image ? (
                <>
                  <img
                    src={slide.featured_image}
                    alt=""
                    aria-hidden="true"
                    className="site-hero-bg absolute inset-0 h-full w-full object-cover"
                    loading={i === 0 ? 'eager' : 'lazy'}
                  />
                  <div className="site-hero-bg-scrim absolute inset-0" />
                  <img
                    src={slide.featured_image}
                    alt={slide.featured_image_alt || slide.title}
                    className="relative h-full w-full object-contain"
                    loading={i === 0 ? 'eager' : 'lazy'}
                  />
                  <div className="site-hero-side-fade site-hero-side-fade-left absolute inset-y-0 left-0" />
                  <div className="site-hero-side-fade site-hero-side-fade-right absolute inset-y-0 right-0" />
                </>
              ) : (
                <div className="site-hero-fallback h-full w-full" />
              )}
              <div className="site-hero-scrim absolute inset-0" />
            </div>
            <div className="relative flex h-full w-full flex-col justify-end p-6 sm:p-8">
              <h1 className="font-display max-w-2xl text-2xl font-semibold text-white drop-shadow sm:text-3xl lg:text-4xl">
                {slide.title}
              </h1>
              <div className="mt-5">
                <Button as={Link} to={`/noutati/${slide.slug}`} size="sm">
                  Citește mai mult
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        <>
          <button
            type="button"
            className="site-hero-arrow absolute left-3 top-1/2 z-10 -translate-y-1/2 sm:left-4"
            aria-label="Noutatea anterioară"
            onClick={() => goTo(index - 1)}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="site-hero-arrow absolute right-3 top-1/2 z-10 -translate-y-1/2 sm:right-4"
            aria-label="Noutatea următoare"
            onClick={() => goTo(index + 1)}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
            {slides.map((slide, i) => (
              <button
                key={slide.slug}
                type="button"
                className={`site-hero-dot ${i === index ? 'is-active' : ''}`}
                aria-label={`Mergi la noutatea ${i + 1}`}
                aria-current={i === index}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
