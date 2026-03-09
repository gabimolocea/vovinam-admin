import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@shared';
import Logo from '@shared/components/Logo';

const navItems = [
  { to: '/', label: 'Events', icon: '🏆' },
  { to: '/enrollments', label: 'My Enrollments', icon: '📝' },
  { to: '/results', label: 'My Results', icon: '📊' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="frvv-shell">
      {/* Top nav */}
      <header className="frvv-shell-header">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo size={32} />
            <div>
              <h1 className="text-lg font-black uppercase tracking-wide text-yellow-200">Athlete Portal</h1>
              <p className="text-xs text-yellow-100/75">FRVV — Enrollment</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-yellow-100/85">{user?.first_name || user?.email}</span>
            <button onClick={handleLogout} className="border border-yellow-400/50 px-2.5 py-1 text-xs font-semibold text-yellow-100 hover:bg-yellow-300 hover:text-black">
              Logout
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 px-4 pb-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `frvv-shell-navlink ${
                  isActive ? 'frvv-shell-navlink-active' : 'frvv-shell-navlink-inactive'
                }`
              }
            >
              <span className="mr-1.5">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="frvv-shell-main mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
