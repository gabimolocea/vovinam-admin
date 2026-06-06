import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@shared';
import LoginPage from '@shared/components/LoginPage';
import Layout from './components/Layout';
import AthletesList from './pages/AthletesList';
import AthleteDetail from './pages/AthleteDetail';
import CreateAthlete from './pages/CreateAthlete';
import CompetitionsList from './pages/CompetitionsList';
import CompetitionCentralizator from './pages/CompetitionCentralizator';
import GradeManagement from './pages/GradeManagement';
import ClubEdit from './pages/ClubEdit';

export default function App() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage title="Panou antrenor" />}
      />
      <Route path="/" element={isAuthenticated ? <Layout /> : <Navigate to="/login" replace />}>
        <Route index element={<AthletesList />} />
        <Route path="athletes/new" element={<CreateAthlete />} />
        <Route path="athletes/:id" element={<AthleteDetail />} />
        <Route path="competitions" element={<CompetitionsList />} />
        <Route path="competitions/:eventId" element={<CompetitionCentralizator />} />
        <Route path="exams" element={<GradeManagement />} />
        <Route path="grades" element={<Navigate to="/exams" replace />} />
        <Route path="profile" element={<ClubEdit />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
