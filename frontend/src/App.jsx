import {Routes, Route, Navigate} from 'react-router-dom'
import './App.css'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './components/Login'
import Register from './components/Register'
import TestDashboard from './components/TestDashboard'
import TestAthletes from './components/TestAthletes'
import AthletesConverted from './components/AthletesConverted'
import ClubsConverted from './components/ClubsConverted'
import DashboardConverted from './components/DashboardConverted'
import CreateAthleteConverted from './components/CreateAthleteConverted'
import EditAthleteConverted from './components/EditAthleteConverted'
import EditClubConverted from './components/EditClubConverted'
import ViewAthleteTable from './components/ViewAthleteTable'
import ViewClubConverted from './components/ViewClubConverted'
// Temporarily commented out components with Material-UI imports
// import EnhancedRegister from './components/EnhancedRegister'
// import CreateClub from './components/CreateClub'
// import Edit from './components/Edit'
// import Clubs from './components/Clubs'
// import Dashboard from './components/Dashboard'
// import UserDashboard from './components/UserDashboard'
// import Athletes from './components/Athletes'
// import CreateAthlete from './components/CreateAthlete'
// import EditAthlete from './components/EditAthlete'
// import ViewAthlete from './components/ViewAthlete'
// import ViewClub from './components/ViewClub'
// import Competitions from './components/Competitions'
// import CompetitionDetails from './components/CompetitionDetails'
// import NewsLayout from './components/NewsLayout'
// import NewsList from './pages/News/NewsList'
// import ArticleDetail from './pages/News/ArticleDetail'
// import SessionTest from './components/SessionTest'
// import Profile from './components/Profile'
// import AuthDebug from './components/AuthDebug'
// import AuthTest from './components/AuthTest'

// New athlete workflow components
// import AthleteRegistration from './components/AthleteRegistration'
// import AdminApprovals from './components/AdminApprovals'
// import SupporterManagement from './components/SupporterManagement'
// import AthleteProfileStatus from './components/AthleteProfileStatus'
// import NotificationsPage from './pages/NotificationsPage'
// import SubmissionManagement from './components/SubmissionManagement'

function App() {
  return (
    <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        {/* Temporarily commented out routes with Material-UI dependencies */}
        {/*
        <Route path="/register-enhanced" element={<EnhancedRegister />} />
        <Route path="/session-test" element={<SessionTest />} />
        <Route path="/debug" element={<AuthDebug />} />
        <Route path="/auth-test" element={<AuthTest />} />
        */}
        
        {/* Protected routes */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <DashboardConverted />
          </ProtectedRoute>
        } />
        <Route path="/test-dashboard" element={
          <ProtectedRoute>
            <TestDashboard />
          </ProtectedRoute>
        } />
        {/* Temporarily commented out routes with Material-UI dependencies */}
        {/* 
        <Route path="/old-dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        */}
        
        {/* Converted components with shadcn/ui */}
        <Route path="/athletes" element={
          <ProtectedRoute>
            <AthletesConverted />
          </ProtectedRoute>
        } />
        <Route path="/clubs" element={
          <ProtectedRoute>
            <ClubsConverted />
          </ProtectedRoute>
        } />
        <Route path="/create-athlete" element={
          <ProtectedRoute requireAdmin={true}>
            <CreateAthleteConverted />
          </ProtectedRoute>
        } />
        <Route path="/athletes/edit/:id" element={
          <ProtectedRoute requireAdmin={true}>
            <EditAthleteConverted />
          </ProtectedRoute>
        } />
        <Route path="/clubs/edit/:id" element={
          <ProtectedRoute requireAdmin={true}>
            <EditClubConverted />
          </ProtectedRoute>
        } />
        
        {/* View routes */}
        <Route path="/athletes/:id" element={
          <ProtectedRoute>
            <ViewAthleteTable />
          </ProtectedRoute>
        } />
        <Route path="/clubs/:id" element={
          <ProtectedRoute>
            <ViewClubConverted />
          </ProtectedRoute>
        } />
        
        {/* Test routes */}
        <Route path="/athletes-test" element={
          <ProtectedRoute>
            <TestAthletes />
          </ProtectedRoute>
        } />
        
        {/* Temporarily commented out all routes with Material-UI dependencies */}
        {/* We'll re-enable these as we convert each component to shadcn/ui */}
        
        {/* 
        Admin-only create/edit routes 
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
        
        View-only routes for authenticated users 
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
        
        Profile route 
        <Route path="/profile" element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        } />
        
        Notifications route 
        <Route path="/notifications" element={
          <ProtectedRoute>
            <NotificationsPage />
          </ProtectedRoute>
        } />
        
        Athlete workflow routes 
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
        
        Admin routes 
        <Route path="/admin/pending-approvals" element={
          <ProtectedRoute requireAdmin={true}>
            <AdminApprovals />
          </ProtectedRoute>
        } />
        <Route path="/admin/submissions" element={
          <ProtectedRoute requireAdmin={true}>
            <SubmissionManagement />
          </ProtectedRoute>
        } />
        
        Supporter routes 
        <Route path="/supporter-management" element={
          <ProtectedRoute requireRole="supporter">
            <SupporterManagement />
          </ProtectedRoute>
        } />
        
        News routes 
        <Route path="/news" element={
          <ProtectedRoute>
            <NewsLayout />
          </ProtectedRoute>
        }>
          <Route index element={<NewsList />} />
          <Route path=":slug" element={<ArticleDetail />} />
        </Route>
        */}
      </Routes>
  );
}

export default App
