import { useEffect, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import PhotoLightbox from './PhotoLightbox';

function fileName(url) {
  try {
    return decodeURIComponent(new URL(url, window.location.origin).pathname.split('/').pop());
  } catch {
    return 'Document PDF';
  }
}

/** A page with a folded corner and "PDF" on it - stands in for a thumbnail. */
function PdfIllustration({ className = '' }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path d="M10 4h20l10 10v30H10z" fill="#fff" stroke="#c0392b" strokeWidth="2" />
      <path d="M30 4v10h10" fill="#fbe3e0" stroke="#c0392b" strokeWidth="2" />
      <path d="M15 18h10M15 22h17M15 40h17" stroke="#d6dbe1" strokeWidth="1.5" />
      <rect x="6" y="25" width="30" height="12" rx="2" fill="#c0392b" />
      <text x="21" y="34.5" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="9.5" fontWeight="700" fill="#fff">PDF</text>
    </svg>
  );
}

/** Full-screen viewer for one PDF: the browser's own PDF reader in an
 * iframe, so every page can be scrolled through without leaving the site.
 * Phones that can't show a PDF inline get the "open" link instead. */
function PdfViewer({ item, onClose }) {
  const title = item.caption || fileName(item.document);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex items-center gap-3 px-4 py-3 text-white">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{title}</p>
        <a
          href={item.document}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium ring-1 ring-white/30 hover:bg-white/25"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Deschide PDF-ul
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Închide"
          className="shrink-0 rounded-full bg-white/15 p-2 ring-1 ring-white/30 hover:bg-white/25"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <iframe src={item.document} title={title} className="mx-auto w-full max-w-5xl flex-1 rounded-t-lg bg-white" />
    </div>
  );
}

/**
 * "Galerie foto" of an article or event. Its items are photos or PDFs, in
 * the order the admin set: a photo opens in the photo viewer (which steps
 * through the photos only), a PDF in the PDF viewer.
 */
export default function GalleryGrid({ items = [] }) {
  const photos = items.filter((item) => item.image);
  const [photoIndex, setPhotoIndex] = useState(null);
  const [openPdf, setOpenPdf] = useState(null);

  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-semibold text-[#00334d]">Galerie foto</h2>
      <div className="grid grid-cols-3 gap-3">
        {items.map((item) => (item.image ? (
          <button
            key={item.id}
            type="button"
            className="overflow-hidden rounded-lg border border-[#dce0e5]"
            onClick={() => setPhotoIndex(photos.indexOf(item))}
          >
            <img src={item.image} alt={item.alt_text || ''} className="aspect-video h-full w-full object-cover transition-transform hover:scale-105" />
          </button>
        ) : item.document ? (
          <button
            key={item.id}
            type="button"
            onClick={() => setOpenPdf(item)}
            className="group flex aspect-video flex-col items-center justify-center gap-1.5 rounded-lg border border-[#dce0e5] bg-[#f5f7f9] p-3 text-center text-[#00334d] transition-colors hover:bg-[#e9ecef]"
          >
            <PdfIllustration className="h-12 w-12 shrink-0 transition-transform group-hover:scale-105" />
            <span className="line-clamp-2 break-all text-xs font-medium">{item.caption || fileName(item.document)}</span>
          </button>
        ) : null))}
      </div>
      {photoIndex !== null && (
        <PhotoLightbox
          photos={photos}
          index={photoIndex}
          onIndexChange={setPhotoIndex}
          onClose={() => setPhotoIndex(null)}
        />
      )}
      {openPdf && <PdfViewer item={openPdf} onClose={() => setOpenPdf(null)} />}
    </section>
  );
}
