import { describe, it, expect, beforeEach } from 'vitest';
import { withSsoHandoff, withSsoLogoutSignal, consumeSsoHandoff } from './sso.js';

describe('withSsoHandoff', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns the URL unchanged when there is no stored access token', () => {
    expect(withSsoHandoff('http://localhost:5175/')).toBe('http://localhost:5175/');
  });

  it('appends the access (and refresh) token as a URL hash fragment', () => {
    localStorage.setItem('authToken', 'access-123');
    localStorage.setItem('refreshToken', 'refresh-456');

    const result = withSsoHandoff('http://localhost:5175/club');
    const [base, hash] = result.split('#');
    const params = new URLSearchParams(hash);

    expect(base).toBe('http://localhost:5175/club');
    expect(params.get('sso_at')).toBe('access-123');
    expect(params.get('sso_rt')).toBe('refresh-456');
  });

  it('omits sso_rt when there is no stored refresh token', () => {
    localStorage.setItem('authToken', 'access-only');

    const result = withSsoHandoff('http://localhost:5175/');
    const params = new URLSearchParams(result.split('#')[1]);

    expect(params.get('sso_at')).toBe('access-only');
    expect(params.has('sso_rt')).toBe(false);
  });
});

describe('withSsoLogoutSignal', () => {
  it('tacks a sso_logout hash onto the URL', () => {
    expect(withSsoLogoutSignal('http://localhost:5179/cont')).toBe('http://localhost:5179/cont#sso_logout=1');
  });
});

describe('consumeSsoHandoff', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/club');
  });

  it('does nothing when the URL has no hash', () => {
    consumeSsoHandoff();
    expect(localStorage.getItem('authToken')).toBeNull();
  });

  it('stores the handed-off tokens and strips the hash from the URL', () => {
    window.history.replaceState(null, '', '/club#sso_at=handed-off-access&sso_rt=handed-off-refresh');

    consumeSsoHandoff();

    expect(localStorage.getItem('authToken')).toBe('handed-off-access');
    expect(localStorage.getItem('refreshToken')).toBe('handed-off-refresh');
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/club');
  });

  it('stores only the access token when no refresh token was handed off', () => {
    window.history.replaceState(null, '', '/club#sso_at=access-only');

    consumeSsoHandoff();

    expect(localStorage.getItem('authToken')).toBe('access-only');
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('clears stored tokens and strips the hash on a sso_logout signal', () => {
    localStorage.setItem('authToken', 'leftover-access');
    localStorage.setItem('refreshToken', 'leftover-refresh');
    window.history.replaceState(null, '', '/club#sso_logout=1');

    consumeSsoHandoff();

    expect(localStorage.getItem('authToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('ignores an unrelated hash', () => {
    localStorage.setItem('authToken', 'kept');
    window.history.replaceState(null, '', '/club#some-other-anchor');

    consumeSsoHandoff();

    expect(localStorage.getItem('authToken')).toBe('kept');
    expect(window.location.hash).toBe('#some-other-anchor');
  });
});
