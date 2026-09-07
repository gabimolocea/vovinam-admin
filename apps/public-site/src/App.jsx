import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import NewsListPage from './pages/NewsListPage';
import NewsDetailPage from './pages/NewsDetailPage';
import VideosPage from './pages/VideosPage';
import AboutPage from './pages/AboutPage';
import EventsCalendarPage from './pages/EventsCalendarPage';
import EventDetailPage from './pages/EventDetailPage';
import ClubsPage from './pages/ClubsPage';
import ClubDetailPage from './pages/ClubDetailPage';
import AthletesListPage from './pages/AthletesListPage';
import AthleteDetailPage from './pages/AthleteDetailPage';
import StaffPage from './pages/StaffPage';
import RefereesPage from './pages/RefereesPage';
import DocumentsPage from './pages/DocumentsPage';
import AccountPage from './pages/AccountPage';

export default function App() {
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
        <Route path="cluburi/:slug" element={<ClubDetailPage />} />
        <Route path="sportivi" element={<AthletesListPage />} />
        <Route path="sportivi/:id" element={<AthleteDetailPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="arbitri" element={<RefereesPage />} />
        <Route path="regulament" element={<DocumentsPage category="regulament" title="Regulament" />} />
        <Route path="documente" element={<DocumentsPage category="documente" title="Documente" />} />
        <Route path="autentificare" element={<Navigate to="/cont" replace />} />
        <Route path="inregistrare" element={<Navigate to="/cont?mode=register" replace />} />
        <Route path="cont" element={<AccountPage />} />
      </Route>
    </Routes>
  );
}
