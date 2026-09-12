import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import NewsListPage from './pages/NewsListPage';
import NewsDetailPage from './pages/NewsDetailPage';
import MediaPage from './pages/MediaPage';
import AboutPage from './pages/AboutPage';
import EventsCalendarPage from './pages/EventsCalendarPage';
import EventDetailPage from './pages/EventDetailPage';
import CompetitionPage from './pages/CompetitionPage';
import ClubsPage from './pages/ClubsPage';
import ClubDetailPage from './pages/ClubDetailPage';
import AthletesListPage from './pages/AthletesListPage';
import AthleteDetailPage from './pages/AthleteDetailPage';
import StaffPage from './pages/StaffPage';
import RefereesPage from './pages/RefereesPage';
import DocumentsPage from './pages/DocumentsPage';
import RegulamentPage from './pages/RegulamentPage';
import AccountPage from './pages/AccountPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import AthleteOnboardingPage from './pages/AthleteOnboardingPage';
import ApprovalsPage from './pages/ApprovalsPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="noutati" element={<NewsListPage />} />
        <Route path="noutati/:slug" element={<NewsDetailPage />} />
        {/* Not "/media" - that path is reserved for Django's MEDIA_URL
            (uploaded files), both by the dev proxy and by the production
            SPA catch-all, which explicitly excludes it. */}
        <Route path="galerie" element={<MediaPage />} />
        <Route path="video" element={<Navigate to="/galerie" replace />} />
        <Route path="despre" element={<AboutPage />} />
        <Route path="calendar" element={<EventsCalendarPage />} />
        <Route path="calendar/:slug" element={<EventDetailPage />} />
        <Route path="competitie" element={<CompetitionPage />} />
        <Route path="cluburi" element={<ClubsPage />} />
        <Route path="cluburi/:slug" element={<ClubDetailPage />} />
        <Route path="sportivi" element={<AthletesListPage />} />
        <Route path="sportivi/:id" element={<AthleteDetailPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="arbitri" element={<RefereesPage />} />
        <Route path="regulament" element={<RegulamentPage />} />
        <Route path="documente" element={<DocumentsPage />} />
        <Route path="autentificare" element={<Navigate to="/cont" replace />} />
        <Route path="inregistrare" element={<Navigate to="/cont?mode=register" replace />} />
        <Route path="cont" element={<AccountPage />} />
        <Route path="reseteaza-parola" element={<ResetPasswordPage />} />
        <Route path="cont/profil" element={<AthleteDetailPage ownProfile />} />
        <Route path="onboarding/sportiv" element={<AthleteOnboardingPage />} />
        <Route path="cont/aprobari" element={<ApprovalsPage />} />
      </Route>
    </Routes>
  );
}
