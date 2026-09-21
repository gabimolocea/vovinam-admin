import { describe, it, expect } from 'vitest';
import { suppressPublicLoginRedirect, isPublicLoginRedirectSuppressed } from './logoutRedirect.js';

// The module holds a single module-level flag with no reset function (by
// design - see the comment in logoutRedirect.js: the whole JS context is
// about to be torn down by the navigation these callers trigger anyway).
// Assert the flag's whole lifecycle in one test, in order, rather than
// across independent tests that would each need to reset it.
describe('logoutRedirect', () => {
  it('starts unsuppressed and stays suppressed once set', () => {
    expect(isPublicLoginRedirectSuppressed()).toBe(false);

    suppressPublicLoginRedirect();

    expect(isPublicLoginRedirectSuppressed()).toBe(true);

    // Calling it again is a no-op, not a toggle.
    suppressPublicLoginRedirect();
    expect(isPublicLoginRedirectSuppressed()).toBe(true);
  });
});
