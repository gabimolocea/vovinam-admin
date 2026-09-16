import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth, notificationAPI } from '@shared';
import { MEDIA_BASE_URL } from '@shared/lib/api';
import { withSsoHandoff } from '@shared/lib/sso';
import Logo from '@shared/components/Logo';
import { Sheet, SheetContent } from './ui';
import { User, Bell, LogOut, Menu, X, ExternalLink } from 'lucide-react';

const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL || 'http://localhost:5183';
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

const navItems = [
  { to: '/profile', label: 'Profilul meu', icon: User },
  { to: '/notifications', label: 'Notificări', icon: Bell, badgeKey: 'notifications' },
];

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

/** The athlete's own photo + name, shown at the top of the sidebar instead
 * of the federation logo (which now only appears next to "Vezi site-ul") -
 * same wide 3:2 format as the photo on the profile page, not a circular
 * avatar, so it reads consistently across the app. `height` sets the size;
 * width follows from the aspect ratio. */
function AthleteAvatar({ athlete, height }) {
  const fullName = athlete ? `${athlete.first_name || ''} ${athlete.last_name || ''}`.trim() : '';
  const initials = athlete ? `${(athlete.first_name || '')[0] || ''}${(athlete.last_name || '')[0] || ''}`.toUpperCase() : '';
  const width = Math.round(height * 1.5);
  // Approved photo first; while a new one is still pending review, show it
  // dimmed rather than falling back to initials - same convention as the
  // profile page's own hero photo.
  const photoUrl = imgUrl(athlete?.profile_image);
  const pendingPhotoUrl = !photoUrl ? imgUrl(athlete?.pending_profile_image) : null;

  if (photoUrl) {
    return <img src={photoUrl} alt={fullName} width={width} height={height} className="shrink-0 rounded-md object-cover" style={{ width, height }} />;
  }
  if (pendingPhotoUrl) {
    return <img src={pendingPhotoUrl} alt={fullName} width={width} height={height} className="shrink-0 rounded-md object-cover opacity-50 grayscale" style={{ width, height }} />;
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-md bg-white/10 text-sidebar-foreground"
      style={{ width, height, fontSize: height * 0.38 }}
    >
      {initials || '?'}
    </span>
  );
}

function NavLinks({ onNavigate }) {
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
    </nav>
  );
}

/** Full-width rows on the dark drawer background, bold uppercase text with
 * a hairline divider between rows - same visual language as the public
 * site's own mobile menu (.site-mobile-row), just with an icon per row
 * since this app's nav already has them. Active/hover only changes the
 * text/icon color (to the same gold), it doesn't fill the row - matching
 * the public site exactly rather than the desktop sidebar's filled style. */
function MobileNavLinks({ onNavigate }) {
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
 * nav content, matching the public site's own mobile menu look. */
export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerRef = useRef(null);
  const { user } = useAuth();
  const athlete = user?.athlete;
  const fullName = athlete ? `${athlete.first_name || ''} ${athlete.last_name || ''}`.trim() : '';

  // The drawer needs to start exactly below the mobile top bar (which
  // stays visible/on top so its own toggle button keeps working to close
  // the menu) rather than covering it - measured rather than hardcoded
  // since the bar's height depends on the name/font rendering.
  useEffect(() => {
    function updateHeaderHeight() {
      if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight);
    }
    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    return () => window.removeEventListener('resize', updateHeaderHeight);
  }, []);

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
          <AthleteAvatar athlete={athlete} height={28} />
          <span className="truncate text-sm font-bold uppercase tracking-wide">{fullName || 'Panou Sportiv'}</span>
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
          <MobileNavLinks onNavigate={() => setMobileOpen(false)} />
          <SidebarFooter mobile onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2 px-4 py-5">
          <Logo size={40} />
          <p className="truncate text-sm font-bold uppercase tracking-wide">Panou Sportiv</p>
        </div>
        <NavLinks />
        <SidebarFooter />
      </aside>
    </>
  );
}
