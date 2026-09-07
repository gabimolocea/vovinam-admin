import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlayCircle } from 'lucide-react';
import { publicContentAPI } from '@shared/lib/api';
import { Alert, Button, Card, CardDescription, CardHeader, CardTitle, Skeleton } from '../components/ui';
import { toEmbedUrl } from '../lib/video';
import EventCard from '../components/EventCard';
import HeroCarousel from '../components/HeroCarousel';
import AboutVovinamSection from '../components/AboutVovinamSection';
import PartnersSection from '../components/PartnersSection';
import Seo, { organizationJsonLd } from '../components/Seo';

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function HomePage() {
  const [heroSlides, setHeroSlides] = useState([]);
  const [news, setNews] = useState([]);
  const [videos, setVideos] = useState([]);
  const [nextEvent, setNextEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const [heroResponse, newsResponse, videosResponse, eventsResponse] = await Promise.all([
          publicContentAPI.news.list({ featured: true, page_size: 5 }),
          publicContentAPI.news.list({ featured: true, page_size: 3 }),
          publicContentAPI.videos.list({ featured: true, page_size: 2 }),
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
          const latestVideos = await publicContentAPI.videos.list({ page_size: 2 });
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
    <div className="flex flex-col gap-12">
      <Seo path="/" jsonLd={organizationJsonLd()} />
      {heroSlides.length > 0 ? (
        <HeroCarousel slides={heroSlides} />
      ) : (
        <section className="text-center">
          <h1 className="font-display text-4xl font-semibold text-foreground">Vovinam Việt Võ Đạo România</h1>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Noutăți, competiții și materiale video ale Federației Române de Vovinam Việt Võ Đạo.
          </p>
        </section>
      )}

      {error && <Alert variant="destructive">{error}</Alert>}

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold">Noutăți recente</h2>
          <Button as={Link} to="/noutati" variant="ghost" size="sm">Vezi toate</Button>
        </div>
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
          </div>
        ) : news.length === 0 ? (
          <p className="text-muted-foreground">Nu există noutăți momentan.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {news.map((post) => (
              <Card
                key={post.slug}
                as={Link}
                to={`/noutati/${post.slug}`}
                className="transition hover:border-primary/50 hover:shadow-md"
              >
                {post.featured_image && (
                  <div className="aspect-video w-full overflow-hidden rounded-t-lg bg-muted">
                    <img
                      src={post.featured_image}
                      alt={post.featured_image_alt || post.title}
                      className="h-full w-full object-contain"
                    />
                  </div>
                )}
                <CardHeader>
                  <CardTitle as="h3" className="text-base">{post.title}</CardTitle>
                  <CardDescription>{formatDate(post.created_at)}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </section>

      {nextEvent && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold">Următorul eveniment</h2>
            <Button as={Link} to="/competitii" variant="ghost" size="sm">Vezi toate</Button>
          </div>
          <EventCard event={nextEvent} />
        </section>
      )}

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold">Video</h2>
          <Button as={Link} to="/video" variant="ghost" size="sm">Vezi toate</Button>
        </div>
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="aspect-video" />)}
          </div>
        ) : videos.length === 0 ? (
          <p className="text-muted-foreground">Nu există materiale video momentan.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {videos.map((video) => (
              <Card key={video.slug} className="overflow-hidden">
                <div className="video-embed">
                  <iframe src={toEmbedUrl(video.url)} title={video.title} allowFullScreen loading="lazy" />
                </div>
                <CardHeader>
                  <CardTitle as="h3" className="flex items-center gap-2 text-base"><PlayCircle className="h-4 w-4" />{video.title}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </section>

      <AboutVovinamSection />

      <PartnersSection />
    </div>
  );
}
