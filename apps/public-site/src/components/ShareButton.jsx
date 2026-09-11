import { useState } from 'react';
import { Share2 } from 'lucide-react';

/** Copies the current page URL to the clipboard (or opens the native share
 * sheet where supported) - there's no backend "share" feature, this is
 * just a client-side convenience. Shared between the news and event
 * detail pages. */
export default function ShareButton({ title }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // user cancelled the share sheet - nothing to do
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable - silently ignore
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="inline-flex items-center gap-2 rounded-lg border border-[#dce0e5] px-4 py-2 text-sm font-medium text-[#00334d] transition hover:bg-[#e9ecef]"
    >
      <Share2 className="h-4 w-4" />
      {copied ? 'Link copiat!' : 'Distribuie'}
    </button>
  );
}
