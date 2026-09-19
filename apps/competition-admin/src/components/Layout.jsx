import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@shared';
import Logo from '@shared/components/Logo';
import { Button } from './ui';
import { LogOut } from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* ═══ TOP NAV BAR ═══ */}
      <header className="flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-2.5 shrink-0 text-sidebar-foreground sm:px-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Logo size={32} />
            <h2 className="font-display text-sm font-bold uppercase tracking-wide">FRVV Admin</h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline truncate text-xs text-sidebar-foreground/70">{user?.email}</span>
          <Button variant="outline" size="sm" onClick={handleLogout} className="gap-1.5 border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-white/10 hover:text-sidebar-foreground">
            <LogOut className="h-3.5 w-3.5" />
            Logout
          </Button>
        </div>
      </header>

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="flex-1 min-w-0 overflow-auto bg-background p-3 sm:p-4 md:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
