/** Set right before navigating away after an explicit logout (see
 * Sidebar.jsx / AthleteDetail.jsx), so App.jsx's RedirectToPublicLogin
 * doesn't also fire. That component reacts to isAuthenticated flipping to
 * false (which logout() does) by calling its own location.replace(...) to
 * PUBLIC_SITE_URL + '/cont' - a plain URL with no sso_logout hash. Its
 * effect reliably still fires and wins the timing race against an explicit
 * logout's own navigation (React's effect isn't synchronous with the click
 * handler, but it fires before the browser actually commits to whichever
 * navigation was requested first), silently overwriting the intended
 * redirect and dropping the signal that clears the token this session may
 * have handed off to another app (see withSsoLogoutSignal in
 * @shared/lib/sso). A plain module-level flag is enough: the whole JS
 * context is being torn down by the navigation these callers are about to
 * trigger anyway, so there's nothing to reset it for. */
let suppressed = false;

export function suppressPublicLoginRedirect() {
  suppressed = true;
}

export function isPublicLoginRedirectSuppressed() {
  return suppressed;
}
