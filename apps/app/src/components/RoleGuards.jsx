import { Navigate } from 'react-router-dom';
import { useAuth } from '@shared';

/** Role gates for routes inside this already-authenticated app (the root
 * route in App.jsx already handles the unauthenticated case by bouncing
 * out to the public site - these only run once a user is signed in).
 * Not reusing apps/shared's ProtectedRoute: that component redirects to
 * `/login` (a route this app doesn't have) and checks `user.role` directly,
 * but "coach" isn't a role value here - it's `athlete.is_coach` - so a
 * small local guard keyed off useAuth()'s derived isAdmin/isCoach booleans
 * is simpler than adapting the shared one (which competition-admin and
 * athlete-enrollment still rely on as-is). */
export function RequireAdmin({ children }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/" replace />;
}

export function RequireCoach({ children }) {
  const { isCoach } = useAuth();
  return isCoach ? children : <Navigate to="/" replace />;
}

/** For pages a coach can edit and an admin can view read-only - e.g. the
 * competition centralizator (CompetitionCentralizator.jsx already branches
 * its own rendering on myClubId being null vs set to tell the two apart). */
export function RequireCoachOrAdmin({ children }) {
  const { isCoach, isAdmin } = useAuth();
  return isCoach || isAdmin ? children : <Navigate to="/" replace />;
}
