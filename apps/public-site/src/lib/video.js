/**
 * Converts a YouTube or Vimeo watch/share URL into an embeddable iframe URL.
 * Falls back to the original URL if the host isn't recognized (rare, since
 * publishers are expected to paste a YouTube/Vimeo link - see Video model).
 */
export function toEmbedUrl(url) {
  if (!url) return '';

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const videoId = parsed.searchParams.get('v');
      if (videoId) return `https://www.youtube.com/embed/${videoId}`;
      const shortsMatch = parsed.pathname.match(/\/shorts\/([^/]+)/);
      if (shortsMatch) return `https://www.youtube.com/embed/${shortsMatch[1]}`;
    }

    if (host === 'youtu.be') {
      const videoId = parsed.pathname.replace('/', '');
      if (videoId) return `https://www.youtube.com/embed/${videoId}`;
    }

    if (host === 'vimeo.com') {
      const videoId = parsed.pathname.split('/').filter(Boolean).pop();
      if (videoId) return `https://player.vimeo.com/video/${videoId}`;
    }
  } catch {
    return url;
  }

  return url;
}
