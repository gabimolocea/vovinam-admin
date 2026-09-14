#!/usr/bin/env node
// Generates dist/sitemap.xml after `vite build`, combining the static
// routes (see apps/public-site/src/App.jsx) with dynamic news/event slugs
// fetched from the Django public API.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fetchAllNews, fetchAllEvents, fetchAllClubs } from './lib/fetch-content.mjs';

const SITE_URL = (process.env.VITE_SITE_URL || 'https://vovinam.ro').replace(/\/$/, '');
const DIST_DIR = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');

// Kept in sync with the routes declared in src/App.jsx.
const STATIC_ROUTES = [
  '/',
  '/noutati',
  '/galerie',
  '/despre',
  '/calendar',
  '/competitie',
  '/cluburi',
  '/sportivi',
  '/staff',
  '/arbitri',
  '/regulament',
  '/documente',
  '/termeni-si-conditii',
  '/confidentialitate',
  '/gdpr',
];

function urlEntry(loc, lastmod) {
  return [
    '  <url>',
    `    <loc>${SITE_URL}${loc}</loc>`,
    lastmod ? `    <lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : null,
    '  </url>',
  ]
    .filter(Boolean)
    .join('\n');
}

async function main() {
  const [news, events, clubs] = await Promise.all([fetchAllNews(), fetchAllEvents(), fetchAllClubs()]);

  const entries = [
    ...STATIC_ROUTES.map((route) => urlEntry(route)),
    ...news.map((post) => urlEntry(`/noutati/${post.slug}`, post.updated_at || post.created_at)),
    ...events.map((event) => urlEntry(`/calendar/${event.slug}`, event.updated_at || event.start_date)),
    ...clubs.map((club) => urlEntry(`/cluburi/${club.slug}`)),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;

  await writeFile(path.join(DIST_DIR, 'sitemap.xml'), xml, 'utf-8');
  console.log(`sitemap.xml written with ${entries.length} URLs`);
}

main().catch((error) => {
  console.error('generate-sitemap failed:', error);
  // Don't fail the whole production build if the API is unreachable at
  // build time (e.g. CI without a running backend) - sitemap is best-effort.
  process.exit(0);
});
