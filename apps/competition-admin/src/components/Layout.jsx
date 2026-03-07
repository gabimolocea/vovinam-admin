import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@shared';
import Logo from '@shared/components/Logo';

const navItems = [
  { to: '/', label: 'Competiții', icon: '🏆' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen flex-col">
      {/* ═══ TOP NAV BAR ═══ */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6 py-2.5 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Logo size={32} />
            <h2 className="text-sm font-bold text-gray-900">FRVV Admin</h2>
          </div>
          <div className="h-4 w-px bg-gray-300" />
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`
                }
              >
                <span>{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline truncate text-xs text-gray-500">{user?.email}</span>
          <button
            onClick={handleLogout}
            className="rounded-lg px-2.5 py-1 text-xs text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="flex-1 overflow-auto bg-gray-50 p-3 sm:p-4 md:p-6 lg:p-8 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
