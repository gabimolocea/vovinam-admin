import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@shared';
import Layout from './components/Layout';
import MyProfile from './pages/MyProfile';
import NotificationsPage from './pages/NotificationsPage';

const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL || 'http://localhost:5183';

/** There's no login form of this app's own anymore - authentication only
 * happens on the public site (/cont), which already sends an approved
 * athlete/coach straight to their own panel (with an SSO token handoff)
 * once logged in. Landing here unauthenticated just bounces out to that
 * one login surface instead of offering a second, separate one. */
function RedirectToPublicLogin() {
  useEffect(() => {
    window.location.replace(`${PUBLIC_SITE_URL}/cont`);
  }, []);
  return null;
}

export default function App() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      <Route path="/" element={isAuthenticated ? <Layout /> : <RedirectToPublicLogin />}>
        <Route index element={<Navigate to="/profile" replace />} />
        <Route path="profile" element={<MyProfile />} />
        <Route path="notifications" element={<NotificationsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
