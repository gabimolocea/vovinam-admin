import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, MapPin, PlayCircle } from 'lucide-react';
import { publicContentAPI } from '@shared/lib/api';
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '../components/ui';
import { toEmbedUrl } from '../lib/video';

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function HomePage() {
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
        const [newsResponse, videosResponse, eventsResponse] = await Promise.all([
          publicContentAPI.news.list({ featured: true, page_size: 4 }),
          publicContentAPI.videos.list({ featured: true, page_size: 2 }),
          publicContentAPI.events.upcoming(),
        ]);
        if (!isMounted) return;
        setNews(newsResponse.data?.results ?? []);
        setVideos(videosResponse.data?.results ?? []);
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
      <section className="text-center">
        <h1 className="font-display text-4xl font-semibold text-foreground">Vovinam Việt Võ Đạo România</h1>
        <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
          Noutăți, competiții și materiale video ale Federației Române de Vovinam Việt Võ Đạo.
        </p>
      </section>

      {error && <Alert variant="destructive">{error}</Alert>}

      {nextEvent && (
        <Card className="border-primary/30">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardDescription className="flex items-center gap-1"><CalendarDays className="h-4 w-4" />Următoarea competiție</CardDescription>
              <CardTitle>{nextEvent.title}</CardTitle>
            </div>
            <Badge variant="secondary">{formatDate(nextEvent.start_date)}</Badge>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            {nextEvent.city && (
              <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />{nextEvent.city}</p>
            )}
            <Button as={Link} to="/competitii" size="sm" variant="outline">Vezi toate competițiile</Button>
          </CardContent>
        </Card>
      )}

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold">Noutăți recente</h2>
          <Button as={Link} to="/noutati" variant="ghost" size="sm">Vezi toate</Button>
        </div>
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
          </div>
        ) : news.length === 0 ? (
          <p className="text-muted-foreground">Nu există noutăți momentan.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {news.map((post) => (
              <Card key={post.slug}>
                {post.featured_image && (
                  <img src={post.featured_image} alt={post.featured_image_alt || post.title} className="h-32 w-full rounded-t-lg object-cover" />
                )}
                <CardHeader>
                  <CardTitle as="h3" className="text-base">
                    <Link to={`/noutati/${post.slug}`} className="hover:underline">{post.title}</Link>
                  </CardTitle>
                  <CardDescription>{formatDate(post.created_at)}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </section>

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
    </div>
  );
}
