import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MessageCircle, Pause, Volume2 } from 'lucide-react';
import { useAuth, publicContentAPI } from '@shared';
import { Alert, Button, Skeleton, Textarea } from '../components/ui';
import Lightbox from '../components/Lightbox';
import ShareButton from '../components/ShareButton';
import Seo, { newsArticleJsonLd } from '../components/Seo';
import Breadcrumbs from '../components/Breadcrumbs';
import { excerpt, DEFAULT_OG_IMAGE } from '../lib/seo';
import { stripInlineGalleries } from '../lib/htmlContent';

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
}

// News posts don't have a real "category" field, only a freeform
// comma-separated `tags` string - use the first tag as the category shown
// next to the date, same convention as the homepage hero carousel.
function primaryCategory(post) {
  return post.tags?.split(',')[0]?.trim() || '';
}

function htmlToPlainText(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent.replace(/\s+/g, ' ').trim();
}

/** Reads the article aloud using the browser's built-in speech synthesis
 * (Web Speech API) - no backend/TTS service needed. Content is Romanian,
 * so the utterance is pinned to `ro-RO` and, when the browser exposes a
 * matching system voice, that voice is used explicitly for better
 * pronunciation. Not every browser ships a Romanian voice, but this at
 * least attempts one everywhere Speech Synthesis is supported at all. */
function ListenButton({ title, html }) {
  const [state, setState] = useState('idle'); // idle | speaking | paused
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    if (!supported) return undefined;
    return () => window.speechSynthesis.cancel();
  }, [supported]);

  if (!supported) return null;

  function handleClick() {
    if (state === 'speaking') {
      window.speechSynthesis.pause();
      setState('paused');
      return;
    }
    if (state === 'paused') {
      window.speechSynthesis.resume();
      setState('speaking');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(`${title}. ${htmlToPlainText(html)}`);
    utterance.lang = 'ro-RO';
    const romanianVoice = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('ro'));
    if (romanianVoice) utterance.voice = romanianVoice;
    utterance.onend = () => setState('idle');
    utterance.onerror = () => setState('idle');
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setState('speaking');
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-2 rounded-lg border border-[#dce0e5] px-4 py-2 text-sm font-medium text-[#00334d] transition hover:bg-[#e9ecef]"
    >
      {state === 'speaking' ? <Pause className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      {state === 'idle' && 'Ascultă articolul'}
      {state === 'speaking' && 'Pauză'}
      {state === 'paused' && 'Continuă'}
    </button>
  );
}

function Comment({ comment }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-[#00334d]">{comment.author_name}</span>
        <span className="text-xs text-muted-foreground">{formatDate(comment.created_at)}</span>
      </div>
      <p className="text-sm text-[#00334d]/90">{comment.content}</p>
      {comment.replies?.length > 0 && (
        <div className="mt-2 flex flex-col gap-3 border-l-2 border-[#e9ecef] pl-4">
          {comment.replies.map((reply) => <Comment key={reply.id} comment={reply} />)}
        </div>
      )}
    </div>
  );
}

export default function NewsDetailPage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lightboxImage, setLightboxImage] = useState(null);

  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState('');
  const commentsRef = useRef(null);

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

  useEffect(() => {
    let isMounted = true;

    async function loadComments() {
      setCommentsLoading(true);
      try {
        const response = await publicContentAPI.news.comments(slug);
        if (isMounted) setComments(response.data ?? []);
      } catch {
        // non-critical - the article itself already loaded successfully
      } finally {
        if (isMounted) setCommentsLoading(false);
      }
    }

    loadComments();
    return () => {
      isMounted = false;
    };
  }, [slug]);

  const cleanContent = useMemo(
    () => stripInlineGalleries(post?.content, post?.gallery_images),
    [post?.content, post?.gallery_images],
  );
  const tags = useMemo(
    () => post?.tags?.split(',').map((tag) => tag.trim()).filter(Boolean) ?? [],
    [post?.tags],
  );

  async function handleSubmitComment(event) {
    event.preventDefault();
    const content = commentText.trim();
    if (!content || submittingComment) return;
    setSubmittingComment(true);
    setCommentError('');
    try {
      const response = await publicContentAPI.news.addComment(slug, content);
      setComments((current) => [...current, response.data]);
      setCommentText('');
    } catch {
      setCommentError('Nu am putut trimite comentariul. Încearcă din nou.');
    } finally {
      setSubmittingComment(false);
    }
  }

  function scrollToComments() {
    commentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !post) {
    return <Alert variant="destructive">{error || 'Noutatea nu a fost găsită.'}</Alert>;
  }

  return (
    <article className="flex flex-col">
      <Seo
        title={post.title}
        description={excerpt(post.content)}
        path={`/noutati/${slug}`}
        image={post.featured_image || DEFAULT_OG_IMAGE}
        type="article"
        jsonLd={newsArticleJsonLd(post, `/noutati/${slug}`)}
      />
      <Breadcrumbs items={[{ label: 'Noutăți', to: '/noutati' }, { label: post.title }]} />

      <div className="site-full-bleed bg-[#e9ecef] pb-20 pt-6 sm:pb-24 sm:pt-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 text-center">
          <h1 className="text-fluid-display font-display font-bold text-[#00334d]">{post.title}</h1>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {primaryCategory(post) && (
              <span className="rounded-full bg-secondary/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                {primaryCategory(post)}
              </span>
            )}
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#00334d]">
              {formatDate(post.created_at)}
            </span>
          </div>
        </div>
      </div>

      <div className="site-full-bleed -mt-10 sm:-mt-14">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-4">
        {post.featured_image && (
          <figure className="flex w-full flex-col gap-2">
            <button
              type="button"
              className="cursor-zoom-in"
              onClick={() => setLightboxImage({ image: post.featured_image, alt_text: post.featured_image_alt || post.title })}
            >
              <img
                src={post.featured_image}
                alt={post.featured_image_alt || post.title}
                className="mx-auto h-auto max-h-[600px] w-auto max-w-full rounded-lg object-contain"
              />
            </button>
            {post.featured_image_alt && (
              <figcaption className="text-sm text-muted-foreground">{post.featured_image_alt}</figcaption>
            )}
          </figure>
        )}

        <div className="flex w-full max-w-3xl flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <ShareButton title={post.title} />
          <ListenButton title={post.title} html={cleanContent} />
          <button
            type="button"
            onClick={scrollToComments}
            className="inline-flex items-center gap-2 rounded-lg border border-[#dce0e5] px-4 py-2 text-sm font-medium text-[#00334d] transition hover:bg-[#e9ecef]"
          >
            <MessageCircle className="h-4 w-4" />
            {comments.length}
          </button>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-[#00334d]">În acest articol:</p>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-[#e9ecef] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#00334d]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="prose-content ck-content max-w-none" dangerouslySetInnerHTML={{ __html: cleanContent }} />

        {post.gallery_images?.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-xl font-semibold text-[#00334d]">Galerie foto</h2>
            <div className="grid grid-cols-3 gap-3">
              {post.gallery_images.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  className="overflow-hidden rounded-lg border border-[#dce0e5]"
                  onClick={() => setLightboxImage(image)}
                >
                  <img src={image.image} alt={image.alt_text || ''} className="aspect-video h-full w-full object-cover transition-transform hover:scale-105" />
                </button>
              ))}
            </div>
          </section>
        )}

        <section ref={commentsRef} className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-semibold text-[#00334d]">
            Comentarii {comments.length > 0 && `(${comments.length})`}
          </h2>

          {user ? (
            <form onSubmit={handleSubmitComment} className="flex flex-col gap-2">
              <Textarea
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder="Scrie un comentariu..."
                rows={3}
                maxLength={1000}
              />
              {commentError && <p className="text-sm text-destructive">{commentError}</p>}
              <Button type="submit" size="sm" className="w-fit" disabled={!commentText.trim() || submittingComment}>
                {submittingComment ? 'Se trimite...' : 'Trimite comentariul'}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              <Link to="/cont" className="font-medium text-[#0a4c75] hover:underline">Autentifică-te</Link> pentru a lăsa un comentariu.
            </p>
          )}

          {commentsLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Niciun comentariu momentan. Fii primul care comentează!</p>
          ) : (
            <div className="flex flex-col gap-4">
              {comments.map((comment) => <Comment key={comment.id} comment={comment} />)}
            </div>
          )}
        </section>
        </div>
      </div>
      </div>

      <Lightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />
    </article>
  );
}
