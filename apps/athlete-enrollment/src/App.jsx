import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@shared';
import LoginPage from '@shared/components/LoginPage';
import Layout from './components/Layout';
import EventsList from './pages/EventsList';
import EventCategories from './pages/EventCategories';
import MyEnrollments from './pages/MyEnrollments';
import MyResults from './pages/MyResults';

export default function App() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage title="Athlete Portal" />}
      />
      <Route path="/" element={isAuthenticated ? <Layout /> : <Navigate to="/login" replace />}>
        <Route index element={<EventsList />} />
        <Route path="events/:id/categories" element={<EventCategories />} />
        <Route path="enrollments" element={<MyEnrollments />} />
        <Route path="results" element={<MyResults />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
