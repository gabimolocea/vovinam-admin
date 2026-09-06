import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@shared';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import NewsListPage from './pages/NewsListPage';
import NewsDetailPage from './pages/NewsDetailPage';
import VideosPage from './pages/VideosPage';
import AboutPage from './pages/AboutPage';
import EventsCalendarPage from './pages/EventsCalendarPage';
import EventDetailPage from './pages/EventDetailPage';
import ClubsPage from './pages/ClubsPage';
import StaffPage from './pages/StaffPage';
import RefereesPage from './pages/RefereesPage';
import DocumentsPage from './pages/DocumentsPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import OnboardingPage from './pages/OnboardingPage';

export default function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="noutati" element={<NewsListPage />} />
        <Route path="noutati/:slug" element={<NewsDetailPage />} />
        <Route path="video" element={<VideosPage />} />
        <Route path="despre" element={<AboutPage />} />
        <Route path="competitii" element={<EventsCalendarPage />} />
        <Route path="competitii/:slug" element={<EventDetailPage />} />
        <Route path="cluburi" element={<ClubsPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="arbitri" element={<RefereesPage />} />
        <Route path="regulament" element={<DocumentsPage category="regulament" title="Regulament" />} />
        <Route path="documente" element={<DocumentsPage category="documente" title="Documente" />} />
        <Route path="autentificare" element={isAuthenticated ? <Navigate to="/cont" replace /> : <LoginPage />} />
        <Route path="inregistrare" element={isAuthenticated ? <Navigate to="/cont" replace /> : <RegisterPage />} />
        <Route path="cont" element={isAuthenticated ? <OnboardingPage /> : <Navigate to="/autentificare" replace />} />
      </Route>
    </Routes>
  );
}
