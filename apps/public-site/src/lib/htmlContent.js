/**
 * News content imported from WordPress sometimes embeds the post's photo
 * gallery inline as a `wp-block-gallery` figure. The API already exposes
 * those same photos separately via `gallery_images` (rendered with our own
 * gallery + Lightbox), so strip the inline WP gallery blocks before
 * rendering the rich-text body to avoid showing every photo twice.
 */
export function stripInlineGalleries(html) {
  if (!html || typeof window === 'undefined' || !window.DOMParser) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('.wp-block-gallery').forEach((el) => el.remove());
  return doc.body.innerHTML;
}
