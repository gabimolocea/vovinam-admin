import { Navigate, Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import EnrollPage from './pages/EnrollPage.jsx'
import MyEnrollmentsPage from './pages/MyEnrollmentsPage.jsx'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/enroll/:competitionId" element={<EnrollPage />} />
      <Route path="/my-enrollments" element={<MyEnrollmentsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
