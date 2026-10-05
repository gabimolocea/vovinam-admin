import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, ProtectedRoute } from '@shared';
import LoginPage from '@shared/components/LoginPage';
import { Spinner } from './components/ui';
import { citesteMasa } from './lib/masaCentrala';
import Layout from './components/Layout';

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
const DiplomaConfiguratorPage = lazy(() => import('./pages/DiplomaConfiguratorPage'));
const MasaCentralaPage = lazy(() => import('./pages/MasaCentralaPage'));
const MeseCentralePage = lazy(() => import('./pages/MeseCentralePage'));

// Pagina Live se deschide si pentru admin, si pentru masa centrala a unui
// teren. Garda de aici e doar pentru ce se vede: limita adevarata - ce poate
// fi schimbat si pe care teren - o pune serverul la fiecare scriere.
function RutaLive({ children }) {
  const { user, loading, isAuthenticated } = useAuth();
  const masa = citesteMasa();

  if (loading) return null;
  if (!isAuthenticated) {
    // Daca sesiunea de masa a expirat, trimitem inapoi la terenul ei, nu la
    // login: la masa centrala nu exista parola de tastat.
    return <Navigate to={masa ? `/masa/${masa.field.id}` : '/login'} replace />;
  }
  if (user?.role === 'admin' || masa) return children;
  return <Navigate to="/login" replace />;
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
        <Route index element={<Navigate to="/competitions" replace />} />
        <Route path="competitions" element={<CompetitionList />} />
        <Route path="competitions/new" element={<CompetitionForm />} />
        <Route path="athletes/new" element={<CreateAthlete />} />
        <Route path="competitions/:id/results" element={<ResultsPage />} />
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
        <Route path="clasament" element={<ClasamentLayout />}>
          <Route index element={<Navigate to="tehnica" replace />} />
          <Route path="tehnica" element={<ClasamenteTehnicaPage />} />
          <Route path="lupta" element={<ClasamenteLuptaPage />} />
          <Route path="cluburi" element={<ClasamentCluburiPage />} />
          <Route path="sportivi-inscrisi" element={<ClasamentSportiviInscrisiPage />} />
        </Route>
        <Route path="diplome" element={<DiplomaConfiguratorPage />} />
      </Route>

      {/* Intrarea la masa centrala a unui teren: cod lipit pe masa, PIN de
          arbitru. Publica - tocmai asta e rostul ei. */}
      <Route path="/masa/:fieldId" element={<MasaCentralaPage />} />

      {/* Codurile de impartit dimineata, cate unul pe teren. Doar adminul. */}
      <Route
        path="/competitions/:id/mese"
        element={
          <ProtectedRoute roles={['admin']}>
            <MeseCentralePage />
          </ProtectedRoute>
        }
      />

      {/* Fullscreen live view — outside CategoriesLayout, no bottom tabs.
          Singura pagina la care ajunge si masa centrala: restul rutelor cer
          rolul de admin, iar sesiunea de masa nu-l are, deci sunt inchise
          fara sa fie nevoie de vreo lista de interdictii. */}
      <Route
        path="/competitions/:id/live-fullscreen"
        element={
          <RutaLive>
            <LiveFullscreenPage />
          </RutaLive>
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
