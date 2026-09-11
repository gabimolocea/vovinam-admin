import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { publicContentAPI } from '@shared/lib/api';
import { Alert, EmptyState, Skeleton } from '../components/ui';
import NewsCard from '../components/NewsCard';
import Seo from '../components/Seo';
import Breadcrumbs from '../components/Breadcrumbs';
import { stripInlineGalleries } from '../lib/htmlContent';

// Matches PublicContentPagination.page_size in backend/api/views/public_content.py -
// the API response doesn't echo the page size back, so it's mirrored here to
// compute the total page count for the numbered pagination control.
const PAGE_SIZE = 12;

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
}

// News posts don't have a real "category" field, only a freeform
// comma-separated `tags` string - use the first tag as the category shown
// on the featured post's image, same convention used elsewhere on the site.
function primaryCategory(post) {
  return post.tags?.split(',')[0]?.trim() || '';
}

// Builds a compact page-number list with "…" gaps, e.g. [1, '…', 4, 5, 6, '…', 12].
function buildPageList(current, total) {
  const pages = [];
  for (let i = 1; i <= total; i += 1) {
    if (i === 1 || i === total || Math.abs(i - current) <= 1) pages.push(i);
  }
  const withGaps = [];
  let previous;
  for (const p of pages) {
    if (previous !== undefined && p - previous > 1) withGaps.push('…');
    withGaps.push(p);
    previous = p;
  }
  return withGaps;
}

function Pagination({ page, totalPages, onNavigate }) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-6">
        <span className="h-px flex-1 bg-[#edb654]" aria-hidden="true" />
        <p className="shrink-0 text-sm font-semibold uppercase tracking-wide text-[#00334d]">
          Pagina {page} din {totalPages}
        </p>
        <span className="h-px flex-1 bg-[#edb654]" aria-hidden="true" />
      </div>
      <nav className="flex flex-wrap items-center justify-center gap-2" aria-label="Paginare noutăți">
        <button
          type="button"
          onClick={() => onNavigate(page - 1)}
          disabled={page <= 1}
          aria-label="Pagina anterioară"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-[#00334d] transition hover:bg-[#e9ecef] disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {buildPageList(page, totalPages).map((p, index) =>
          p === '…' ? (
            <span key={`gap-${index}`} className="flex h-10 w-10 items-center justify-center text-sm text-[#00334d]/60">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onNavigate(p)}
              aria-current={p === page ? 'page' : undefined}
              className={`flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold transition ${
                p === page ? 'bg-[#0a4c75] text-white' : 'text-[#00334d] hover:bg-[#e9ecef]'
              }`}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onNavigate(page + 1)}
          disabled={page >= totalPages}
          aria-label="Pagina următoare"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-[#00334d] transition hover:bg-[#e9ecef] disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </nav>
    </div>
  );
}

export default function NewsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tagFilter = searchParams.get('tag') || '';
  const page = Number(searchParams.get('page') || '1');

  const [news, setNews] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await publicContentAPI.news.list({
          page,
          tags: tagFilter || undefined,
        });
        if (!isMounted) return;
        setNews(response.data?.results ?? []);
        setCount(response.data?.count ?? 0);
      } catch {
        if (!isMounted) return;
        setError('Nu am putut încărca lista de noutăți.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [page, tagFilter]);

  // The newest post gets the large "featured" treatment up top - only on
  // the first, unfiltered page (that's the only page where "newest" is
  // actually true), and it's then excluded from the grid below so it
  // never appears twice.
  const showFeatured = page === 1 && !tagFilter && news.length > 0;
  const featuredPost = showFeatured ? news[0] : null;
  const gridPosts = useMemo(() => (featuredPost ? news.slice(1) : news), [featuredPost, news]);
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  function goToPage(nextPage) {
    setSearchParams({ ...(tagFilter ? { tag: tagFilter } : {}), page: String(nextPage) });
  }

  return (
    <div className="flex flex-col">
      <Seo
        title="Noutăți"
        description="Cele mai recente noutăți, comunicate și anunțuri ale Federației Române de Vovinam Việt Võ Đạo."
        path="/noutati"
      />
      <div className="site-full-bleed relative flex flex-col items-center overflow-hidden pb-24 sm:pb-28">
        <img src="/events-section-bg.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(12,33,61,0.6) 0%, rgba(12,33,61,0.68) 100%)' }}
        />
        <Breadcrumbs items={[{ label: 'Noutăți' }]} showCurrent overlay />
        <div className="relative mx-auto mt-8 w-full max-w-7xl px-4 sm:mt-10">
          <h1 className="text-fluid-display font-display font-bold text-white">Ultimele Noutăți</h1>
        </div>
      </div>

      <div className="flex flex-col gap-8">
      {error && <Alert variant="destructive" className="mt-8">{error}</Alert>}

      {loading ? (
        <div className="mt-8 flex flex-col gap-8">
          <Skeleton className="h-80 w-full" />
          <div className="grid gap-4 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-80" />)}
          </div>
        </div>
      ) : news.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Nicio noutate găsită" message={tagFilter ? `Nu există noutăți cu eticheta „${tagFilter}”.` : 'Reveniți mai târziu.'} />
        </div>
      ) : (
        <>
          {featuredPost && (
            <div className="site-full-bleed relative z-10 -mt-10 px-4 sm:-mt-14">
              <div className="mx-auto w-full max-w-7xl">
                <Link
                  to={`/noutati/${featuredPost.slug}`}
                  className="group flex flex-col gap-6 rounded-2xl bg-[#e9ecef] p-6 transition-shadow duration-200 hover:shadow-lg sm:p-10 lg:flex-row lg:items-center lg:gap-10"
                >
                  <div className="flex flex-1 flex-col gap-4">
                    <p className="text-sm uppercase text-[#00334d]">{formatDate(featuredPost.created_at)}</p>
                    <h2 className="text-fluid-h2 font-display font-bold text-[#00334d] transition-colors group-hover:text-[#0a4c75]">
                      {featuredPost.title}
                    </h2>
                    {featuredPost.excerpt && (
                      <div
                        className="line-clamp-3 text-base text-[#00334d]/80 [&_p]:inline"
                        dangerouslySetInnerHTML={{ __html: stripInlineGalleries(featuredPost.excerpt) }}
                      />
                    )}
                    <span className="text-fluid-button inline-flex w-fit items-center gap-2 font-bold uppercase text-[#00334d]">
                      Citește mai mult
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="relative order-first aspect-[640/360] w-full shrink-0 overflow-hidden rounded-lg bg-[#b1b1b1] lg:order-none lg:w-[45%]">
                    {featuredPost.featured_image && (
                      <img
                        src={featuredPost.featured_image}
                        alt={featuredPost.featured_image_alt || featuredPost.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    )}
                    {primaryCategory(featuredPost) && (
                      <span className="absolute left-2 top-2 rounded bg-[#edb654]/60 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[#00334d]">
                        {primaryCategory(featuredPost)}
                      </span>
                    )}
                  </div>
                </Link>
              </div>
            </div>
          )}

          <div className={`flex flex-col gap-6 ${featuredPost ? '' : 'mt-8'}`}>
            <div className="flex items-center gap-6">
              <h2 className="text-fluid-h2 font-display shrink-0 font-bold text-[#00334d]">Articole</h2>
              <span className="h-px flex-1 bg-[#edb654]" aria-hidden="true" />
            </div>

            {gridPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nu mai sunt alte noutăți momentan.</p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                {gridPosts.map((post) => <NewsCard key={post.slug} post={post} />)}
              </div>
            )}
          </div>

          <Pagination page={page} totalPages={totalPages} onNavigate={goToPage} />
        </>
      )}
      </div>
    </div>
  );
}
