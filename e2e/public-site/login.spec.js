import { test, expect } from '@playwright/test';

// The public site (/cont) is the FRVV suite's only login surface - every
// other app bounces an unauthenticated visitor here (see
// e2e/app/unauthenticated-redirect.spec.js). No real Django backend is
// needed: /api/auth/* is mocked at the network layer.
test.describe('Public site login (/cont)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
  });

  test('successful login moves the visitor out of the login form', async ({ page }) => {
    await page.route('**/api/auth/login/', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tokens: { access: 'test-access-token', refresh: 'test-refresh-token' } }),
    }));
    await page.route('**/api/auth/me/', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 1, email: 'sportiv@example.com', role: 'athlete', profile_completed: true }),
    }));

    await page.goto('/cont');
    await page.getByLabel('Introdu adresa de email', { exact: false }).fill('sportiv@example.com');
    await page.getByLabel('Parolă', { exact: false }).fill('parola-secreta');
    await page.getByRole('button', { name: 'Autentificare' }).click();

    // The login form (email/password fields) is gone once the account
    // context flips to authenticated and AccountPage swaps in OnboardingPage.
    await expect(page.getByLabel('Introdu adresa de email', { exact: false })).toHaveCount(0);
  });

  test('shows a server-provided error message on invalid credentials', async ({ page }) => {
    await page.route('**/api/auth/login/', (route) => route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Email sau parolă incorectă.' }),
    }));

    await page.goto('/cont');
    await page.getByLabel('Introdu adresa de email', { exact: false }).fill('gresit@example.com');
    await page.getByLabel('Parolă', { exact: false }).fill('parola-gresita');
    await page.getByRole('button', { name: 'Autentificare' }).click();

    await expect(page.getByText('Email sau parolă incorectă.')).toBeVisible();
    // And it stayed on the login form.
    await expect(page.getByLabel('Introdu adresa de email', { exact: false })).toBeVisible();
  });
});
