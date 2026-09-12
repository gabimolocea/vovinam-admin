import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { athleteAPI, publicContentAPI } from '@shared/lib/api';
import {
  Alert, Button, EmptyState, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton,
} from '../components/ui';
import SearchableSelect from '../components/SearchableSelect';
import Breadcrumbs from '../components/Breadcrumbs';
import Seo from '../components/Seo';
import PhotoLightbox from '../components/PhotoLightbox';
import VideoLightbox from '../components/VideoLightbox';
import { PlayCircle } from 'lucide-react';

const PAGE_SIZE = 24;
const ALL_CLUBS = '__all__';

// Falls back to YouTube's own thumbnail when a video has none uploaded -
// matches the extraction logic in lib/video.js's toEmbedUrl.
function videoThumbnail(video) {
  if (video.thumbnail) return video.thumbnail;
  try {
    const parsed = new URL(video.url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = parsed.searchParams.get('v');
      if (id) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
    }
    if (host === 'youtu.be') {
      const id = parsed.pathname.replace('/', '');
      if (id) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
    }
  } catch {
    return null;
  }
  return null;
}

/** Sitewide Media page: Video/Poze tabs, each filterable by club or athlete
 * (tagged content), each opening a fullscreen lightbox with prev/next nav. */
export default function MediaPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'poze' ? 'poze' : 'video';
  const clubSlug = searchParams.get('club') || '';
  const athleteId = searchParams.get('athlete') || '';
  const athleteName = searchParams.get('athleteName') || '';

  const [clubs, setClubs] = useState([]);
  const [items, setItems] = useState([]);
  // Which tab `items` was fetched for - videos have `slug`, photos have
  // `id`, so rendering `items` under the wrong tab's branch for even one
  // frame (the gap between the tab flipping and the new fetch resolving)
  // means real, differently-shaped objects with mismatched/duplicate keys.
  // Comparing against `tab` directly (rather than clearing `items` in an
  // effect, which only runs after that bad render already happened) keeps
  // the render itself always consistent.
  const [itemsTab, setItemsTab] = useState(tab);
  const visibleItems = itemsTab === tab ? items : [];
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState(null);

  useEffect(() => {
    publicContentAPI.clubs.list().then((res) => setClubs(res.data ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
    setActiveIndex(null);
  }, [tab, clubSlug, athleteId]);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError('');
    const params = { page_size: PAGE_SIZE, page };
    if (athleteId) params.athlete = athleteId;
    else if (clubSlug) params.club = clubSlug;

    const request = tab === 'video' ? publicContentAPI.videos.list(params) : publicContentAPI.gallery.list(params);
    request
      .then((res) => {
        if (!isMounted) return;
        setItems(res.data?.results ?? []);
        setItemsTab(tab);
        setHasNext(Boolean(res.data?.next));
      })
      .catch(() => { if (isMounted) setError('Nu am putut încărca conținutul media.'); })
      .finally(() => { if (isMounted) setLoading(false); });

    return () => { isMounted = false; };
  }, [tab, clubSlug, athleteId, page]);

  function updateParams(patch) {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    setSearchParams(next);
  }

  function setTab(next) {
    updateParams({ tab: next === 'video' ? null : next });
  }

  function setClubFilter(slug) {
    updateParams({ club: slug || null, athlete: null, athleteName: null });
  }

  function setAthleteFilter(athlete) {
    updateParams(athlete
      ? { athlete: String(athlete.id), athleteName: athlete.name, club: null }
      : { athlete: null, athleteName: null });
  }

  async function searchAthletes(query) {
    const { data } = await athleteAPI.list({ q: query, paginate: false });
    return (data || []).map((a) => ({ id: a.id, name: a.full_name }));
  }

  return (
    <div className="flex flex-col">
      <Seo
        title="Media"
        description="Materiale video și poze din activitatea Federației Române de Vovinam Việt Võ Đạo."
        path="/galerie"
      />

      <Breadcrumbs items={[{ label: 'Media' }]} showCurrent />

      <div className="site-full-bleed bg-[#e9ecef]">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:py-16">
          <h1 className="text-fluid-h2 font-display font-bold text-[#00334d]">Media</h1>
        </div>
      </div>

      <div className="flex flex-col gap-6 pt-8">
        <div className="flex flex-wrap items-center gap-3">
          <div role="tablist" className="inline-flex h-11 w-fit items-center justify-center rounded-lg bg-[#e9ecef] p-1.5">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'video'}
              onClick={() => setTab('video')}
              className={`rounded-md px-5 py-2 text-sm font-bold uppercase tracking-wide transition-all ${
                tab === 'video' ? 'bg-white text-[#00334d] shadow-sm' : 'text-muted-foreground hover:text-[#00334d]'
              }`}
            >
              Video
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'poze'}
              onClick={() => setTab('poze')}
              className={`rounded-md px-5 py-2 text-sm font-bold uppercase tracking-wide transition-all ${
                tab === 'poze' ? 'bg-white text-[#00334d] shadow-sm' : 'text-muted-foreground hover:text-[#00334d]'
              }`}
            >
              Poze
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <Select value={clubSlug || ALL_CLUBS} onValueChange={(v) => setClubFilter(v === ALL_CLUBS ? '' : v)}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Toate cluburile" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CLUBS}>Toate cluburile</SelectItem>
                {clubs.map((club) => <SelectItem key={club.id} value={club.slug}>{club.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="w-56">
              <SearchableSelect
                value={athleteId ? { id: athleteId, name: athleteName } : null}
                onChange={setAthleteFilter}
                onSearch={searchAthletes}
                placeholder="Caută sportiv…"
              />
            </div>
            {(clubSlug || athleteId) && (
              <Button type="button" variant="ghost" size="sm" onClick={() => updateParams({ club: null, athlete: null, athleteName: null })}>
                Resetează
              </Button>
            )}
          </div>
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}

        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-video" />)}
          </div>
        ) : visibleItems.length === 0 ? (
          <EmptyState
            title={tab === 'video' ? 'Niciun video' : 'Nicio poză'}
            message="Nu există conținut pentru filtrul selectat."
          />
        ) : tab === 'video' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleItems.map((video, i) => {
              const thumb = videoThumbnail(video);
              return (
                <button
                  key={video.slug}
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  className="group flex flex-col overflow-hidden rounded-lg border border-border bg-white text-left shadow-sm"
                >
                  <div className="relative aspect-video bg-muted">
                    {thumb ? (
                      <img src={thumb} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <PlayCircle className="h-10 w-10 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 transition group-hover:opacity-100">
                      <PlayCircle className="h-12 w-12 text-white drop-shadow" />
                    </div>
                  </div>
                  <p className="line-clamp-2 p-3 text-sm font-medium text-[#00334d]">{video.title}</p>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {visibleItems.map((photo, i) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setActiveIndex(i)}
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
        )}

        {!loading && visibleItems.length > 0 && (page > 1 || hasNext) && (
          <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
            <Button size="sm" variant="outline" disabled={!hasNext} onClick={() => setPage((p) => p + 1)}>Următor</Button>
          </div>
        )}
      </div>

      {activeIndex !== null && tab === 'poze' && (
        <PhotoLightbox photos={visibleItems} index={activeIndex} onClose={() => setActiveIndex(null)} onIndexChange={setActiveIndex} />
      )}
      {activeIndex !== null && tab === 'video' && (
        <VideoLightbox videos={visibleItems} index={activeIndex} onClose={() => setActiveIndex(null)} onIndexChange={setActiveIndex} />
      )}
    </div>
  );
}
