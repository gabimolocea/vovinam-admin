import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@shared';

const navItems = [
  { to: '/', label: 'Sportivi' },
  { to: '/competitions', label: 'Competiții' },
  { to: '/grades', label: 'Grade' },
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
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2 shrink-0">
        <div className="flex items-center gap-6">
          <h1 className="text-base font-bold text-gray-900">Coach Panel</h1>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="truncate text-sm text-gray-500">{user?.email}</span>
          <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-red-600 transition">
            Logout
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
}
