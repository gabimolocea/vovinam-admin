import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@shared';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import ScoringPanel from './pages/ScoringPanel';
import MatchScoring from './pages/MatchScoring';

export default function App() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/"
        element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/category/:categoryId/score"
        element={isAuthenticated ? <ScoringPanel /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/match/:matchId/score"
        element={isAuthenticated ? <MatchScoring /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
