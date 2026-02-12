import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Stack,
  TextField,
  Toolbar,
  Typography,
  Grid,
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material'
import api, { authAPI } from '../services/apis.js'

const HomePage = () => {
  const navigate = useNavigate()
  const [competitions, setCompetitions] = useState([])
  const [loading, setLoading] = useState(true)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [eventTab, setEventTab] = useState('ongoing')
  const [hasToken, setHasToken] = useState(Boolean(localStorage.getItem('authToken')))

  useEffect(() => {
    const fetchCompetitions = async () => {
      try {
        setLoading(true)
        const response = await api.get('/events/', { params: { status: eventTab } })
        const list = response.data || []
        setCompetitions(list)
      } catch (error) {
        setCompetitions([])
      } finally {
        setLoading(false)
      }
    }

    if (hasToken) {
      fetchCompetitions()
    } else {
      setLoading(false)
    }
  }, [eventTab, hasToken])

  const handleLogin = async () => {
    if (!email || !password) return
    try {
      setAuthLoading(true)
      setAuthError('')
      const response = await authAPI.login(email, password)
      const access = response?.data?.tokens?.access
      if (!access) {
        setAuthError('Login failed: no access token returned')
        return
      }
      localStorage.setItem('authToken', access)
      navigate('/dashboard')
    } catch (error) {
      setAuthError('Login failed. Check your credentials.')
    } finally {
      setAuthLoading(false)
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await authAPI.logout()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      localStorage.removeItem('authToken')
      setHasToken(false)
      setEmail('')
      setPassword('')
    }
  }

  return (
    <Box sx={{ backgroundColor: '#fff', minHeight: '100vh' }}>
      <AppBar position="static" elevation={0} sx={{ backgroundColor: '#f5f5f5', color: '#000' }}>
        <Toolbar>
          {hasToken ? (
            <>
              <Typography variant="h6" sx={{ flexGrow: 1 }}>
                FRVV Club Management
              </Typography>
              <Button color="inherit" component={Link} to="/my-enrollments">
                My Enrollments
              </Button>
              <Button color="inherit" onClick={handleLogout}>
                Logout
              </Button>
            </>
          ) : (
            <Typography variant="h6">
              FRVV Club Management
            </Typography>
          )}
        </Toolbar>
      </AppBar>
      <Container sx={{ py: 4 }}>
        {!hasToken ? (
          // Login Screen - Only show login form
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
            <Box sx={{ width: '100%', maxWidth: { xs: '100%', sm: '100%', md: 400 }, px: { xs: 2, sm: 2, md: 0 } }}>
              <Box sx={{ textAlign: 'center', mb: 1 }}>
                <img 
                  src="http://localhost:8000/media/admin-interface/logo/10_AckzvhW.svg"
                  alt="FRVV Logo" 
                  style={{ maxWidth: '150px', height: 'auto' }}
                  onError={(e) => console.log('Image load error:', e)}
                />
              </Box>
              <Stack spacing={2}>
                <TextField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                  fullWidth
                />
                <TextField
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                  fullWidth
                />
                {authError && <Typography color="error" sx={{ textAlign: 'center' }}>{authError}</Typography>}
                <Button 
                  variant="contained" 
                  onClick={handleLogin} 
                  disabled={authLoading}
                  fullWidth
                >
                  {authLoading ? 'Signing in...' : 'Sign in'}
                </Button>
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 3 }}>
                Manage your club athletes and enroll them in competitions.
              </Typography>
            </Box>
          </Box>
        ) : (
          // Authenticated Screen - Show tabs and competitions
          <>
            <Typography variant="h5" gutterBottom>
              Competitions
            </Typography>
            <Tabs
              value={eventTab}
              onChange={(_, value) => setEventTab(value)}
              variant="scrollable"
              allowScrollButtonsMobile
              sx={{ mb: 2 }}
            >
              <Tab value="upcoming" label="Upcoming" />
              <Tab value="ongoing" label="Ongoing" />
              <Tab value="past" label="Past" />
            </Tabs>

            {loading ? (
              <CircularProgress />
            ) : (
              <Grid container spacing={2}>
                {competitions.map((competition) => (
                  <Grid item xs={12} md={6} key={competition.id}>
                    <Card>
                      <CardContent>
                        <Typography variant="h6">{competition.name}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {competition.place}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {competition.start_date}
                        </Typography>
                        {eventTab !== 'past' && (
                          <Button
                            sx={{ mt: 2 }}
                            variant="contained"
                            component={Link}
                            to={`/enroll/${competition.id}`}
                          >
                            Enroll Athletes
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </>
        )}
      </Container>
    </Box>
  )
}

export default HomePage
