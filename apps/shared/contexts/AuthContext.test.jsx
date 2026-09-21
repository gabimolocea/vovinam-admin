import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import { authAPI } from '../lib/api.js';

vi.mock('../lib/api.js', () => ({
  authAPI: {
    me: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('../lib/sso.js', () => ({
  consumeSsoHandoff: vi.fn(),
}));

function renderAuth() {
  return renderHook(() => useAuth(), { wrapper: AuthProvider });
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('starts unauthenticated with no stored token, without calling /auth/me/', async () => {
    const { result } = renderAuth();

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(authAPI.me).not.toHaveBeenCalled();
  });

  it('fetches the user when a token is already stored', async () => {
    localStorage.setItem('authToken', 'existing-token');
    authAPI.me.mockResolvedValue({ data: { id: 1, email: 'coach@example.com', role: 'coach' } });

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user.email).toBe('coach@example.com');
  });

  it('clears the token and logs out if /auth/me/ rejects (expired/invalid token)', async () => {
    localStorage.setItem('authToken', 'expired-token');
    authAPI.me.mockRejectedValue(new Error('401'));

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('authToken')).toBeNull();
  });

  describe.each([
    ['role: admin', { role: 'admin' }, { isAdmin: true, isCoach: false, isAthlete: false, isReferee: false }],
    ['is_staff flag', { is_staff: true }, { isAdmin: true, isCoach: false, isAthlete: false, isReferee: false }],
    ['is_superuser flag', { is_superuser: true }, { isAdmin: true, isCoach: false, isAthlete: false, isReferee: false }],
    ['role: athlete', { role: 'athlete' }, { isAdmin: false, isCoach: false, isAthlete: true, isReferee: false }],
    ['athlete.is_coach', { role: 'athlete', athlete: { is_coach: true } }, { isAdmin: false, isCoach: true, isAthlete: true, isReferee: false }],
    ['athlete.is_referee', { role: 'athlete', athlete: { is_referee: true } }, { isAdmin: false, isCoach: false, isAthlete: true, isReferee: true }],
  ])('role derivation for %s', (_label, userShape, expected) => {
    it('derives isAdmin/isCoach/isAthlete/isReferee correctly', async () => {
      localStorage.setItem('authToken', 'token');
      authAPI.me.mockResolvedValue({ data: userShape });

      const { result } = renderAuth();
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.isAdmin).toBe(expected.isAdmin);
      expect(result.current.isCoach).toBe(expected.isCoach);
      expect(result.current.isAthlete).toBe(expected.isAthlete);
      expect(result.current.isReferee).toBe(expected.isReferee);
    });
  });

  it('login() stores tokens from the response and refetches the canonical user via /auth/me/', async () => {
    authAPI.login.mockResolvedValue({
      data: { tokens: { access: 'new-access', refresh: 'new-refresh' }, user: { profile_completed: false } },
    });
    // The canonical /auth/me/ shape is what the context should end up
    // reflecting, not the (differently-serialized) login response's `user`.
    authAPI.me.mockResolvedValue({ data: { id: 2, email: 'a@b.com', role: 'athlete', profile_completed: true } });

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login('a@b.com', 'secret');
    });

    expect(localStorage.getItem('authToken')).toBe('new-access');
    expect(localStorage.getItem('refreshToken')).toBe('new-refresh');
    expect(result.current.user.profile_completed).toBe(true);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('logout() clears storage and user state synchronously, even while the API call is pending', async () => {
    localStorage.setItem('authToken', 'token');
    localStorage.setItem('refreshToken', 'refresh');
    authAPI.me.mockResolvedValue({ data: { id: 1, role: 'admin' } });
    let resolveLogout;
    authAPI.logout.mockReturnValue(new Promise((resolve) => { resolveLogout = resolve; }));

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    let logoutPromise;
    act(() => {
      logoutPromise = result.current.logout();
    });

    // Storage/user are cleared before the network call resolves.
    expect(localStorage.getItem('authToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(result.current.user).toBeNull();

    resolveLogout({ data: {} });
    await act(async () => {
      await logoutPromise;
    });
  });

  it('logout() swallows a failing API call instead of throwing', async () => {
    localStorage.setItem('authToken', 'token');
    authAPI.me.mockResolvedValue({ data: { id: 1, role: 'admin' } });
    authAPI.logout.mockRejectedValue(new Error('network down'));

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await expect(act(async () => {
      await result.current.logout();
    })).resolves.not.toThrow();
  });
});
