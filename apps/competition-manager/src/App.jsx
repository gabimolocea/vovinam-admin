import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import {
  AppBar,
  Box,
  Button,
  Container,
  Toolbar,
  Typography,
  Paper,
  Stack,
  Alert,
  Chip,
  Tabs,
  Tab,
} from '@mui/material'
import CloudDownloadIcon from '@mui/icons-material/CloudDownload'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import SyncIcon from '@mui/icons-material/Sync'
import OfflineBanner from './components/OfflineBanner.jsx'
import SetupPanel from './components/SetupPanel.jsx'
import BracketsPanel from './components/BracketsPanel.jsx'
import ResultsPanel from './components/ResultsPanel.jsx'
import EnrollmentsPanel from './components/EnrollmentsPanel.jsx'
import { downloadSnapshot, uploadResults } from './services/sync.js'
import { useAuth } from './contexts/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import LoginPage from './pages/LoginPage.jsx'

const AppShell = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [syncStatus, setSyncStatus] = useState('idle')
  const [lastSyncAt, setLastSyncAt] = useState(null)
  const [message, setMessage] = useState(null)
  const [activeTab, setActiveTab] = useState(0)
  const { user, logout } = useAuth()

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleDownload = useCallback(async () => {
    setSyncStatus('downloading')
    setMessage(null)
    try {
      await downloadSnapshot()
      setLastSyncAt(new Date().toISOString())
      setMessage({ type: 'success', text: 'Athlete and competition data downloaded.' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Download failed.' })
    } finally {
      setSyncStatus('idle')
    }
  }, [])

  const handleUpload = useCallback(async () => {
    setSyncStatus('uploading')
    setMessage(null)
    try {
      await uploadResults()
      setLastSyncAt(new Date().toISOString())
      setMessage({ type: 'success', text: 'Results uploaded to federation backend.' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Upload failed.' })
    } finally {
      setSyncStatus('idle')
    }
  }, [])

  const syncLabel = useMemo(() => {
    if (syncStatus === 'downloading') return 'Downloading...'
    if (syncStatus === 'uploading') return 'Uploading...'
    return 'Idle'
  }, [syncStatus])

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue)
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            FRVV Competition Manager
          </Typography>
          <Typography variant="body2" sx={{ mr: 2 }}>
            {user ? `${user.first_name} ${user.last_name}` : ''}
          </Typography>
          <Button color="inherit" onClick={logout}>Logout</Button>
          <Chip
            label={isOnline ? 'Online' : 'Offline'}
            color={isOnline ? 'success' : 'warning'}
            variant="outlined"
            sx={{ color: 'white', borderColor: 'white' }}
          />
        </Toolbar>
      </AppBar>

      <OfflineBanner isOnline={isOnline} />

      <Container sx={{ py: 4 }}>
        <Stack spacing={3}>
          {message && (
            <Alert severity={message.type}>{message.text}</Alert>
          )}

          <Paper sx={{ p: 3 }} elevation={2}>
            <Stack spacing={2}>
              <Typography variant="h5">Offline Sync Controls</Typography>
              <Typography variant="body2" color="text.secondary">
                Download athletes and competition data for offline use, then upload results when back online.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Button
                  variant="contained"
                  startIcon={<CloudDownloadIcon />}
                  onClick={handleDownload}
                  disabled={!isOnline || syncStatus !== 'idle'}
                >
                  Download Data
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<CloudUploadIcon />}
                  onClick={handleUpload}
                  disabled={!isOnline || syncStatus !== 'idle'}
                >
                  Upload Results
                </Button>
                <Chip
                  icon={<SyncIcon />}
                  label={`Sync: ${syncLabel}`}
                  variant="outlined"
                />
              </Stack>
              {lastSyncAt && (
                <Typography variant="caption" color="text.secondary">
                  Last sync: {new Date(lastSyncAt).toLocaleString()}
                </Typography>
              )}
            </Stack>
          </Paper>

          <Paper sx={{ p: 3 }} elevation={1}>
            <Tabs value={activeTab} onChange={handleTabChange} sx={{ mb: 2 }}>
              <Tab label="Setup" />
              <Tab label="Brackets" />
              <Tab label="Results" />
              <Tab label="Enrollments" />
            </Tabs>
            {activeTab === 0 && <SetupPanel />}
            {activeTab === 1 && <BracketsPanel />}
            {activeTab === 2 && <ResultsPanel />}
            {activeTab === 3 && <EnrollmentsPanel />}
          </Paper>
        </Stack>
      </Container>
    </Box>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
