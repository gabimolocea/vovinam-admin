import { useEffect, useState } from 'react';
import { publicContentAPI } from '@shared/lib/api';
import { Alert, Button, Card, CardHeader, CardTitle, EmptyState, Skeleton } from '../components/ui';
import { toEmbedUrl } from '../lib/video';

export default function VideosPage() {
  const [videos, setVideos] = useState([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await publicContentAPI.videos.list({ page });
        if (!isMounted) return;
        setVideos(response.data?.results ?? []);
        setHasNext(Boolean(response.data?.next));
      } catch {
        if (!isMounted) return;
        setError('Nu am putut încărca materialele video.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [page]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-semibold">Video</h1>

      {error && <Alert variant="destructive">{error}</Alert>}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-video" />)}
        </div>
      ) : videos.length === 0 ? (
        <EmptyState title="Niciun video disponibil" message="Reveniți mai târziu pentru materiale video noi." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {videos.map((video) => (
              <Card key={video.slug} className="overflow-hidden">
                <div className="video-embed">
                  <iframe src={toEmbedUrl(video.url)} title={video.title} allowFullScreen loading="lazy" />
                </div>
                <CardHeader>
                  <CardTitle as="h2" className="text-base">{video.title}</CardTitle>
                  {video.description && (
                    <p className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: video.description }} />
                  )}
                </CardHeader>
              </Card>
            ))}
          </div>

          <div className="flex justify-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
            <Button size="sm" variant="outline" disabled={!hasNext} onClick={() => setPage((p) => p + 1)}>Următor</Button>
          </div>
        </>
      )}
    </div>
  );
}
