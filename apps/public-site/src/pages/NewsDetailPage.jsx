import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { publicContentAPI } from '@shared/lib/api';
import { Alert, Badge, Skeleton } from '../components/ui';
import Lightbox from '../components/Lightbox';
import Seo, { newsArticleJsonLd } from '../components/Seo';
import { excerpt, DEFAULT_OG_IMAGE } from '../lib/seo';

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function NewsDetailPage() {
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lightboxImage, setLightboxImage] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await publicContentAPI.news.get(slug);
        if (isMounted) setPost(response.data);
      } catch (err) {
        if (!isMounted) return;
        setError(err?.response?.status === 404 ? 'Această noutate nu a fost găsită.' : 'Nu am putut încărca noutatea.');
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
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !post) {
    return <Alert variant="destructive">{error || 'Noutatea nu a fost găsită.'}</Alert>;
  }

  return (
    <article className="flex flex-col gap-6">
      <Seo
        title={post.title}
        description={excerpt(post.content)}
        path={`/noutati/${slug}`}
        image={post.featured_image || DEFAULT_OG_IMAGE}
        type="article"
        jsonLd={newsArticleJsonLd(post, `/noutati/${slug}`)}
      />
      <Link to="/noutati" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />Înapoi la noutăți
      </Link>

      <header>
        <h1 className="font-display text-3xl font-semibold">{post.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{formatDate(post.created_at)} · {post.author_name}</p>
        {post.tags && (
          <div className="mt-3 flex flex-wrap gap-1">
            {post.tags.split(',').map((tag) => tag.trim()).filter(Boolean).map((tag) => (
              <Badge key={tag} variant="outline">{tag}</Badge>
            ))}
          </div>
        )}
      </header>

      {post.featured_image && (
        <img src={post.featured_image} alt={post.featured_image_alt || post.title} className="w-full rounded-lg object-cover" />
      )}

      <div className="prose-content max-w-none" dangerouslySetInnerHTML={{ __html: post.content }} />

      {post.gallery_images?.length > 0 && (
        <section>
          <h2 className="font-display mb-3 text-xl font-semibold">Galerie foto</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {post.gallery_images.map((image) => (
              <button
                key={image.id}
                type="button"
                className="overflow-hidden rounded-lg border border-border"
                onClick={() => setLightboxImage(image)}
              >
                <img src={image.image} alt={image.alt_text || ''} className="h-32 w-full object-cover transition-transform hover:scale-105" />
              </button>
            ))}
          </div>
        </section>
      )}

      <Lightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />
    </article>
  );
}
