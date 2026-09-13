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

/** Extracts the raw YouTube video id from a watch/shorts/share URL, or null
 * for anything else (Vimeo, unrecognized hosts) - used to build a static
 * thumbnail (img.youtube.com/vi/<id>/...) for click-to-play video cards. */
export function getYouTubeId(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const videoId = parsed.searchParams.get('v');
      if (videoId) return videoId;
      const shortsMatch = parsed.pathname.match(/\/shorts\/([^/]+)/);
      if (shortsMatch) return shortsMatch[1];
    }

    if (host === 'youtu.be') {
      return parsed.pathname.replace('/', '') || null;
    }
  } catch {
    return null;
  }

  return null;
}
