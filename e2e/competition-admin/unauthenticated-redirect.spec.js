import { test, expect } from '@playwright/test';

// Unlike apps/app, competition-admin has its own /login route (an admin-only
// tool, used LAN-side at competitions) - @shared's ProtectedRoute redirects
// an unauthenticated visitor there in-app via react-router, rather than
// bouncing out to another origin. Real-browser routing is what's actually
// being verified here, not just the guard component in isolation (already
// unit-tested in apps/shared/components/ProtectedRoute.test.jsx).
test.describe('competition-admin auth guard', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
  });

  test('an unauthenticated visitor is redirected in-app to /login', async ({ page }) => {
    await page.goto('/competitions');

    await page.waitForURL('**/login');
    await expect(page.getByRole('heading', { name: 'Administrare competiții' })).toBeVisible();
  });

  test('shows a server-provided error on an invalid login attempt', async ({ page }) => {
    await page.route('**/api/auth/login/', (route) => route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Email sau parolă incorectă.' }),
    }));

    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill('gresit@example.com');
    await page.getByLabel('Parolă', { exact: true }).fill('parola-gresita');
    await page.getByRole('button', { name: 'Autentificare' }).click();

    await expect(page.getByRole('alert')).toHaveText('Email sau parolă incorectă.');
    // Still on /login - no redirect happened on a failed attempt.
    await expect(page).toHaveURL(/\/login$/);
  });
});
