import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { toEmbedUrl } from '../lib/video';

/** Fullscreen video viewer for the Media page's "Video" tab - same
 * prev/next/close/keyboard-nav shape as PhotoLightbox, but without the
 * comments/reactions panel (the Video model has no such infrastructure). */
export default function VideoLightbox({ videos, index, onClose, onIndexChange }) {
  const video = videos[index];

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
      else if (event.key === 'ArrowRight' && index < videos.length - 1) onIndexChange(index + 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onIndexChange, index, videos.length]);

  if (!video) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" role="dialog" aria-modal="true">
      <button
        type="button"
        onClick={onClose}
        aria-label="Închide"
        className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="h-6 w-6" />
      </button>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4 pb-0">
        {index > 0 && (
          <button
            type="button"
            onClick={() => onIndexChange(index - 1)}
            aria-label="Videoul anterior"
            className="absolute left-2 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        <div className="video-embed w-full max-w-4xl">
          <iframe src={toEmbedUrl(video.url)} title={video.title} allowFullScreen />
        </div>
        {index < videos.length - 1 && (
          <button
            type="button"
            onClick={() => onIndexChange(index + 1)}
            aria-label="Videoul următor"
            className="absolute right-2 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 p-4 text-center text-white">
        <p className="font-display text-lg font-semibold">{video.title}</p>
        {(video.tagged_athletes?.length > 0 || video.tagged_clubs?.length > 0) && (
          <p className="flex flex-wrap justify-center gap-x-2 text-sm text-white/60">
            <span>Etichete:</span>
            {video.tagged_athletes.map((a) => (
              <Link key={`a-${a.id}`} to={`/sportivi/${a.id}`} className="text-white/90 hover:underline">
                {a.name}
              </Link>
            ))}
            {video.tagged_clubs.map((c) => (
              <Link key={`c-${c.id}`} to={`/cluburi/${c.slug}`} className="text-white/90 hover:underline">
                {c.name}
              </Link>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}
