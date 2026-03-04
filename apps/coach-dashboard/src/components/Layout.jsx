import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@shared';

const navItems = [
  { to: '/', label: 'My Athletes', icon: '🥋' },
  { to: '/enroll', label: 'Enroll to Event', icon: '📝' },
  { to: '/grades', label: 'Grades', icon: '🎖️' },
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
      <aside className="flex w-60 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-bold text-gray-900">Coach Panel</h2>
          <p className="text-xs text-gray-500">Club Management</p>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
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
            <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-red-600">
              Logout
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-gray-50 p-8">
        <Outlet />
      </main>
    </div>
  );
}
