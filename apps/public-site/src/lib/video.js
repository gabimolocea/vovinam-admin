// Incorporarea YouTube trece prin `youtube-nocookie.com`, nu prin
// `youtube.com`. E acelasi player, servit de YouTube in modul fara urmarire:
// nu pune cookie-uri de publicitate pana cand omul nu apasa play.
//
// Doua motive. Primul e al oamenilor din poze: site-ul federatiei e vizitat
// si de copii si de parintii lor, iar un vizitator care doar deruleaza
// pagina nu trebuie sa plece de acolo cu identificatori de publicitate.
// Al doilea e practic: domeniul asta e taiat mult mai rar de extensiile
// care blocheaza reclame, iar cand sunt taiate cererile de urmarire,
// playerul se opreste cu erori care par defecte ale site-ului.
const YOUTUBE_EMBED = 'https://www.youtube-nocookie.com/embed';

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
      if (videoId) return `${YOUTUBE_EMBED}/${videoId}`;
      const shortsMatch = parsed.pathname.match(/\/shorts\/([^/]+)/);
      if (shortsMatch) return `${YOUTUBE_EMBED}/${shortsMatch[1]}`;
    }

    if (host === 'youtu.be') {
      const videoId = parsed.pathname.replace('/', '');
      if (videoId) return `${YOUTUBE_EMBED}/${videoId}`;
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
