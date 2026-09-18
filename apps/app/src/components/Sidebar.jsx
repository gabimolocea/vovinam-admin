import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth, notificationAPI } from '@shared';
import { clubAPI, MEDIA_BASE_URL } from '@shared/lib/api';
import { withSsoHandoff } from '@shared/lib/sso';
import Logo from '@shared/components/Logo';
import { Trophy, Building2, User, Bell, LogOut, ExternalLink, ShieldCheck } from 'lucide-react';

const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL || 'http://localhost:5183';
const COMPETITION_ADMIN_URL = import.meta.env.VITE_COMPETITION_ADMIN_URL || 'http://localhost:5191';
const POLL_INTERVAL_MS = 60000;

function imgUrl(path) {
  if (!path) return null;
  if (String(path).startsWith('http')) return path;
  return `${MEDIA_BASE_URL}${String(path).startsWith('/') ? '' : '/'}${path}`;
}

/** Nav items differ by role: an admin manages the whole federation (no
 * athlete profile of their own), a coach also has a club roster and
 * competitions, a plain athlete only has their own profile. Competition
 * operation itself (brackets, live scoring, sync) stays in the separate
 * competition-admin app - "Competiții" for an admin just links out to it
 * rather than duplicating it here. */
function useNavItems({ isAdmin, isCoach }) {
  if (isAdmin) {
    return [
      { to: '/cluburi', label: 'Cluburi', icon: Building2 },
      { to: '/aprobari', label: 'Aprobări', icon: ShieldCheck, badgeKey: 'approvals' },
      { to: '/competitions', label: 'Centralizator', icon: Trophy },
    ];
  }
  if (isCoach) {
    return [
      { to: '/profil', label: 'Profil', icon: User },
      { to: '/club', label: 'Club', icon: Building2 },
      { to: '/competitions', label: 'Competiții', icon: Trophy },
      { to: '/notifications', label: 'Notificări', icon: Bell, badgeKey: 'notifications' },
    ];
  }
  return [
    { to: '/profil', label: 'Profil', icon: User },
    { to: '/club', label: 'Club', icon: Building2 },
    { to: '/notifications', label: 'Notificări', icon: Bell, badgeKey: 'notifications' },
  ];
}

function useUnreadCount() {
  const { isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let isMounted = true;
    async function refreshCount() {
      try {
        const response = await notificationAPI.unreadCount();
        if (isMounted) setUnreadCount(response.data.unread_count);
      } catch {
        // silent - the badge just won't update this cycle
      }
    }
    refreshCount();
    const interval = setInterval(refreshCount, POLL_INTERVAL_MS);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  return unreadCount;
}

/** A coach's own club emblem, shown at the top of the sidebar instead of
 * the federation logo (which now only appears next to "Vezi site-ul"). */
function useClubLogo(clubId) {
  const [club, setClub] = useState(null);

  useEffect(() => {
    if (!clubId) return;
    clubAPI.get(clubId).then((r) => setClub(r.data)).catch(() => {});
  }, [clubId]);

  return club;
}

function NavLinks({ navItems, onNavigate }) {
  const unreadCount = useUnreadCount();

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
      {navItems.map(({ to, label, icon: Icon, end, badgeKey }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-md px-3 py-2 text-base font-bold uppercase tracking-wide transition-colors ${
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/80 hover:bg-white/5 hover:text-sidebar-foreground'
            }`
          }
        >
          <Icon className="h-5 w-5 shrink-0" />
          {label}
          {badgeKey === 'notifications' && unreadCount > 0 && (
            <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </NavLink>
      ))}
      {navItems.some((item) => item.to === '/cluburi') && (
        <a
          href={COMPETITION_ADMIN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-base font-bold uppercase tracking-wide text-sidebar-foreground/80 transition-colors hover:bg-white/5 hover:text-sidebar-foreground"
        >
          <Trophy className="h-5 w-5 shrink-0" />
          Competiții
          <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0" />
        </a>
      )}
    </nav>
  );
}

/** Fixed tab bar on mobile/tablet (below `lg`) - icon + label, the role's
 * own nav items, plus a trailing direct link out to the public site (no
 * more drawer/overflow menu - a coach/athlete's "Deconectare" lives on
 * their own profile page's hero instead, see AthleteDetail.jsx). An admin
 * has no athlete profile of their own to ever land on that hero, and the
 * desktop sidebar's own logout button is hidden below `lg` - so without
 * this, an admin on mobile/tablet would have no way to log out at all. */
function BottomNav({ navItems, isAdmin }) {
  const { logout } = useAuth();
  const unreadCount = useUnreadCount();

  async function handleLogout() {
    await logout();
    window.location.href = PUBLIC_SITE_URL;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[60] flex items-stretch border-t border-sidebar-border bg-sidebar text-sidebar-foreground lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Navigație principală"
    >
      {navItems.map(({ to, label, icon: Icon, end, badgeKey }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `relative flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-bold uppercase tracking-wide transition-colors ${
              isActive ? 'text-sidebar-accent' : 'text-sidebar-foreground/70 hover:text-sidebar-foreground'
            }`
          }
        >
          <Icon className="h-5 w-5 shrink-0" />
          <span className="truncate">{label}</span>
          {badgeKey === 'notifications' && unreadCount > 0 && (
            <span className="absolute right-1/4 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </NavLink>
      ))}
      <a
        href={withSsoHandoff(PUBLIC_SITE_URL)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-bold uppercase tracking-wide text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground"
      >
        <ExternalLink className="h-5 w-5 shrink-0" />
        <span className="truncate">Site</span>
      </a>
      {isAdmin && (
        <button
          type="button"
          onClick={handleLogout}
          className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-bold uppercase tracking-wide text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span className="truncate">Deconectare</span>
        </button>
      )}
    </nav>
  );
}

function SidebarFooter() {
  const { logout } = useAuth();

  async function handleLogout() {
    await logout();
    // No login page of this app's own, and nothing left here to come back
    // to once signed out - send them to the public site's homepage rather
    // than bouncing through its /cont login page (see App.jsx's own
    // redirect for an unauthenticated direct visit).
    window.location.href = PUBLIC_SITE_URL;
  }

  return (
    <div className="flex flex-col gap-1 border-t border-sidebar-border px-3 py-4">
      <a
        href={withSsoHandoff(PUBLIC_SITE_URL)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-md px-3 py-2 text-base font-bold uppercase tracking-wide text-sidebar-foreground/80 transition-colors hover:bg-white/5 hover:text-sidebar-foreground"
      >
        <Logo size={20} className="shrink-0" />
        Vezi site-ul
      </a>
      <button
        type="button"
        onClick={handleLogout}
        className="flex items-center gap-3 rounded-md px-3 py-2 text-left text-base font-bold uppercase tracking-wide text-sidebar-foreground/80 transition-colors hover:bg-white/5 hover:text-sidebar-foreground"
      >
        <LogOut className="h-5 w-5 shrink-0" />
        Deconectare
      </button>
    </div>
  );
}

/** Desktop: fixed left sidebar. Mobile/tablet (below `lg`): just a fixed
 * bottom tab bar (icon+label per role nav item, plus a direct link out to
 * the public site) - no top bar, no drawer. Nav items vary by role - see
 * useNavItems() above. */
export default function Sidebar() {
  const { user, isAdmin, isCoach } = useAuth();
  const athlete = user?.athlete;
  const club = useClubLogo(athlete?.club);
  const navItems = useNavItems({ isAdmin, isCoach });
  const fullName = athlete ? `${athlete.first_name || ''} ${athlete.last_name || ''}`.trim() : '';

  // Header shows the club logo (same for a coach or a plain athlete - both
  // belong to a club) alongside the person's own name, not the club's name
  // - only an admin (no club of their own) falls back to the federation
  // branding instead.
  const headerLabel = isAdmin ? 'Panou Admin' : (fullName || (isCoach ? 'Panou Antrenor' : 'Panou Sportiv'));

  return (
    <>
      <BottomNav navItems={navItems} isAdmin={isAdmin} />

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2 px-4 py-5">
          {club?.logo ? (
            <img src={imgUrl(club.logo)} alt={club.name} width={40} height={40} className="shrink-0 rounded object-contain" />
          ) : (
            <Logo size={40} />
          )}
          <p className="truncate text-sm font-bold uppercase tracking-wide">{headerLabel}</p>
        </div>
        <NavLinks navItems={navItems} />
        <SidebarFooter />
      </aside>
    </>
  );
}
