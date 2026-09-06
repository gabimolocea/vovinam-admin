import { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Minimal lightbox: click a gallery thumbnail to view it full-size in an
 * overlay. There's no shared lightbox component in @shared yet, so this is
 * a small self-contained implementation scoped to the public site.
 */
export default function Lightbox({ image, onClose }) {
  useEffect(() => {
    if (!image) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [image, onClose]);

  if (!image) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Închide"
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="h-6 w-6" />
      </button>
      <img
        src={image.image}
        alt={image.alt_text || image.caption || ''}
        className="max-h-[85vh] max-w-full rounded-lg object-contain"
        onClick={(event) => event.stopPropagation()}
      />
      {image.caption && (
        <p className="absolute bottom-6 left-1/2 max-w-lg -translate-x-1/2 text-center text-sm text-white/80">
          {image.caption}
        </p>
      )}
    </div>
  );
}
