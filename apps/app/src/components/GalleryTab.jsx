import { useEffect, useState } from 'react';
import { publicContentAPI } from '@shared/lib/api';
import { EmptyState, Skeleton } from './ui';
import PhotoLightbox from './PhotoLightbox';

/**
 * "Poze" tab content: grid of photos tagged with the given athlete or club
 * (via the news gallery), opening a Facebook-style lightbox on click.
 * Pass exactly one of `athleteId` / `clubSlug`.
 */
export default function GalleryTab({ athleteId, clubSlug }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const request = athleteId
      ? publicContentAPI.gallery.listByAthlete(athleteId)
      : publicContentAPI.gallery.listByClub(clubSlug);
    request
      .then(({ data }) => {
        if (!cancelled) setPhotos(data.results || []);
      })
      .catch(() => {
        if (!cancelled) setPhotos([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [athleteId, clubSlug]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square" />)}
      </div>
    );
  }

  if (photos.length === 0) {
    return <EmptyState title="Nicio poză" message="Nu există încă poze etichetate aici." />;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {photos.map((photo, i) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setActiveIndex(i)}
            aria-label={photo.alt_text || photo.caption || `Vezi poza ${i + 1}`}
            className="group relative aspect-square overflow-hidden rounded-lg bg-muted"
          >
            <img
              src={photo.image}
              alt={photo.alt_text || photo.caption || ''}
              className="h-full w-full object-cover transition group-hover:scale-105"
            />
          </button>
        ))}
      </div>
      {activeIndex !== null && (
        <PhotoLightbox
          photos={photos}
          index={activeIndex}
          onClose={() => setActiveIndex(null)}
          onIndexChange={setActiveIndex}
        />
      )}
    </>
  );
}
