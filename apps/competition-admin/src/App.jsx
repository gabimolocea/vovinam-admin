import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, ProtectedRoute } from '@shared';
import LoginPage from '@shared/components/LoginPage';
import Layout from './components/Layout';
import CompetitionList from './pages/CompetitionList';
import CompetitionDetail from './pages/CompetitionDetail';
import CompetitionForm from './pages/CompetitionForm';
import CategoriesPage from './pages/CategoriesPage';
import FieldsPage from './pages/FieldsPage';
import ResultsPage from './pages/ResultsPage';

export default function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return null;

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated ? <Navigate to="/" replace /> : <LoginPage title="Competition Admin" />
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
        <Route index element={<CompetitionList />} />
        <Route path="competitions/new" element={<CompetitionForm />} />
        <Route path="competitions/:id" element={<CompetitionDetail />} />
        <Route path="competitions/:id/fields" element={<FieldsPage />} />
        <Route path="competitions/:id/results" element={<ResultsPage />} />
      </Route>

      {/* Categories page renders full-screen without sidebar */}
      <Route
        path="/competitions/:id/categories"
        element={
          <ProtectedRoute roles={['admin']}>
            <CategoriesPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
