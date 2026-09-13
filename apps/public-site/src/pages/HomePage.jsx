import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { publicContentAPI } from '@shared/lib/api';
import { Alert, Card, CardDescription, CardHeader, CardTitle, Skeleton } from '../components/ui';
import { getYouTubeId, toEmbedUrl } from '../lib/video';
import HeroCarousel from '../components/HeroCarousel';
import NewsCard from '../components/NewsCard';
import AboutVovinamSection from '../components/AboutVovinamSection';
import PartnersSection from '../components/PartnersSection';
import NextEventSection from '../components/NextEventSection';
import Seo, { organizationJsonLd } from '../components/Seo';

export default function HomePage() {
  const [heroSlides, setHeroSlides] = useState([]);
  const [news, setNews] = useState([]);
  const [videos, setVideos] = useState([]);
  const [nextEvent, setNextEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const videoScrollRef = useRef(null);

  function scrollVideos(direction) {
    const el = videoScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: 'smooth' });
  }

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const [heroResponse, newsResponse, videosResponse, eventsResponse] = await Promise.all([
          publicContentAPI.news.list({ featured: true, page_size: 5 }),
          publicContentAPI.news.list({ featured: true, page_size: 3 }),
          publicContentAPI.videos.list({ featured: true, page_size: 8 }),
          publicContentAPI.events.upcoming(),
        ]);
        if (!isMounted) return;
        let heroResults = heroResponse.data?.results ?? [];
        let newsResults = newsResponse.data?.results ?? [];
        let videosResults = videosResponse.data?.results ?? [];
        // Fallback to the latest published items when nothing has been marked
        // "featured" yet in admin (e.g. right after a fresh content import),
        // so the homepage isn't empty while content curation catches up.
        if (heroResults.length === 0) {
          const latestHero = await publicContentAPI.news.list({ page_size: 5 });
          if (!isMounted) return;
          heroResults = latestHero.data?.results ?? [];
        }
        if (newsResults.length === 0) {
          const latestNews = await publicContentAPI.news.list({ page_size: 3 });
          if (!isMounted) return;
          newsResults = latestNews.data?.results ?? [];
        }
        if (videosResults.length === 0) {
          const latestVideos = await publicContentAPI.videos.list({ page_size: 8 });
          if (!isMounted) return;
          videosResults = latestVideos.data?.results ?? [];
        }
        setHeroSlides(heroResults);
        setNews(newsResults);
        setVideos(videosResults);
        setNextEvent(eventsResponse.data?.[0] ?? null);
      } catch {
        if (!isMounted) return;
        setError('Nu am putut încărca conținutul paginii principale.');
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
      <Seo path="/" jsonLd={organizationJsonLd()} />
      {loading ? (
        <Skeleton className="site-full-bleed -mt-8 h-[560px] w-full rounded-none lg:h-[620px]" />
      ) : heroSlides.length > 0 ? (
        <HeroCarousel slides={heroSlides} />
      ) : (
        <section className="text-center">
          <h1 className="text-fluid-display font-display font-semibold text-foreground">Vovinam Việt Võ Đạo România</h1>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Noutăți, competiții și materiale video ale Federației Române de Vovinam Việt Võ Đạo.
          </p>
        </section>
      )}

      {error && <Alert variant="destructive">{error}</Alert>}

      <section className="site-full-bleed -mt-4 bg-[#e9ecef] pb-12 pt-12 sm:pb-16 sm:pt-16">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-6">
            <h2 className="text-fluid-h2 font-display shrink-0 font-bold text-[#00334d]">Noutăți</h2>
            <span className="hidden h-px flex-1 bg-[#edb654] sm:block" aria-hidden="true" />
            <Link
              to="/noutati"
              className="text-fluid-button ml-auto hidden items-center gap-2 rounded-lg border-2 !border-[#0a4c75] bg-transparent px-4 py-3 font-bold uppercase text-[#0a4c75] transition hover:bg-[#0a4c75]/5 sm:ml-0 sm:inline-flex"
            >
              Toate noutățile
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {loading ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-80" />)}
            </div>
          ) : news.length === 0 ? (
            <p className="text-muted-foreground">Nu există noutăți momentan.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              {news.map((post) => <NewsCard key={post.slug} post={post} />)}
            </div>
          )}

          <Link
            to="/noutati"
            className="text-fluid-button inline-flex items-center justify-center gap-2 rounded-lg border-2 !border-[#0a4c75] bg-transparent px-4 py-3 font-bold uppercase text-[#0a4c75] transition hover:bg-[#0a4c75]/5 sm:hidden"
          >
            Toate noutățile
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <NextEventSection event={nextEvent} />

      <section className="pb-12 pt-12 sm:pb-16 sm:pt-16">
        <div className="mb-4 flex flex-wrap items-center gap-6">
          <h2 className="text-fluid-h2 font-display shrink-0 font-bold text-[#00334d]">Video</h2>
          <span className="hidden h-px flex-1 bg-[#edb654] sm:block" aria-hidden="true" />
          <Link
            to="/galerie"
            className="text-fluid-button ml-auto hidden items-center gap-2 rounded-lg border-2 !border-[#0a4c75] bg-transparent px-4 py-3 font-bold uppercase text-[#0a4c75] transition hover:bg-[#0a4c75]/5 sm:ml-0 sm:inline-flex"
          >
            Vezi toate
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="aspect-video" />)}
          </div>
        ) : videos.length === 0 ? (
          <p className="text-muted-foreground">Nu există materiale video momentan.</p>
        ) : (
          <div className="relative">
            <button
              type="button"
              onClick={() => scrollVideos(-1)}
              aria-label="Videoclipul anterior"
              className="absolute left-2 top-1/2 z-10 flex -translate-y-1/2 items-center justify-center rounded-full bg-white/90 p-2 text-[#00334d] shadow-md transition hover:bg-[#0a4c75] hover:text-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div
              ref={videoScrollRef}
              className="site-scrollbar-hide flex snap-x snap-mandatory gap-4 overflow-x-auto pb-1"
            >
              {videos.map((video) => <HomeVideoCard key={video.slug} video={video} />)}
            </div>
            <button
              type="button"
              onClick={() => scrollVideos(1)}
              aria-label="Următorul videoclip"
              className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 items-center justify-center rounded-full bg-white/90 p-2 text-[#00334d] shadow-md transition hover:bg-[#0a4c75] hover:text-white"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
        <Link
          to="/galerie"
          className="text-fluid-button mt-4 flex w-full items-center justify-center gap-2 rounded-lg border-2 !border-[#0a4c75] bg-transparent px-4 py-3 font-bold uppercase text-[#0a4c75] transition hover:bg-[#0a4c75]/5 sm:hidden"
        >
          Vezi toate
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <hr className="border-t border-border" />

      <AboutVovinamSection />

      <PartnersSection />
    </div>
  );
}

/** Homepage video card: shows only the YouTube thumbnail + a play button
 * (no title/channel overlay) until clicked, then swaps in the real embed
 * (autoplay, with YouTube's own controls - including fullscreen). Avoids
 * loading an iframe per card up front and keeps the card visually clean. */
function HomeVideoCard({ video }) {
  const [playing, setPlaying] = useState(false);
  const youTubeId = getYouTubeId(video.url);
  const thumbnail = youTubeId ? `https://img.youtube.com/vi/${youTubeId}/hqdefault.jpg` : null;

  return (
    <Card className="w-[85%] shrink-0 snap-center overflow-hidden sm:w-[55%] lg:w-[32%]">
      <div className="video-embed bg-black">
        {playing ? (
          <iframe
            src={`${toEmbedUrl(video.url)}?autoplay=1`}
            title={video.title}
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Redă: ${video.title}`}
            className="group absolute inset-0 flex h-full w-full items-center justify-center"
          >
            {thumbnail && (
              <img src={thumbnail} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            )}
            <span className="relative flex h-14 w-20 items-center justify-center rounded-2xl bg-[#ff0000] shadow-lg transition group-hover:bg-red-600">
              <Play className="h-7 w-7 fill-white text-white" />
            </span>
          </button>
        )}
      </div>
      <CardHeader>
        <CardTitle as="h3" className="line-clamp-2 text-base">{video.title}</CardTitle>
      </CardHeader>
    </Card>
  );
}
