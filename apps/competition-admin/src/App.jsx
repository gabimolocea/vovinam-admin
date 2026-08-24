import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, ProtectedRoute } from '@shared';
import LoginPage from '@shared/components/LoginPage';
import Layout from './components/Layout';
import PortalPage from './pages/PortalPage';
import CompetitionList from './pages/CompetitionList';
import CompetitionForm from './pages/CompetitionForm';
import CreateAthlete from './pages/CreateAthlete';
import CategoriesLayout from './pages/CategoriesLayout';
import CentralizatorPage from './pages/CentralizatorPage';
import TehnicaPage from './pages/TehnicaPage';
import ClasamentLayout from './pages/ClasamentLayout';
import ClasamenteTehnicaPage from './pages/ClasamenteTehnicaPage';
import ClasamentCluburiPage from './pages/ClasamentCluburiPage';
import ClasamentSportiviInscrisiPage from './pages/ClasamentSportiviInscrisiPage';
import LuptaPage from './pages/LuptaPage';
import ClasamenteLuptaPage from './pages/ClasamenteLuptaPage';
import ProgramarePage from './pages/ProgramarePage';
import ArbitriPage from './pages/ArbitriPage';
import BracketPage from './pages/BracketPage';
import ResultsPage from './pages/ResultsPage';
import LivePage from './pages/LivePage';
import LiveFullscreenPage from './pages/LiveFullscreenPage';
import SyncCenterPage from './pages/SyncCenterPage';
import DiplomaConfiguratorPage from './pages/DiplomaConfiguratorPage';

function LegacySyncRedirect() {
  return <Navigate to="../categories/sync" replace relative="path" />;
}

export default function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return null;

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated ? <Navigate to="/" replace /> : <LoginPage title="Administrare competiții" />
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute roles={['admin']}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<PortalPage />} />
        <Route path="competitions" element={<CompetitionList />} />
        <Route path="competitions/new" element={<CompetitionForm />} />
        <Route path="athletes/new" element={<CreateAthlete />} />
        <Route path="competitions/:id/results" element={<ResultsPage />} />
        <Route path="competitions/:id/sync" element={<LegacySyncRedirect />} />
      </Route>

      {/* Categories pages render full-screen without top bar, with bottom tab navigation */}
      <Route
        path="/competitions/:id/categories"
        element={
          <ProtectedRoute roles={['admin']}>
            <CategoriesLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<CentralizatorPage />} />
        <Route path="tehnica" element={<TehnicaPage />} />
        <Route path="lupta" element={<LuptaPage />} />
        <Route path="brackets" element={<BracketPage />} />
        <Route path="programare" element={<ProgramarePage />} />
        <Route path="arbitri" element={<ArbitriPage />} />
        <Route path="live" element={<LivePage />} />
        <Route path="sync" element={<SyncCenterPage />} />
        <Route path="clasament" element={<ClasamentLayout />}>
          <Route index element={<Navigate to="tehnica" replace />} />
          <Route path="tehnica" element={<ClasamenteTehnicaPage />} />
          <Route path="lupta" element={<ClasamenteLuptaPage />} />
          <Route path="cluburi" element={<ClasamentCluburiPage />} />
          <Route path="sportivi-inscrisi" element={<ClasamentSportiviInscrisiPage />} />
        </Route>
        <Route path="diplome" element={<DiplomaConfiguratorPage />} />
      </Route>

      {/* Fullscreen live view — outside CategoriesLayout, no bottom tabs */}
      <Route
        path="/competitions/:id/live-fullscreen"
        element={
          <ProtectedRoute roles={['admin']}>
            <LiveFullscreenPage />
          </ProtectedRoute>
        }
      />

      {/* Redirect old /competitions/:id to centralizator */}
      <Route path="/competitions/:id" element={<Navigate to="categories" replace />} />
      {/* Redirect old /competitions/:id/fields to programare */}
      <Route path="/competitions/:id/fields" element={<Navigate to="../categories/programare" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
