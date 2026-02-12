import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { CompetitionProvider } from './contexts/CompetitionContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { OfflineProvider } from './contexts/OfflineContext';
import { ThemeProvider, CssBaseline } from '@mui/material';
import theme from './theme';

// Pages
import RefereeLoginPage from './pages/RefereeLoginPage';
import RefereeScoringPage from './pages/RefereeScoringPage';
import DisplayMonitorPage from './pages/DisplayMonitorPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import MyAthletesPage from './pages/MyAthletesPage';
import CompetitionsPage from './pages/CompetitionsPage';
import CompetitionDetailPage from './pages/CompetitionDetailPage';
import ResultsPage from './pages/ResultsPage';

// Protected route wrapper
import ProtectedRoute from './components/ProtectedRoute';

import './App.css';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <CompetitionProvider>
          <WebSocketProvider>
            <OfflineProvider>
              <BrowserRouter>
                <Routes>
                {/* Public Routes */}
                <Route path="/referee/login" element={<RefereeLoginPage />} />
                <Route
                  path="/referee/dashboard"
                  element={
                    <ProtectedRoute requiredRole="referee">
                      <RefereeLoginPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="/qr/:qrCode" element={<RefereeLoginPage />} />

                {/* Referee Routes */}
                <Route
                  path="/referee/score"
                  element={
                    <ProtectedRoute requiredRole="referee">
                      <RefereeScoringPage />
                    </ProtectedRoute>
                  }
                />

                {/* Monitor Routes */}
                <Route path="/monitor/:fieldId" element={<DisplayMonitorPage />} />

                {/* Admin Routes */}

                  {/* Main App Routes */}
                  <Route path="/dashboard" element={<MyAthletesPage />} />
                  <Route path="/competitions" element={<CompetitionsPage />} />
                  <Route path="/competitions/:id" element={<CompetitionDetailPage />} />
                  <Route path="/results" element={<ResultsPage />} />

                {/* Redirects */}
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </BrowserRouter>
            </OfflineProvider>
          </WebSocketProvider>
        </CompetitionProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
