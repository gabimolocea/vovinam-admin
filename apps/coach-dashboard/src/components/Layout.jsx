import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
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
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="frvv-shell flex h-screen flex-col">
      <header className="frvv-shell-header shrink-0 border-b-2 border-yellow-400 px-3 py-3 sm:px-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Logo size={30} />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-black uppercase tracking-wide text-yellow-200 sm:text-base">Panou antrenor</h1>
              <p className="hidden text-[11px] text-yellow-100/70 sm:block">Gestionare club și înscrieri</p>
            </div>
          </div>
          <div className="hidden items-center gap-3 lg:flex">
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
            <div className="flex items-center gap-3">
              <span className="max-w-[220px] truncate text-sm text-yellow-100/85">{user?.email}</span>
              <button onClick={handleLogout} className="border border-yellow-400/50 px-2.5 py-1 text-xs font-semibold text-yellow-100 hover:bg-yellow-300 hover:text-black transition">
                Deconectare
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="inline-flex h-10 w-10 items-center justify-center border border-yellow-400/50 bg-white/10 text-lg font-black text-yellow-100 transition hover:bg-yellow-300 hover:text-black lg:hidden"
            aria-label={mobileMenuOpen ? 'Închide meniul' : 'Deschide meniul'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? '×' : '☰'}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="mt-3 space-y-3 border-t border-yellow-400/30 pt-3 lg:hidden">
            <nav className="grid gap-2 sm:grid-cols-3">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `frvv-shell-navlink justify-center text-center ${
                    isActive ? 'frvv-shell-navlink-active' : 'frvv-shell-navlink-inactive'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            </nav>
            <div className="flex flex-col gap-2 border-t border-yellow-400/20 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="truncate text-sm text-yellow-100/85">{user?.email}</span>
              <button onClick={handleLogout} className="border border-yellow-400/50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-yellow-100 hover:bg-yellow-300 hover:text-black transition sm:self-start">
                Deconectare
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="frvv-shell-main flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
