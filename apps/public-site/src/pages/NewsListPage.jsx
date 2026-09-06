import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { publicContentAPI } from '@shared/lib/api';
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Input, Skeleton } from '../components/ui';
import Seo from '../components/Seo';

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function NewsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tagFilter = searchParams.get('tag') || '';
  const page = Number(searchParams.get('page') || '1');

  const [news, setNews] = useState([]);
  const [count, setCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await publicContentAPI.news.list({
          page,
          tags: tagFilter || undefined,
        });
        if (!isMounted) return;
        setNews(response.data?.results ?? []);
        setCount(response.data?.count ?? 0);
        setHasNext(Boolean(response.data?.next));
      } catch {
        if (!isMounted) return;
        setError('Nu am putut încărca lista de noutăți.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [page, tagFilter]);

  return (
    <div className="flex flex-col gap-6">
      <Seo
        title="Noutăți"
        description="Cele mai recente noutăți, comunicate și anunțuri ale Federației Române de Vovinam Việt Võ Đạo."
        path="/noutati"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold">Noutăți</h1>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get('tag');
            setSearchParams(value ? { tag: String(value) } : {});
          }}
        >
          <Input name="tag" defaultValue={tagFilter} placeholder="Filtrează după etichetă…" className="w-56" />
          <Button type="submit" size="sm" variant="outline">Filtrează</Button>
          {tagFilter && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setSearchParams({})}>Resetează</Button>
          )}
        </form>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-56" />)}
        </div>
      ) : news.length === 0 ? (
        <EmptyState title="Nicio noutate găsită" message={tagFilter ? `Nu există noutăți cu eticheta „${tagFilter}”.` : 'Reveniți mai târziu.'} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {news.map((post) => (
              <Card key={post.slug} className="flex flex-col">
                {post.featured_image && (
                  <img src={post.featured_image} alt={post.featured_image_alt || post.title} className="h-40 w-full rounded-t-lg object-cover" />
                )}
                <CardHeader>
                  <CardTitle as="h2" className="text-lg">
                    <Link to={`/noutati/${post.slug}`} className="hover:underline">{post.title}</Link>
                  </CardTitle>
                  <CardDescription>{formatDate(post.created_at)} · {post.author_name}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-3">
                  <p className="text-sm text-muted-foreground line-clamp-3" dangerouslySetInnerHTML={{ __html: post.excerpt }} />
                  {post.tags && (
                    <div className="flex flex-wrap gap-1">
                      {post.tags.split(',').map((tag) => tag.trim()).filter(Boolean).map((tag) => (
                        <Badge key={tag} variant="outline">{tag}</Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{count} noutăți în total</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setSearchParams({ ...(tagFilter ? { tag: tagFilter } : {}), page: String(page - 1) })}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!hasNext}
                onClick={() => setSearchParams({ ...(tagFilter ? { tag: tagFilter } : {}), page: String(page + 1) })}
              >
                Următor
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
