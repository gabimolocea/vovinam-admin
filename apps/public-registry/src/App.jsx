import { Routes, Route, Link, Navigate } from 'react-router-dom';
import { useAuth } from '@shared';
import LoginPage from '@shared/components/LoginPage';
import AthletesDirectoryPage from './pages/AthletesDirectoryPage';
import AthleteProfilePage from './pages/AthleteProfilePage';
import LeaderboardPage from './pages/LeaderboardPage';
import SubmitResultPage from './pages/SubmitResultPage';

function PublicLayout() {
  const { isAuthenticated, user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-base font-black uppercase tracking-wide text-gray-900">FRVV Public Registry</Link>
          <div className="flex items-center gap-2">
            <Link to="/" className="rounded border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">Sportivi</Link>
            <Link to="/leaderboard" className="rounded border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">Clasament</Link>
            {isAuthenticated && (
              <Link to="/submit-result" className="rounded border border-blue-600 bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700">Adaugă rezultat</Link>
            )}
            {isAuthenticated ? (
              <button
                type="button"
                onClick={async () => {
                  await logout();
                }}
                className="rounded border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Logout ({user?.email || 'cont'})
              </button>
            ) : (
              <Link to="/login" className="rounded border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">Login</Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <Routes>
          <Route index element={<AthletesDirectoryPage />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
          <Route path="athletes/:id" element={<AthleteProfilePage />} />
          <Route path="submit-result" element={isAuthenticated ? <SubmitResultPage /> : <Navigate to="/login" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage title="Public Registry Login" />}
      />
      <Route path="/*" element={<PublicLayout />} />
    </Routes>
  );
}
