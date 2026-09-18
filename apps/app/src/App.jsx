import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@shared';
import { isPublicLoginRedirectSuppressed } from './lib/logoutRedirect';
import Layout from './components/Layout';
import { RequireAdmin, RequireCoachOrAdmin } from './components/RoleGuards';
import AthleteDetail from './pages/AthleteDetail';
import CreateAthlete from './pages/CreateAthlete';
import CompetitionsList from './pages/CompetitionsList';
import CompetitionCentralizator from './pages/CompetitionCentralizator';
import ClubPage from './pages/ClubPage';
import AdminClubs from './pages/AdminClubs';
import AdminClubEdit from './pages/AdminClubEdit';
import AdminApprovals from './pages/AdminApprovals';
import MyProfile from './pages/MyProfile';
import NotificationsPage from './pages/NotificationsPage';

const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL || 'http://localhost:5179';

/** There's no login form of this app's own anymore - authentication only
 * happens on the public site (/cont), which already sends an approved
 * coach/athlete straight to their own panel (with an SSO token handoff)
 * once logged in. Landing here unauthenticated just bounces out to that
 * one login surface instead of offering a second, separate one. */
function RedirectToPublicLogin() {
  useEffect(() => {
    // An explicit logout (see Sidebar.jsx / AthleteDetail.jsx) navigates
    // away on its own, with a signal the public site needs to clear a
    // token it may have been handed off earlier - suppress this generic
    // redirect during that flow instead of racing it (see logoutRedirect.js).
    if (isPublicLoginRedirectSuppressed()) return;
    window.location.replace(`${PUBLIC_SITE_URL}/cont`);
  }, []);
  return null;
}

/** Landing spot right after the shell mounts: an admin has no athlete
 * profile of their own (confirmed - admin accounts carry no `athlete`
 * record), so they land on the cross-club approvals queue instead of a
 * "my profile" page that wouldn't have anything to show them. */
function RoleIndexRedirect() {
  const { isAdmin } = useAuth();
  return <Navigate to={isAdmin ? '/cluburi' : '/profil'} replace />;
}

export default function App() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      <Route path="/" element={isAuthenticated ? <Layout /> : <RedirectToPublicLogin />}>
        <Route index element={<RoleIndexRedirect />} />
        <Route path="athletes" element={<Navigate to="/club?tab=sportivi" replace />} />
        <Route path="athletes/new" element={<RequireCoachOrAdmin><CreateAthlete /></RequireCoachOrAdmin>} />
        <Route path="athletes/:id" element={<AthleteDetail />} />
        <Route path="competitions" element={<RequireCoachOrAdmin><CompetitionsList /></RequireCoachOrAdmin>} />
        <Route path="competitions/:eventId" element={<RequireCoachOrAdmin><CompetitionCentralizator /></RequireCoachOrAdmin>} />
        <Route path="club" element={<ClubPage />} />
        <Route path="cluburi" element={<RequireAdmin><AdminClubs /></RequireAdmin>} />
        <Route path="cluburi/:id" element={<RequireAdmin><AdminClubEdit /></RequireAdmin>} />
        <Route path="aprobari" element={<RequireAdmin><AdminApprovals /></RequireAdmin>} />
        <Route path="profil" element={<MyProfile />} />
        <Route path="notifications" element={<NotificationsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
