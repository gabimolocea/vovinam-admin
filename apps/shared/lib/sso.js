/** Lightweight cross-app "SSO" for the FRVV suite of separate single-page
 * apps (public-site, the coach/athlete/admin app, ...), each on its
 * own origin/port with its own JWTs in localStorage. A plain link from one
 * app to another doesn't carry a session, since localStorage never crosses
 * origins - so a logged-in user landing on another app looks logged out
 * there.
 *
 * `withSsoHandoff` tacks the current access/refresh tokens onto a
 * cross-app URL as a hash fragment (never sent to any server - only
 * readable by same-origin JS on the page that loads it), and
 * `consumeSsoHandoff` (called once from AuthProvider on mount, before the
 * normal token check) picks them up, stores them under the new origin,
 * and strips the fragment so they don't linger in the visible URL or
 * browser history. Together this makes following one of these links feel
 * like a single continuous session instead of a fresh login. */
export function withSsoHandoff(url) {
  const accessToken = localStorage.getItem('authToken');
  if (!accessToken) return url;
  const refreshToken = localStorage.getItem('refreshToken');
  const params = new URLSearchParams({ sso_at: accessToken });
  if (refreshToken) params.set('sso_rt', refreshToken);
  return `${url}#${params.toString()}`;
}

/** Counterpart to withSsoHandoff for logging out: a handed-off token sits
 * in the OTHER origin's own localStorage (never cleared by this origin's
 * own logout(), since localStorage never crosses origins) and keeps
 * authenticating that origin's own AuthProvider even after the user signs
 * out here - making logout look like it silently did nothing whenever
 * they'd ever followed a withSsoHandoff link before. Tack this onto the
 * post-logout redirect URL so the destination clears its own copy too. */
export function withSsoLogoutSignal(url) {
  return `${url}#sso_logout=1`;
}

export function consumeSsoHandoff() {
  const hash = window.location.hash;
  if (!hash) return;
  const params = new URLSearchParams(hash.slice(1));

  if (params.has('sso_logout')) {
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return;
  }

  if (!hash.includes('sso_at=')) return;
  const accessToken = params.get('sso_at');
  if (!accessToken) return;
  localStorage.setItem('authToken', accessToken);
  const refreshToken = params.get('sso_rt');
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}
