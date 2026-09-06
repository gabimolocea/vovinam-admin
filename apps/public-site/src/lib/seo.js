// Central SEO constants + helpers shared by every page's <Seo> usage.
// SITE_URL is the canonical production domain used to build absolute URLs
// for canonical links, Open Graph `og:url`/`og:image`, and JSON-LD `@id`s.
// Override via VITE_SITE_URL when deploying to a different domain/staging
// environment so canonical/OG tags don't point at vovinam.ro from a preview.
export const SITE_NAME = 'Federația Română de Vovinam Việt Võ Đạo';
export const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://vovinam.ro').replace(/\/$/, '');
export const DEFAULT_DESCRIPTION =
  'Federația Română de Vovinam Việt Võ Đạo (FRVV) - noutăți, competiții, cluburi afiliate, staff, arbitri și materiale video oficiale.';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/frvv-logo.png`;

export function absoluteUrl(path = '/') {
  if (!path) return SITE_URL;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

// Strips HTML tags and collapses whitespace, then truncates to a safe meta
// description length - used to turn rich-text `content`/`description` HTML
// fields (news posts, events) into a plain-text excerpt for <meta
// name="description"> and og:description.
export function excerpt(html, maxLength = 160) {
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
