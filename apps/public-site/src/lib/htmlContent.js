/**
 * News content imported from WordPress sometimes embeds the post's photo
 * gallery inline - either as a classic `wp-block-gallery` figure, or (in
 * newer posts) as a `wp-block-group` grid of individual `wp-block-image`
 * figures. The API already exposes those same photos separately via
 * `gallery_images` (rendered with our own gallery + Lightbox), so strip
 * both inline forms before rendering the rich-text body, to avoid showing
 * every photo twice.
 */
export function stripInlineGalleries(html, galleryImages = []) {
  if (!html || typeof window === 'undefined' || !window.DOMParser) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('.wp-block-gallery').forEach((el) => el.remove());

  const galleryBaseNames = new Set(
    galleryImages.map((image) => baseFileName(image.image)).filter(Boolean),
  );
  if (galleryBaseNames.size > 0) {
    doc.querySelectorAll('img').forEach((img) => {
      const base = baseFileName(img.getAttribute('src'));
      if (base && galleryBaseNames.has(base)) {
        (img.closest('figure') || img).remove();
      }
    });
    // WP wraps grouped images in wrapper blocks (group/columns) that are
    // left empty once every image inside them has been stripped - drop
    // those too so they don't render as blank gaps in the article.
    doc.querySelectorAll('.wp-block-group, .wp-block-columns, .wp-block-column').forEach((el) => {
      if (!el.querySelector('img') && !el.textContent.trim()) el.remove();
    });
  }

  return doc.body.innerHTML;
}

// Matches the shared filename between an inline WP image and its
// same-photo gallery counterpart, which differ only by the WP size suffix
// (e.g. "...n-1024x583.jpg" vs ".../gallery/...n-1536x875.jpg").
function baseFileName(url) {
  const filename = url?.split('/').pop()?.split('?')[0];
  return filename ? filename.replace(/-\d+x\d+(?=\.\w+$)/, '') : null;
}
