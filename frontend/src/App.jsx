import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { CompetitionProvider } from './contexts/CompetitionContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { OfflineProvider } from './contexts/OfflineContext';

// Pages
import RefereeLoginPage from './pages/RefereeLoginPage';
import RefereeScoringPage from './pages/RefereeScoringPage';
import DisplayMonitorPage from './pages/DisplayMonitorPage';
import AdminDashboardPage from './pages/AdminDashboardPage';

// Protected route wrapper
import ProtectedRoute from './components/ProtectedRoute';

import './App.css';

function App() {
  return (
    <AuthProvider>
      <CompetitionProvider>
        <WebSocketProvider>
          <OfflineProvider>
            <BrowserRouter>
              <Routes>
                {/* Public Routes */}
                <Route path="/referee/login" element={<RefereeLoginPage />} />
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
                <Route
                  path="/admin/*"
                  element={
                    <ProtectedRoute requiredRole="admin">
                      <AdminDashboardPage />
                    </ProtectedRoute>
                  }
                />

                {/* Redirects */}
                <Route path="/" element={<Navigate to="/referee/login" replace />} />
                <Route path="*" element={<Navigate to="/referee/login" replace />} />
              </Routes>
            </BrowserRouter>
          </OfflineProvider>
        </WebSocketProvider>
      </CompetitionProvider>
    </AuthProvider>
  );
}

export default App;
