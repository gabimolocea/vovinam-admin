import { useEffect, useState } from 'react';
import { Download, X, ZoomIn, ZoomOut } from 'lucide-react';

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;

/**
 * Minimal lightbox: click a gallery thumbnail to view it full-size in an
 * overlay, with zoom and download controls. There's no shared lightbox
 * component in @shared yet, so this is a small self-contained
 * implementation scoped to the public site.
 */
export default function Lightbox({ image, onClose }) {
  const [zoom, setZoom] = useState(1);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setZoom(1);
  }, [image]);

  useEffect(() => {
    if (!image) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === '+' || event.key === '=') setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
      if (event.key === '-') setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [image, onClose]);

  if (!image) return null;

  function zoomIn(event) {
    event.stopPropagation();
    setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100));
  }

  function zoomOut(event) {
    event.stopPropagation();
    setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100));
  }

  async function handleDownload(event) {
    event.stopPropagation();
    if (downloading) return;
    setDownloading(true);
    try {
      const response = await fetch(image.image);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = image.image.split('/').pop() || 'imagine.jpg';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(image.image, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="fixed right-4 top-4 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={zoomOut}
          disabled={zoom <= MIN_ZOOM}
          aria-label="Micșorează"
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ZoomOut className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={zoomIn}
          disabled={zoom >= MAX_ZOOM}
          aria-label="Mărește"
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ZoomIn className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          aria-label="Descarcă imaginea"
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Închide"
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <img
        src={image.image}
        alt={image.alt_text || image.caption || ''}
        className={`max-h-[85vh] max-w-full rounded-lg object-contain transition-transform duration-200 ${zoom > 1 ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
        style={{ transform: `scale(${zoom})` }}
        onClick={(event) => {
          event.stopPropagation();
          setZoom((z) => (z > 1 ? 1 : Math.min(MAX_ZOOM, z + ZOOM_STEP)));
        }}
      />
      {image.caption && (
        <p className="fixed bottom-6 left-1/2 max-w-lg -translate-x-1/2 text-center text-sm text-white/80">
          {image.caption}
        </p>
      )}
    </div>
  );
}
