import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth, notificationAPI } from '@shared';
import { clubAPI, MEDIA_BASE_URL } from '@shared/lib/api';
import { withSsoHandoff } from '@shared/lib/sso';
import Logo from '@shared/components/Logo';
import { Sheet, SheetContent } from './ui';
import { Trophy, Building2, User, Bell, LogOut, Menu, X, ExternalLink, ShieldCheck } from 'lucide-react';

const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL || 'http://localhost:5183';
const COMPETITION_ADMIN_URL = import.meta.env.VITE_COMPETITION_ADMIN_URL || 'http://localhost:5191';
const POLL_INTERVAL_MS = 60000;
// Brand red used for the public site's own mobile hamburger/close toggle -
// reused here so the mobile menu behaves and looks the same way.
const TOGGLE_RED = '#da3b26';
const ACTIVE_GOLD = '#edb654';

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

/** Full-width rows on the dark drawer background, bold uppercase text with
 * a hairline divider between rows - same visual language as the public
 * site's own mobile menu (.site-mobile-row), just with an icon per row
 * since this app's nav already has them. Active/hover only changes the
 * text/icon color (to the same gold), it doesn't fill the row - matching
 * the public site exactly rather than the desktop sidebar's filled style. */
function MobileNavLinks({ navItems, onNavigate }) {
  const unreadCount = useUnreadCount();

  return (
    <nav className="flex flex-col" aria-label="Navigație mobilă">
      {navItems.map(({ to, label, icon: Icon, end, badgeKey }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 border-b border-white/10 px-4 py-4 text-base font-bold uppercase tracking-wide transition-colors ${
              isActive ? '' : 'text-white'
            }`
          }
          style={({ isActive }) => ({ color: isActive ? ACTIVE_GOLD : undefined })}
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
          className="flex items-center gap-3 border-b border-white/10 px-4 py-4 text-base font-bold uppercase tracking-wide text-white"
        >
          <Trophy className="h-5 w-5 shrink-0" />
          Competiții
        </a>
      )}
    </nav>
  );
}

function SidebarFooter({ onNavigate, mobile = false }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    onNavigate?.();
    // No login page of this app's own - the root route redirects out to
    // the public site's /cont once unauthenticated (see App.jsx).
    navigate('/');
  }

  if (mobile) {
    return (
      <div className="flex flex-col">
        <a
          href={withSsoHandoff(PUBLIC_SITE_URL)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 border-b border-white/10 px-4 py-4 text-base font-bold uppercase tracking-wide text-white"
        >
          <Logo size={20} className="shrink-0" />
          Vezi site-ul
        </a>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-4 text-left text-base font-bold uppercase tracking-wide text-white"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          Deconectare
        </button>
      </div>
    );
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

/** Desktop: fixed left sidebar. Mobile: slim top bar (hamburger on the
 * left, like the public site) + a full-screen-style drawer with the same
 * nav content, matching the public site's own mobile menu look. Header
 * widget and nav items both vary by role - see useNavItems() above. */
export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerRef = useRef(null);
  const { user, isAdmin, isCoach } = useAuth();
  const athlete = user?.athlete;
  const club = useClubLogo(athlete?.club);
  const navItems = useNavItems({ isAdmin, isCoach });
  const fullName = athlete ? `${athlete.first_name || ''} ${athlete.last_name || ''}`.trim() : '';

  // The drawer needs to start exactly below the mobile top bar (which
  // stays visible/on top so its own toggle button keeps working to close
  // the menu) rather than covering it - measured rather than hardcoded
  // since the bar's height depends on the logo/font rendering.
  useEffect(() => {
    function updateHeaderHeight() {
      if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight);
    }
    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    return () => window.removeEventListener('resize', updateHeaderHeight);
  }, []);

  // Header shows the club logo (same for a coach or a plain athlete - both
  // belong to a club) alongside the person's own name, not the club's name
  // - only an admin (no club of their own) falls back to the federation
  // branding instead.
  const headerLabel = isAdmin ? 'Panou Admin' : (fullName || (isCoach ? 'Panou Antrenor' : 'Panou Sportiv'));

  return (
    <>
      {/* Mobile top bar - hamburger on the left; toggles to a red X while
          the menu is open, same as the public site's mobile toggle. */}
      <div ref={headerRef} className="relative z-[60] flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-3 text-sidebar-foreground lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="-ml-4 -my-3 flex w-14 shrink-0 items-center justify-center self-stretch"
          style={mobileOpen ? { backgroundColor: TOGGLE_RED, color: '#fff' } : undefined}
          aria-label={mobileOpen ? 'Închide meniul' : 'Deschide meniul'}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          {club?.logo ? (
            <img src={imgUrl(club.logo)} alt={club.name} width={28} height={28} className="shrink-0 rounded object-contain" />
          ) : (
            <Logo size={28} />
          )}
          <span className="truncate text-sm font-bold uppercase tracking-wide">{headerLabel}</span>
        </div>
        <a
          href={withSsoHandoff(PUBLIC_SITE_URL)}
          target="_blank"
          rel="noopener noreferrer"
          className="-my-3 flex shrink-0 items-center gap-1.5 self-stretch px-3 text-sidebar-foreground"
          title="Vezi site-ul"
        >
          <ExternalLink className="h-5 w-5" aria-hidden="true" />
          <span className="text-xs font-bold uppercase tracking-wide">Site</span>
        </a>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-full max-w-none overflow-y-auto border-none bg-[#071225] lg:hidden"
          style={{ top: headerHeight, bottom: 0 }}
        >
          <MobileNavLinks navItems={navItems} onNavigate={() => setMobileOpen(false)} />
          <SidebarFooter mobile onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

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
