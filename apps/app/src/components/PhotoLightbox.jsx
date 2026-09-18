import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@shared';
import { publicContentAPI } from '@shared/lib/api';
import { ChevronLeft, ChevronRight, MessageCircle, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { Button, Spinner, Textarea } from './ui';

const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL || 'http://localhost:5179';

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

      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
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

      <div className="flex w-full flex-col border-t border-white/10 bg-neutral-900 text-white md:h-full md:w-96 md:border-l md:border-t-0">
        <div className="flex flex-col gap-2 border-b border-white/10 p-4">
          {detail.news_post_title && (
            <a href={`${PUBLIC_SITE_URL}/noutati/${detail.news_post_slug}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-white/90 hover:underline">
              {detail.news_post_title}
            </a>
          )}
          {detail.caption && <p className="text-sm text-white/70">{detail.caption}</p>}
          {(detail.tagged_athletes?.length > 0 || detail.tagged_clubs?.length > 0) && (
            <p className="flex flex-wrap gap-x-1 text-xs text-white/60">
              <span>Etichete:</span>
              {detail.tagged_athletes.map((a) => (
                <a key={`a-${a.id}`} href={`${PUBLIC_SITE_URL}/sportivi/${a.id}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  {a.name}
                </a>
              ))}
              {detail.tagged_clubs.map((c) => (
                <a key={`c-${c.id}`} href={`${PUBLIC_SITE_URL}/cluburi/${c.slug}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  {c.name}
                </a>
              ))}
            </p>
          )}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              disabled={!isAuthenticated || reacting}
              onClick={() => handleReact('like')}
              aria-label={`Apreciază${detail.my_reaction === 'like' ? ' (apreciat deja)' : ''}`}
              aria-pressed={detail.my_reaction === 'like'}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition disabled:opacity-40 ${detail.my_reaction === 'like' ? 'bg-primary/20 text-primary' : 'bg-white/10 hover:bg-white/20'}`}
            >
              <ThumbsUp className="h-4 w-4" /> {detail.like_count}
            </button>
            <button
              type="button"
              disabled={!isAuthenticated || reacting}
              onClick={() => handleReact('dislike')}
              aria-label={`Nu apreciază${detail.my_reaction === 'dislike' ? ' (selectat deja)' : ''}`}
              aria-pressed={detail.my_reaction === 'dislike'}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition disabled:opacity-40 ${detail.my_reaction === 'dislike' ? 'bg-destructive/20 text-destructive' : 'bg-white/10 hover:bg-white/20'}`}
            >
              <ThumbsDown className="h-4 w-4" /> {detail.dislike_count}
            </button>
            <span className="flex items-center gap-1.5 text-sm text-white/60">
              <MessageCircle className="h-4 w-4" /> {comments.length}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {commentsLoading ? (
            <div className="flex justify-center py-6"><Spinner className="text-white/60" /></div>
          ) : comments.length === 0 ? (
            <p className="py-6 text-center text-sm text-white/50">Niciun comentariu încă.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {comments.map((comment) => (
                <li key={comment.id} className="flex flex-col gap-1">
                  <p className="text-sm">
                    <span className="font-medium">{comment.author_name}</span>{' '}
                    <span className="text-white/80">{comment.content}</span>
                  </p>
                  {comment.replies?.length > 0 && (
                    <ul className="ml-4 flex flex-col gap-1 border-l border-white/10 pl-3">
                      {comment.replies.map((reply) => (
                        <li key={reply.id} className="text-sm">
                          <span className="font-medium">{reply.author_name}</span>{' '}
                          <span className="text-white/80">{reply.content}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={handleAddComment} className="flex items-end gap-2 border-t border-white/10 p-4">
          <Textarea
            value={commentText}
            onChange={(event) => setCommentText(event.target.value)}
            placeholder={isAuthenticated ? 'Scrie un comentariu…' : 'Autentifică-te pentru a comenta'}
            aria-label="Comentariu"
            disabled={!isAuthenticated || posting}
            rows={1}
            className="min-h-0 flex-1 resize-none bg-white/10 text-white placeholder:text-white/40"
          />
          <Button type="submit" size="sm" disabled={!isAuthenticated || posting || !commentText.trim()}>
            Trimite
          </Button>
        </form>
      </div>
    </div>
  );
}
