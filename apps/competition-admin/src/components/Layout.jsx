import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@shared';
import Logo from '@shared/components/Logo';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="frvv-shell flex h-screen flex-col">
      {/* ═══ TOP NAV BAR ═══ */}
      <header className="frvv-shell-header flex items-center justify-between px-4 py-2.5 shrink-0 sm:px-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Logo size={32} />
            <h2 className="text-sm font-black uppercase tracking-wide text-yellow-200">FRVV Admin</h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline truncate text-xs text-yellow-100/80">{user?.email}</span>
          <button
            onClick={handleLogout}
            className="border border-yellow-400/50 px-2.5 py-1 text-xs font-semibold text-yellow-100 transition-colors hover:bg-yellow-300 hover:text-black"
          >
            Logout
          </button>
        </div>
      </header>

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="frvv-shell-main flex-1 min-w-0 overflow-auto p-3 sm:p-4 md:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
