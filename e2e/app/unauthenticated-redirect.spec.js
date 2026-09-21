import { test, expect } from '@playwright/test';

// apps/app has no login form of its own (see apps/app/src/App.jsx's
// RedirectToPublicLogin) - an unauthenticated visitor is bounced, via a
// real cross-origin window.location.replace, to the public site's /cont.
// This is the one behavior in this app that genuinely needs a real browser
// across two real dev servers to verify - a unit test can only assert the
// redirect *would* fire, not that it actually lands on the other app.
test('an unauthenticated visitor lands on / is redirected to the public site login', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());

  await page.goto('/');

  await page.waitForURL('http://localhost:5179/cont');
  await expect(page.getByRole('button', { name: 'Autentificare' })).toBeVisible();
});
