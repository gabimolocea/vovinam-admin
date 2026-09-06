#!/usr/bin/env node
// Build-time "meta prerendering": writes a static dist/<route>/index.html
// per route with the correct <title>/meta description/canonical/Open
// Graph/Twitter Card/JSON-LD tags baked into the raw HTML, so crawlers
// that don't execute JavaScript (social media link-preview bots) see
// correct per-page previews.
//
// This is intentionally NOT full server-side rendering: <div id="root">
// is left empty and the same JS bundle (<script type="module" src=...>)
// is kept as-is, so real browsers and Googlebot still hydrate/fetch data
// exactly like the normal SPA. Only the <head> differs per route. This
// avoids hydration-mismatch risk since there is no server-rendered body
// to reconcile against.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fetchAllNews, fetchAllEvents, fetchEventDetail } from './lib/fetch-content.mjs';

const SITE_NAME = 'Federația Română de Vovinam Việt Võ Đạo';
const SITE_URL = (process.env.VITE_SITE_URL || 'https://vovinam.ro').replace(/\/$/, '');
const DEFAULT_DESCRIPTION =
  'Federația Română de Vovinam Việt Võ Đạo (FRVV) - noutăți, competiții, cluburi afiliate, staff, arbitri și materiale video oficiale.';
const DEFAULT_OG_IMAGE = `${SITE_URL}/frvv-logo.png`;
const DIST_DIR = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');

function absoluteUrl(routePath) {
  if (!routePath) return SITE_URL;
  return `${SITE_URL}${routePath.startsWith('/') ? routePath : `/${routePath}`}`;
}

function excerpt(html, maxLength = 160) {
  if (!html) return '';
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&hellip;/g, '…')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&#8212;|&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function organizationJsonLd() {
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

function newsArticleJsonLd(post, routePath) {
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
    mainEntityOfPage: absoluteUrl(routePath),
  };
}

function sportsEventJsonLd(event, routePath) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: event.title,
    startDate: event.start_date,
    endDate: event.end_date,
    eventStatus: 'https://schema.org/EventScheduled',
    location: (event.city || event.address)
      ? { '@type': 'Place', name: event.city || event.address, address: event.address || event.city }
      : undefined,
    image: event.featured_image ? [event.featured_image] : undefined,
    organizer: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    url: absoluteUrl(routePath),
  };
}

function buildStaticRoutes() {
  return [
    { path: '/', title: null, description: DEFAULT_DESCRIPTION, jsonLd: organizationJsonLd() },
    { path: '/noutati', title: 'Noutăți', description: 'Cele mai recente noutăți, comunicate și anunțuri ale Federației Române de Vovinam Việt Võ Đạo.' },
    { path: '/video', title: 'Video', description: 'Materiale video oficiale ale Federației Române de Vovinam Việt Võ Đạo: competiții, seminarii și demonstrații.' },
    { path: '/despre', title: 'Despre noi', description: 'Despre Federația Română de Vovinam Việt Võ Đạo: istorie, misiune și structura federației.' },
    { path: '/competitii', title: 'Competiții și evenimente', description: 'Calendarul competițiilor, examenelor și seminariilor de pregătire organizate de Federația Română de Vovinam Việt Võ Đạo.' },
    { path: '/cluburi', title: 'Cluburi afiliate', description: 'Lista cluburilor sportive afiliate Federației Române de Vovinam Việt Võ Đạo, cu antrenori și localizare.' },
    { path: '/staff', title: 'Staff federație', description: 'Consiliul actual și titlurile de Maestru acordate de Ministerul Sportului în cadrul Federației Române de Vovinam Việt Võ Đạo.' },
    { path: '/arbitri', title: 'Arbitri', description: 'Arbitrii internaționali și naționali acreditați de Federația Română de Vovinam Việt Võ Đạo.' },
    { path: '/regulament', title: 'Regulament', description: 'Regulament - Federația Română de Vovinam Việt Võ Đạo.' },
    { path: '/documente', title: 'Documente', description: 'Documente - Federația Română de Vovinam Việt Võ Đạo.' },
  ];
}

function renderHead(template, { routePath, title, description, image, type, jsonLd }) {
  const fullTitle = title ? `${title} · ${SITE_NAME}` : SITE_NAME;
  const url = absoluteUrl(routePath);
  const desc = description || DEFAULT_DESCRIPTION;
  const img = image || DEFAULT_OG_IMAGE;

  const metaTags = [
    `<meta name="description" content="${escapeHtml(desc)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:type" content="${type || 'website'}" />`,
    `<meta property="og:title" content="${escapeHtml(fullTitle)}" />`,
    `<meta property="og:description" content="${escapeHtml(desc)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta property="og:locale" content="ro_RO" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(fullTitle)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(desc)}" />`,
    `<meta name="twitter:image" content="${img}" />`,
    jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : '',
  ]
    .filter(Boolean)
    .join('\n    ');

  return template
    .replace(/<title>.*<\/title>/, `<title>${escapeHtml(fullTitle)}</title>`)
    .replace('</head>', `    ${metaTags}\n  </head>`);
}

async function writeRoute(template, routePath, meta) {
  const html = renderHead(template, { routePath, ...meta });
  const outDir = routePath === '/' ? DIST_DIR : path.join(DIST_DIR, routePath.replace(/^\//, ''));
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'index.html'), html, 'utf-8');
}

async function main() {
  const template = await readFile(path.join(DIST_DIR, 'index.html'), 'utf-8');
  const [news, events] = await Promise.all([fetchAllNews(), fetchAllEvents()]);

  let count = 0;
  for (const route of buildStaticRoutes()) {
    await writeRoute(template, route.path, route);
    count += 1;
  }

  for (const post of news) {
    const routePath = `/noutati/${post.slug}`;
    await writeRoute(template, routePath, {
      title: post.title,
      description: post.excerpt ? excerpt(post.excerpt) : DEFAULT_DESCRIPTION,
      image: post.featured_image || DEFAULT_OG_IMAGE,
      type: 'article',
      jsonLd: newsArticleJsonLd(post, routePath),
    });
    count += 1;
  }

  for (const eventSummary of events) {
    const event = (await fetchEventDetail(eventSummary.slug)) || eventSummary;
    const routePath = `/competitii/${event.slug}`;
    await writeRoute(template, routePath, {
      title: event.title,
      description: event.description ? excerpt(event.description) : DEFAULT_DESCRIPTION,
      image: event.featured_image || DEFAULT_OG_IMAGE,
      type: 'article',
      jsonLd: sportsEventJsonLd(event, routePath),
    });
    count += 1;
  }

  console.log(`prerender-meta: wrote ${count} route(s)`);
}

main().catch((error) => {
  console.error('prerender-meta failed:', error);
  // Best-effort: don't fail the production build if the API is
  // unreachable at build time (e.g. CI without a running backend).
  process.exit(0);
});
