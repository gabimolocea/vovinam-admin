import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from './ui';
import { GA_ENABLED, loadAnalytics } from '../lib/analytics';

const STORAGE_KEY = 'cookieConsent';

/** Minimal accept/decline banner gating Google Analytics - shown once per
 * browser until a choice is made, then remembered in localStorage. Only
 * rendered at all when GA is actually configured (GA_ENABLED); nothing to
 * ask consent for otherwise, since the site's other cookies are strictly
 * necessary (auth/CSRF) and don't require it. */
export default function CookieConsentBanner() {
  const [choice, setChoice] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    if (choice === 'accepted') loadAnalytics();
  }, [choice]);

  if (!GA_ENABLED || choice) return null;

  function choose(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Private browsing / storage blocked - the choice just won't persist
      // across reloads, which is an acceptable fallback here.
    }
    setChoice(value);
  }

  return (
    <div className="site-full-bleed fixed inset-x-0 bottom-0 z-50 border-t border-[#0c223d]/10 bg-white shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-3 px-4 py-4 text-sm text-[#00334d] sm:flex-row sm:justify-between">
        <p className="max-w-2xl">
          Folosim cookie-uri strict necesare funcționării site-ului, iar cu acordul tău și cookie-uri de analiză
          (Google Analytics) pentru a înțelege cum este folosit site-ul. Detalii în{' '}
          <Link to="/gdpr" className="font-medium text-brand-red underline">pagina GDPR</Link>.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={() => choose('declined')}>Refuz</Button>
          <Button onClick={() => choose('accepted')}>Accept</Button>
        </div>
      </div>
    </div>
  );
}
