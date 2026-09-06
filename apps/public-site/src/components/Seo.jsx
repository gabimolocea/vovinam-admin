import { Helmet } from 'react-helmet-async';
import { SITE_NAME, SITE_URL, DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE, absoluteUrl } from '../lib/seo';

/**
 * Per-page SEO tags: <title>, meta description, canonical link, Open
 * Graph + Twitter Card tags, and an optional JSON-LD structured-data
 * block. Every page should render exactly one <Seo> so react-helmet-async
 * can merge/override the default tags declared in index.html.
 *
 * `path` must be the route's pathname (e.g. `/noutati/slug`) so canonical
 * and og:url are built as absolute URLs against SITE_URL - required for
 * both search engines and the build-time meta prerender script (see
 * scripts/prerender-meta.mjs), which computes the exact same URLs from
 * the same route list to write matching static HTML per route.
 */
export default function Seo({
  title,
  description = DEFAULT_DESCRIPTION,
  path = '/',
  image = DEFAULT_OG_IMAGE,
  type = 'website',
  noindex = false,
  jsonLd,
}) {
  const fullTitle = title ? `${title} · ${SITE_NAME}` : SITE_NAME;
  const url = absoluteUrl(path);

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      <meta property="og:locale" content="ro_RO" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {jsonLd && (
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      )}
    </Helmet>
  );
}

// JSON-LD helpers - kept here (not in lib/seo.js) since they're only ever
// consumed by <Seo jsonLd={...}>.
export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsOrganization',
    name: SITE_NAME,
    alternateName: 'FRVV',
    url: SITE_URL,
    logo: DEFAULT_OG_IMAGE,
    sport: 'Vovinam Việt Võ Đạo',
  };
}

export function newsArticleJsonLd(post, path) {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: post.title,
    image: post.featured_image ? [post.featured_image] : undefined,
    datePublished: post.created_at,
    dateModified: post.updated_at || post.created_at,
    author: post.author_name ? { '@type': 'Person', name: post.author_name } : undefined,
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: DEFAULT_OG_IMAGE },
    },
    mainEntityOfPage: absoluteUrl(path),
  };
}

export function sportsEventJsonLd(event, path) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: event.title,
    startDate: event.start_date,
    endDate: event.end_date,
    eventStatus: event.status === 'past' ? 'https://schema.org/EventScheduled' : 'https://schema.org/EventScheduled',
    location: (event.city || event.address)
      ? {
          '@type': 'Place',
          name: event.city || event.address,
          address: event.address || event.city,
        }
      : undefined,
    image: event.featured_image ? [event.featured_image] : undefined,
    organizer: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    url: absoluteUrl(path),
  };
}
