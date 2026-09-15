import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth, notificationAPI } from '@shared';
import Logo from '@shared/components/Logo';
import { Button, Sheet, SheetContent } from './ui';
import { Rss, Users, Trophy, Award, Building2, User, Bell, LogOut, Menu, ExternalLink } from 'lucide-react';

const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL || 'http://localhost:5183';
const POLL_INTERVAL_MS = 60000;

const navItems = [
  { to: '/', label: 'Feed', icon: Rss, end: true },
  { to: '/athletes', label: 'Sportivi', icon: Users },
  { to: '/competitions', label: 'Competiții', icon: Trophy },
  { to: '/exams', label: 'Examene', icon: Award },
  { to: '/notifications', label: 'Notificări', icon: Bell, badgeKey: 'notifications' },
  { to: '/profile', label: 'Club', icon: Building2 },
  { to: '/my-profile', label: 'Profilul meu', icon: User },
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
            `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/80 hover:bg-white/5 hover:text-sidebar-foreground'
            }`
          }
        >
          <Icon className="h-4 w-4 shrink-0" />
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

function SidebarFooter({ onNavigate }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    onNavigate?.();
    navigate('/login');
  }

  return (
    <div className="flex flex-col gap-3 border-t border-sidebar-border px-3 py-4">
      <Button
        as="a"
        href={PUBLIC_SITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        variant="outline"
        size="sm"
        className="justify-start gap-2 border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-white/5 hover:text-sidebar-foreground"
      >
        <ExternalLink className="h-4 w-4" />
        Vezi site-ul
      </Button>
      <Button variant="outline" size="sm" onClick={handleLogout} className="justify-start gap-2 border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-white/5 hover:text-sidebar-foreground">
        <LogOut className="h-4 w-4" />
        Deconectare
      </Button>
    </div>
  );
}

/** Desktop: fixed left sidebar. Mobile: slim top bar + a Sheet drawer with
 * the same nav content, opened by the hamburger button. */
export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-3 text-sidebar-foreground lg:hidden">
        <div className="flex items-center gap-2">
          <Logo size={28} />
          <span className="text-sm font-bold uppercase tracking-wide">Panou Antrenor</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} className="text-sidebar-foreground hover:bg-white/10" aria-label="Deschide meniul">
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="lg:hidden">
          <div className="flex items-center gap-2 border-b border-sidebar-border px-4 py-4">
            <Logo size={28} />
            <span className="text-sm font-bold uppercase tracking-wide text-sidebar-foreground">Panou Antrenor</span>
          </div>
          <NavLinks onNavigate={() => setMobileOpen(false)} />
          <SidebarFooter onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2 px-4 py-5">
          <Logo size={32} />
          <p className="truncate text-sm font-bold uppercase tracking-wide">Panou Antrenor</p>
        </div>
        <NavLinks />
        <SidebarFooter />
      </aside>
    </>
  );
}
