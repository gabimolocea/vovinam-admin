import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('API_BASE_URL / MEDIA_BASE_URL derivation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('derives the API host from the current page (LAN venue-server pattern) when VITE_API_BASE_URL is unset', async () => {
    // jsdom's default test origin is http://localhost/
    const { API_BASE_URL, MEDIA_BASE_URL } = await import('./api.js');
    expect(API_BASE_URL).toBe('http://localhost:8000/api');
    expect(MEDIA_BASE_URL).toBe('http://localhost:8000');
  });

  it('lets an explicit VITE_API_BASE_URL override the derived host', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.vovinam.ro/api');
    const { API_BASE_URL, MEDIA_BASE_URL } = await import('./api.js');
    expect(API_BASE_URL).toBe('https://api.vovinam.ro/api');
    expect(MEDIA_BASE_URL).toBe('https://api.vovinam.ro');
  });

  it('strips a trailing slash after /api when deriving MEDIA_BASE_URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.vovinam.ro/api/');
    const { MEDIA_BASE_URL } = await import('./api.js');
    expect(MEDIA_BASE_URL).toBe('https://api.vovinam.ro');
  });
});

describe('api axios instance interceptors', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('attaches the stored JWT as a Bearer Authorization header', async () => {
    const { default: api } = await import('./api.js');
    localStorage.setItem('authToken', 'my-token');

    const requestInterceptor = api.interceptors.request.handlers[0];
    const config = await requestInterceptor.fulfilled({ headers: {} });

    expect(config.headers.Authorization).toBe('Bearer my-token');
  });

  it('does not set an Authorization header when there is no stored token', async () => {
    const { default: api } = await import('./api.js');

    const requestInterceptor = api.interceptors.request.handlers[0];
    const config = await requestInterceptor.fulfilled({ headers: {} });

    expect(config.headers.Authorization).toBeUndefined();
  });

  it('clears stored tokens on a 401 response and rejects with the original error', async () => {
    const { default: api } = await import('./api.js');
    localStorage.setItem('authToken', 'stale-token');
    localStorage.setItem('refreshToken', 'stale-refresh');

    const responseInterceptor = api.interceptors.response.handlers[0];
    const error = { response: { status: 401 } };

    await expect(responseInterceptor.rejected(error)).rejects.toBe(error);
    expect(localStorage.getItem('authToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('leaves stored tokens alone on a non-401 error', async () => {
    const { default: api } = await import('./api.js');
    localStorage.setItem('authToken', 'still-valid');

    const responseInterceptor = api.interceptors.response.handlers[0];
    const error = { response: { status: 500 } };

    await expect(responseInterceptor.rejected(error)).rejects.toBe(error);
    expect(localStorage.getItem('authToken')).toBe('still-valid');
  });
});
