import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@shared';
import Logo from '@shared/components/Logo';

const navItems = [
  { to: '/', label: 'Sportivi' },
  { to: '/competitions', label: 'Competiții' },
  { to: '/exams', label: 'Examene' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="frvv-shell flex h-screen flex-col">
      <header className="frvv-shell-header flex items-center justify-between px-4 py-2 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Logo size={30} />
            <h1 className="text-base font-black uppercase tracking-wide text-yellow-200">Panou antrenor</h1>
          </div>
          <nav className="flex items-center gap-1">
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
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="truncate text-sm text-yellow-100/85">{user?.email}</span>
          <button onClick={handleLogout} className="border border-yellow-400/50 px-2.5 py-1 text-xs font-semibold text-yellow-100 hover:bg-yellow-300 hover:text-black transition">
            Deconectare
          </button>
        </div>
      </header>

      <main className="frvv-shell-main flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
