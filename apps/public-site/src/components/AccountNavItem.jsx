import { Link } from 'react-router-dom';
import { useAuth } from '@shared';
import { User } from 'lucide-react';

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

/** Desktop utility-bar "Cont" nav item - a plain link to /cont, always
 * (signed in or out). Everything that used to live in a dropdown (profile,
 * coach panel, approvals, settings, logout) is now on the /cont page
 * itself as shortcut cards, so this is just an entry point - no menu, no
 * submenu state. Mobile has its own persistent account icon in Layout.jsx's
 * closed-state top bar, so it doesn't render this component at all. */
export default function AccountNavItem() {
  const { isAuthenticated, user } = useAuth();

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
