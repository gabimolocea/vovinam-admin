import { useState } from 'react';
import { FileText } from 'lucide-react';
import PhotoLightbox from './PhotoLightbox';

function fileName(url) {
  try {
    return decodeURIComponent(new URL(url, window.location.origin).pathname.split('/').pop());
  } catch {
    return 'Document PDF';
  }
}

/**
 * "Galerie foto" of an article or event. Its items are photos or PDFs, in
 * the order the admin set: a photo opens in the photo viewer (which steps
 * through the photos only), a PDF opens in a new tab.
 */
export default function GalleryGrid({ items = [] }) {
  const photos = items.filter((item) => item.image);
  const [photoIndex, setPhotoIndex] = useState(null);

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
          <a
            key={item.id}
            href={item.document}
            target="_blank"
            rel="noopener noreferrer"
            className="flex aspect-video flex-col items-center justify-center gap-2 rounded-lg border border-[#dce0e5] bg-[#f5f7f9] p-3 text-center text-[#00334d] transition-colors hover:bg-[#e9ecef]"
          >
            <FileText className="h-8 w-8 shrink-0 text-[#c0392b]" aria-hidden="true" />
            <span className="line-clamp-2 break-all text-xs font-medium">{item.caption || fileName(item.document)}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#5b6675]">PDF</span>
          </a>
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
    </section>
  );
}
