import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, ProtectedRoute } from '@shared';
import LoginPage from '@shared/components/LoginPage';
import { Spinner } from '@shared/components/ui';
import Layout from './components/Layout';

const PortalPage = lazy(() => import('./pages/PortalPage'));
const CompetitionList = lazy(() => import('./pages/CompetitionList'));
const CompetitionForm = lazy(() => import('./pages/CompetitionForm'));
const CreateAthlete = lazy(() => import('./pages/CreateAthlete'));
const CategoriesLayout = lazy(() => import('./pages/CategoriesLayout'));
const CentralizatorPage = lazy(() => import('./pages/CentralizatorPage'));
const TehnicaPage = lazy(() => import('./pages/TehnicaPage'));
const ClasamentLayout = lazy(() => import('./pages/ClasamentLayout'));
const ClasamenteTehnicaPage = lazy(() => import('./pages/ClasamenteTehnicaPage'));
const ClasamentCluburiPage = lazy(() => import('./pages/ClasamentCluburiPage'));
const ClasamentSportiviInscrisiPage = lazy(() => import('./pages/ClasamentSportiviInscrisiPage'));
const LuptaPage = lazy(() => import('./pages/LuptaPage'));
const ClasamenteLuptaPage = lazy(() => import('./pages/ClasamenteLuptaPage'));
const ProgramarePage = lazy(() => import('./pages/ProgramarePage'));
const ArbitriPage = lazy(() => import('./pages/ArbitriPage'));
const BracketPage = lazy(() => import('./pages/BracketPage'));
const ResultsPage = lazy(() => import('./pages/ResultsPage'));
const LivePage = lazy(() => import('./pages/LivePage'));
const LiveFullscreenPage = lazy(() => import('./pages/LiveFullscreenPage'));
const SyncCenterPage = lazy(() => import('./pages/SyncCenterPage'));
const DiplomaConfiguratorPage = lazy(() => import('./pages/DiplomaConfiguratorPage'));

function LegacySyncRedirect() {
  return <Navigate to="../categories/sync" replace relative="path" />;
}

export default function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return null;

  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Spinner /></div>}>
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
    </Suspense>
  );
}
