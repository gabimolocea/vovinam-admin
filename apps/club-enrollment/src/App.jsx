import CompetitionDetailPage from './pages/CompetitionDetailPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import HomePage from './pages/HomePage.jsx'
import { Navigate, Route, Routes } from 'react-router-dom'

import CompetitionsPage from './pages/CompetitionsPage.jsx'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/competitions" element={<CompetitionsPage />} />
      <Route path="/competitions/:competitionId" element={<CompetitionDetailPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
