import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, GalleryTagEditor, useSwipe } from '@shared';
import { publicContentAPI } from '@shared/lib/api';
import { ChevronLeft, ChevronRight, MessageCircle, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { Button, Spinner, Textarea } from './ui';

/**
 * Facebook-style fullscreen photo viewer for the tagged gallery feature:
 * navigate between photos in the current set, like/dislike, and read/add
 * threaded comments - all wired to /api/public/gallery/*.
 */
export default function PhotoLightbox({ photos, index, onClose, onIndexChange }) {
  const { isAuthenticated } = useAuth();
  const photo = photos[index];
  const [detail, setDetail] = useState(photo || null);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const [reacting, setReacting] = useState(false);

  const loadComments = useCallback(async (photoId) => {
    setCommentsLoading(true);
    try {
      const { data } = await publicContentAPI.gallery.comments(photoId);
      setComments(data);
    } catch {
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!photo) return;
    setDetail(photo);
    setCommentText('');
    loadComments(photo.id);

    // Cerem poza intreaga de la server, nu ne bazam pe ce ne-a dat lista.
    // Galeria unui articol trimite doar id, imagine si legenda - fara
    // etichete si fara reactii - iar fara pasul asta vizualizatorul ar
    // arata zero aprecieri si nicio eticheta pentru o poza care le are.
    let cancelled = false;
    publicContentAPI.gallery.get(photo.id)
      .then(({ data }) => { if (!cancelled) setDetail((prev) => ({ ...prev, ...data })); })
      .catch(() => { /* ramanem cu ce ne-a dat lista */ });
    return () => { cancelled = true; };
  }, [photo, loadComments]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
      else if (event.key === 'ArrowRight' && index < photos.length - 1) onIndexChange(index + 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onIndexChange, index, photos.length]);

  // Derulare cu degetul: pe telefon nimeni nu caută săgeți de 40px pe
  // un ecran negru, trage de poză.
  const swipe = useSwipe({
    onLeft: () => { if (index < photos.length - 1) onIndexChange(index + 1); },
    onRight: () => { if (index > 0) onIndexChange(index - 1); },
  });

  if (!detail) return null;

  async function handleReact(type) {
    if (!isAuthenticated || reacting) return;
    setReacting(true);
    try {
      const { data } = await publicContentAPI.gallery.react(detail.id, type);
      setDetail((prev) => ({ ...prev, like_count: data.like_count, dislike_count: data.dislike_count, my_reaction: data.my_reaction }));
    } finally {
      setReacting(false);
    }
  }

  async function handleAddComment(event) {
    event.preventDefault();
    const content = commentText.trim();
    if (!content || posting) return;
    setPosting(true);
    try {
      const { data } = await publicContentAPI.gallery.addComment(detail.id, content);
      setComments((prev) => [...prev, { ...data, replies: [] }]);
      setCommentText('');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 md:flex-row" role="dialog" aria-modal="true">
      <button
        type="button"
        onClick={onClose}
        aria-label="Închide"
        className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="h-6 w-6" />
      </button>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4" {...swipe}>
        {index > 0 && (
          <button
            type="button"
            onClick={() => onIndexChange(index - 1)}
            aria-label="Poza anterioară"
            className="absolute left-2 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        <img
          src={detail.image}
          alt={detail.alt_text || detail.caption || ''}
          className="max-h-[80vh] max-w-full rounded-lg object-contain md:max-h-[92vh]"
        />
        {index < photos.length - 1 && (
          <button
            type="button"
            onClick={() => onIndexChange(index + 1)}
            aria-label="Poza următoare"
            className="absolute right-2 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      <div className="flex w-full flex-col border-t border-border bg-card text-foreground md:h-full md:w-96 md:border-l md:border-t-0">
        <div className="flex flex-col gap-2 border-b border-border p-4">
          {detail.news_post_title && (
            <Link to={`/noutati/${detail.news_post_slug}`} className="text-sm font-medium text-foreground hover:underline">
              {detail.news_post_title}
            </Link>
          )}
          {detail.caption && <p className="text-sm text-muted-foreground">{detail.caption}</p>}
          <GalleryTagEditor
            photoId={detail.id}
            tags={detail.tagged_athletes || []}
            onChange={(tags) => setDetail((prev) => ({ ...prev, tagged_athletes: tags }))}
            renderLink={(tag) => (
              <Link to={`/sportivi/${tag.id}`} className="text-primary hover:underline">
                {tag.name}
              </Link>
            )}
          />
          {detail.tagged_clubs?.length > 0 && (
            <p className="flex flex-wrap gap-x-1 text-xs text-muted-foreground">
              <span>Cluburi:</span>
              {detail.tagged_clubs.map((c) => (
                <Link key={`c-${c.id}`} to={`/cluburi/${c.slug}`} className="text-primary hover:underline">
                  {c.name}
                </Link>
              ))}
            </p>
          )}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              disabled={!isAuthenticated || reacting}
              onClick={() => handleReact('like')}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition disabled:opacity-40 ${detail.my_reaction === 'like' ? 'bg-primary/20 text-primary' : 'bg-muted hover:bg-muted/70'}`}
            >
              <ThumbsUp className="h-4 w-4" /> {detail.like_count}
            </button>
            <button
              type="button"
              disabled={!isAuthenticated || reacting}
              onClick={() => handleReact('dislike')}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition disabled:opacity-40 ${detail.my_reaction === 'dislike' ? 'bg-destructive/20 text-destructive' : 'bg-muted hover:bg-muted/70'}`}
            >
              <ThumbsDown className="h-4 w-4" /> {detail.dislike_count}
            </button>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MessageCircle className="h-4 w-4" /> {comments.length}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {commentsLoading ? (
            <div className="flex justify-center py-6"><Spinner className="text-muted-foreground" /></div>
          ) : comments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Niciun comentariu încă.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {comments.map((comment) => (
                <li key={comment.id} className="flex flex-col gap-1">
                  <p className="text-sm">
                    <span className="font-medium">{comment.author_name}</span>{' '}
                    <span className="text-foreground">{comment.content}</span>
                  </p>
                  {comment.replies?.length > 0 && (
                    <ul className="ml-4 flex flex-col gap-1 border-l border-border pl-3">
                      {comment.replies.map((reply) => (
                        <li key={reply.id} className="text-sm">
                          <span className="font-medium">{reply.author_name}</span>{' '}
                          <span className="text-foreground">{reply.content}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={handleAddComment} className="flex items-end gap-2 border-t border-border p-4">
          <Textarea
            value={commentText}
            onChange={(event) => setCommentText(event.target.value)}
            placeholder={isAuthenticated ? 'Scrie un comentariu…' : 'Autentifică-te pentru a comenta'}
            disabled={!isAuthenticated || posting}
            rows={1}
            className="min-h-0 flex-1 resize-none"
          />
          <Button type="submit" size="sm" disabled={!isAuthenticated || posting || !commentText.trim()}>
            Trimite
          </Button>
        </form>
      </div>
    </div>
  );
}
