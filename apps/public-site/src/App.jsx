import { Routes, Route, Navigate, useParams } from 'react-router-dom';
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
import TermsPage from './pages/TermsPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import GdprPage from './pages/GdprPage';
import NotFoundPage from './pages/NotFoundPage';

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
        <Route path="termeni-si-conditii" element={<TermsPage />} />
        <Route path="confidentialitate" element={<PrivacyPolicyPage />} />
        <Route path="gdpr" element={<GdprPage />} />

        {/* Old/retired paths (WordPress-era or since-renamed) still indexed
            by Google - redirect to their current equivalent instead of
            falling through to the 404 below. */}
        <Route path="competitii" element={<Navigate to="/calendar" replace />} />
        <Route path="competitii/:slug" element={<CompetitiiSlugRedirect />} />
        <Route path="contact" element={<Navigate to="/despre" replace />} />

        {/* Catch-all: without this, an unmatched path renders nothing at
            all (a blank white page), since this layout route only renders
            when one of its children matches. */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

function CompetitiiSlugRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/calendar/${slug}`} replace />;
}
