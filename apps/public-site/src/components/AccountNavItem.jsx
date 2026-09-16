import { Link } from 'react-router-dom';
import { useAuth } from '@shared';
import { withSsoHandoff } from '@shared/lib/sso';
import { User } from 'lucide-react';

// The coach/athlete/admin dashboard is one app (role-based views), not two
// separate ones - see apps/app. Both roles link to the same URL here, only
// the label differs.
export const APP_URL = import.meta.env.VITE_APP_URL || 'http://localhost:5175';

/** True only once the dashboard app's real URL is configured at build time.
 * Until then it isn't deployed anywhere reachable, so the localhost
 * fallback above must never be linked to from production. */
export const DASHBOARDS_DEPLOYED = Boolean(import.meta.env.VITE_APP_URL);

/** True once an athlete's coach flag has cleared approval - the point at
 * which account management moves to the coach dashboard and drops off the
 * public site. Mirrors OnboardingPage.jsx's isApprovedCoach(). */
export function isApprovedCoach(user) {
  return user?.role !== 'supporter' && !!user?.athlete?.is_coach && user?.athlete?.status === 'approved';
}

/** True for any other approved athlete (not a coach - those go to the coach
 * dashboard instead) - account management for them moves to the athlete
 * dashboard, same idea as isApprovedCoach() above. */
export function isApprovedAthlete(user) {
  return user?.role !== 'supporter' && !!user?.athlete && user.athlete.status === 'approved' && !user.athlete.is_coach;
}

/** Small circular avatar - the athlete's profile photo when set, otherwise
 * a plain person icon in a tinted circle. Also used by Layout.jsx for the
 * mobile closed-state top bar icon. */
export function AccountAvatar({ user, size = 'h-6 w-6' }) {
  const profileImage = user?.athlete?.profile_image;
  if (profileImage) {
    return <img src={profileImage} alt="" className={`${size} rounded-full object-cover`} />;
  }
  return (
    <span className={`flex ${size} items-center justify-center rounded-full bg-white/20`}>
      <User className="h-3.5 w-3.5" fill="currentColor" />
    </span>
  );
}

/** Desktop utility-bar "Cont" nav item - a plain link to /cont for anyone
 * signed in or out, except an approved coach, who goes straight to the
 * coach dashboard instead: their account management lives entirely there
 * now, so /cont has nothing for them. Everything that used to live in a
 * dropdown (profile, coach panel, approvals, settings, logout) is now on
 * the /cont page itself as shortcut cards, so this is just an entry point -
 * no menu, no submenu state. Mobile has its own persistent account icon in
 * Layout.jsx's closed-state top bar, so it doesn't render this component
 * at all. */
export default function AccountNavItem() {
  const { isAuthenticated, user } = useAuth();

  if (isAuthenticated && DASHBOARDS_DEPLOYED && isApprovedCoach(user)) {
    return (
      <a href={withSsoHandoff(APP_URL)} className="site-utility-link inline-flex items-center gap-1.5">
        <AccountAvatar user={user} />
        Panou antrenor
      </a>
    );
  }

  if (isAuthenticated && DASHBOARDS_DEPLOYED && isApprovedAthlete(user)) {
    return (
      <a href={withSsoHandoff(APP_URL)} className="site-utility-link inline-flex items-center gap-1.5">
        <AccountAvatar user={user} />
        Panou sportiv
      </a>
    );
  }

  if (isAuthenticated) {
    return (
      <Link to="/cont" className="site-utility-link inline-flex items-center gap-1.5">
        <AccountAvatar user={user} />
        {user?.athlete?.first_name || 'Contul meu'}
      </Link>
    );
  }

  return (
    <Link to="/cont" className="site-utility-link inline-flex items-center gap-1.5">
      <User className="h-3.5 w-3.5" fill="currentColor" />
      Contul meu
    </Link>
  );
}
