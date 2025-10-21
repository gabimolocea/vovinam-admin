import {Routes, Route, Navigate} from 'react-router-dom'
import './App.css'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './components/Login'
import Register from './components/Register'
import EnhancedRegister from './components/EnhancedRegister'
import CreateClub from './components/CreateClub'
import Edit from './components/Edit'
import Clubs from './components/Clubs'
import Dashboard from './components/Dashboard'
import UserDashboard from './components/UserDashboard'
import Athletes from './components/Athletes'
import CreateAthlete from './components/CreateAthlete'
import EditAthlete from './components/EditAthlete'
import ViewAthlete from './components/ViewAthlete'
import ViewClub from './components/ViewClub'
import Competitions from './components/Competitions'
import CompetitionDetails from './components/CompetitionDetails'
import NewsLayout from './components/NewsLayout'
import NewsList from './pages/News/NewsList'
import ArticleDetail from './pages/News/ArticleDetail'
import SessionTest from './components/SessionTest'
import Profile from './components/Profile'
import AuthDebug from './components/AuthDebug'
import AuthTest from './components/AuthTest'

// New athlete workflow components
import AthleteRegistration from './components/AthleteRegistration'
import AdminApprovals from './components/AdminApprovals'
import SupporterManagement from './components/SupporterManagement'
import AthleteProfileStatus from './components/AthleteProfileStatus'

function App() {
  return (
    <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/register-enhanced" element={<EnhancedRegister />} />
        <Route path="/session-test" element={<SessionTest />} />
        <Route path="/debug" element={<AuthDebug />} />
        <Route path="/auth-test" element={<AuthTest />} />
        
        {/* Protected routes */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <UserDashboard />
          </ProtectedRoute>
        } />
        <Route path="/old-dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        
        {/* Admin-only create/edit routes */}
        <Route path="/create-club" element={
          <ProtectedRoute requireAdmin={true}>
            <CreateClub />
          </ProtectedRoute>
        } />
        <Route path="clubs/edit/:id" element={
          <ProtectedRoute requireAdmin={true}>
            <Edit />
          </ProtectedRoute>
        } />
        <Route path="/create-athlete" element={
          <ProtectedRoute requireAdmin={true}>
            <CreateAthlete />
          </ProtectedRoute>
        } />
        <Route path="/athletes/edit/:id" element={
          <ProtectedRoute requireAdmin={true}>
            <EditAthlete />
          </ProtectedRoute>
        } />
        
        {/* View-only routes for authenticated users */}
        <Route path="/clubs" element={
          <ProtectedRoute>
            <Clubs />
          </ProtectedRoute>
        } />
        <Route path="/competition/:competitionId" element={
          <ProtectedRoute>
            <CompetitionDetails />
          </ProtectedRoute>
        } />
        <Route path="/athletes/" element={
          <ProtectedRoute>
            <Athletes />
          </ProtectedRoute>
        } />
        <Route path="/athletes/:id/" element={
          <ProtectedRoute>
            <ViewAthlete />
          </ProtectedRoute>
        } />
        <Route path="/clubs/:id" element={
          <ProtectedRoute>
            <ViewClub />
          </ProtectedRoute>
        } />
        <Route path="/competitions" element={
          <ProtectedRoute>
            <Competitions />
          </ProtectedRoute>
        } />
        
        {/* Profile route */}
        <Route path="/profile" element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        } />
        
        {/* Athlete workflow routes */}
        <Route path="/athlete-registration" element={
          <ProtectedRoute requireRole="athlete">
            <AthleteRegistration />
          </ProtectedRoute>
        } />
        <Route path="/athlete-profile-status" element={
          <ProtectedRoute requireRole="athlete">
            <AthleteProfileStatus />
          </ProtectedRoute>
        } />
        
        {/* Admin routes */}
        <Route path="/admin/pending-approvals" element={
          <ProtectedRoute requireAdmin={true}>
            <AdminApprovals />
          </ProtectedRoute>
        } />
        
        {/* Supporter routes */}
        <Route path="/supporter-management" element={
          <ProtectedRoute requireRole="supporter">
            <SupporterManagement />
          </ProtectedRoute>
        } />
        
        {/* News routes */}
        <Route path="/news" element={
          <ProtectedRoute>
            <NewsLayout />
          </ProtectedRoute>
        }>
          <Route index element={<NewsList />} />
          <Route path=":slug" element={<ArticleDetail />} />
        </Route>
      </Routes>
  );
}

export default App
