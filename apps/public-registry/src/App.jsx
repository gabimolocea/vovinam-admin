import { Routes, Route, Link, NavLink, Navigate } from 'react-router-dom';
import { LogIn, LogOut, Medal, Plus, Users } from 'lucide-react';
import { useAuth } from '@shared';
import LoginPage from '@shared/components/LoginPage';
import { Button } from './components/ui';
import AthletesDirectoryPage from './pages/AthletesDirectoryPage';
import AthleteProfilePage from './pages/AthleteProfilePage';
import LeaderboardPage from './pages/LeaderboardPage';
import SubmitResultPage from './pages/SubmitResultPage';

function PublicLayout() {
  const { isAuthenticated, user, logout } = useAuth();

  return (
    <div className="public-registry-app">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="font-display text-lg font-semibold text-foreground">Registrul FRVV</Link>
          <nav className="flex flex-wrap items-center gap-1" aria-label="Navigație principală">
            <NavLink to="/" end className={({ isActive }) => `inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}><Users className="h-4 w-4" />Sportivi</NavLink>
            <NavLink to="/leaderboard" className={({ isActive }) => `inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}><Medal className="h-4 w-4" />Clasament</NavLink>
            {isAuthenticated && (
              <Button asChild size="sm"><Link to="/submit-result"><Plus className="h-4 w-4" />Adaugă rezultat</Link></Button>
            )}
            {isAuthenticated ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await logout();
                }}
                title={`Deconectare ${user?.email || ''}`}
              >
                <LogOut className="h-4 w-4" />Ieșire
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm"><Link to="/login"><LogIn className="h-4 w-4" />Autentificare</Link></Button>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8">
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
        element={isAuthenticated ? <Navigate to="/" replace /> : <div className="public-registry-app"><LoginPage title="Autentificare Registru FRVV" /></div>}
      />
      <Route path="/*" element={<PublicLayout />} />
    </Routes>
  );
}
