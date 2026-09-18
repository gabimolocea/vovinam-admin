import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../lib/api';
import { consumeSsoHandoff } from '../lib/sso';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }
      const { data } = await authAPI.me();
      setUser(data);
    } catch {
      setUser(null);
      localStorage.removeItem('authToken');
      localStorage.removeItem('refreshToken');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Pick up tokens handed off from another one of our apps (see
    // withSsoHandoff) before checking the normal localStorage token, so a
    // cross-app link lands the user already signed in here too.
    consumeSsoHandoff();
    fetchUser();
  }, [fetchUser]);

  const login = async (email, password) => {
    const { data } = await authAPI.login(email, password);
    const access = data.tokens?.access || data.access || data.token;
    const refresh = data.tokens?.refresh || data.refresh;
    if (access) localStorage.setItem('authToken', access);
    if (refresh) localStorage.setItem('refreshToken', refresh);
    // Always refetch via /auth/me/ instead of trusting the login response's
    // `user` payload: that one is serialized without `profile_completed`
    // (see UserSerializer vs UserProfileSerializer), so using it directly
    // made `profile_completed` look falsy on every login and incorrectly
    // sent already-onboarded athletes back through /onboarding/sportiv.
    await fetchUser();
    return data;
  };

  const register = async ({ email, password, passwordConfirm, termsAccepted }) => {
    const { data } = await authAPI.register({
      email,
      password,
      password_confirm: passwordConfirm ?? password,
      terms_accepted: !!termsAccepted,
    });
    const access = data.tokens?.access || data.access;
    const refresh = data.tokens?.refresh || data.refresh;
    if (access) localStorage.setItem('authToken', access);
    if (refresh) localStorage.setItem('refreshToken', refresh);
    // Same reasoning as login(): fetch the canonical /auth/me/ shape rather
    // than the registration response's `user` payload.
    await fetchUser();
    return data;
  };

  const logout = async () => {
    // Clear local state synchronously, before awaiting anything: a caller
    // that fires logout() and immediately navigates away (see Sidebar.jsx/
    // AthleteDetail.jsx, which do this deliberately to win a race against
    // App.jsx's own unauthenticated redirect) needs this app's own tokens
    // gone *before* the page can be torn down by that navigation - an
    // await up front would let the browser leave mid-flight and skip it.
    const refresh = localStorage.getItem('refreshToken');
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
    try {
      await authAPI.logout(refresh);
    } catch {
      /* ignore */
    }
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    refetchUser: fetchUser,
    isAdmin: user?.role === 'admin' || user?.is_admin === true || user?.is_staff === true || user?.is_superuser === true,
    isCoach: user?.athlete?.is_coach ?? false,
    isAthlete: user?.role === 'athlete',
    isReferee: user?.athlete?.is_referee ?? false,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
