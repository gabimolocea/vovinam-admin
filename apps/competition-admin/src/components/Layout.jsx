import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@shared';

const navItems = [
  { to: '/', label: 'Competitions', icon: '🏆' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">FRVV Admin</h2>
          <p className="text-xs text-gray-500">Competition Management</p>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
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

        <div className="border-t border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="truncate text-sm text-gray-600">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-400 hover:text-red-600"
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto bg-gray-50 p-4 md:p-6 lg:p-8 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
