// Google Analytics 4, loaded only after the visitor accepts the cookie
// banner (see CookieConsentBanner) and only on a real production domain -
// never on localhost/preview/staging hosts, so dev traffic never pollutes
// the real numbers. Configure the property via VITE_GA_MEASUREMENT_ID
// (format "G-XXXXXXXXXX"); the loader is a silent no-op until that's set.
import { IS_NON_PRODUCTION_HOST } from './seo';

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || '';

export const GA_ENABLED = Boolean(MEASUREMENT_ID) && !IS_NON_PRODUCTION_HOST;

let loaded = false;

// Queues onto window.dataLayer - safe to call before the external gtag.js
// script has actually finished loading (that's the whole point of the
// dataLayer queue), so this same function works both to init and to send
// later events/pageviews.
function gtag(...args) {
  window.dataLayer.push(args);
}

/** Injects the gtag.js script and initializes GA4. Safe to call more than
 * once - only does the actual work the first time. Call only after the
 * visitor has given cookie consent. */
export function loadAnalytics() {
  if (!GA_ENABLED || loaded || typeof window === 'undefined') return;
  loaded = true;

  window.dataLayer = window.dataLayer || [];
  gtag('js', new Date());
  // Page views are tracked manually per-route (see trackPageview) since
  // this is a client-side-routed SPA - the initial automatic pageview
  // would otherwise double-count the first page.
  gtag('config', MEASUREMENT_ID, { send_page_view: false });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(script);
}

/** Records a virtual pageview for the given route - call on every route
 * change once analytics has been loaded (a no-op before consent/loading). */
export function trackPageview(path) {
  if (!GA_ENABLED || !loaded || typeof window === 'undefined') return;
  gtag('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}
