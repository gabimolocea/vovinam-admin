import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import NewsListPage from './pages/NewsListPage';
import NewsDetailPage from './pages/NewsDetailPage';
import VideosPage from './pages/VideosPage';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import EventsCalendarPage from './pages/EventsCalendarPage';
import ClubsPage from './pages/ClubsPage';
import StaffPage from './pages/StaffPage';
import RefereesPage from './pages/RefereesPage';
import DocumentsPage from './pages/DocumentsPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="noutati" element={<NewsListPage />} />
        <Route path="noutati/:slug" element={<NewsDetailPage />} />
        <Route path="video" element={<VideosPage />} />
        <Route path="despre" element={<AboutPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="competitii" element={<EventsCalendarPage />} />
        <Route path="cluburi" element={<ClubsPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="arbitri" element={<RefereesPage />} />
        <Route path="regulament" element={<DocumentsPage category="regulament" title="Regulament" />} />
        <Route path="documente" element={<DocumentsPage category="documente" title="Documente" />} />
      </Route>
    </Routes>
  );
}
