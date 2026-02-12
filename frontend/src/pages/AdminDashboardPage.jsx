import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useCompetition } from '../contexts/CompetitionContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { competitionAPI, adminAPI } from '../services/api';
import EventSetupPanel from '../components/EventSetupPanel';
import FieldManagementPanel from '../components/FieldManagementPanel';
import RefereeAssignmentPanel from '../components/RefereeAssignmentPanel';
import LiveScoresTracker from '../components/LiveScoresTracker';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  FormControl,
  Grid,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  ThemeProvider,
  Typography,
  createTheme,
} from '@mui/material';

/**
 * Admin Dashboard - Main control panel for event management
 * Shows event setup, field management, referee assignment, and live scores
 */
export default function AdminDashboardPage() {
  const { user, logout } = useAuth();
  const { currentEvent, setEvent } = useCompetition();
  const { isConnected } = useWebSocket();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [fields, setFields] = useState([]);
  const [referees, setReferees] = useState([]);
  const [liveStats, setLiveStats] = useState(null);
  const [error, setError] = useState(null);

  const lightTheme = useMemo(
    () =>
      createTheme({
        palette: { mode: 'light' },
        shape: { borderRadius: 12 },
      }),
    []
  );

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const listEventsFn = competitionAPI.listEvents || competitionAPI.list;
      const listRefereesFn = adminAPI.listReferees;

      const [eventsResponse, refereesResponse] = await Promise.all([
        listEventsFn ? listEventsFn() : Promise.resolve([]),
        listRefereesFn ? listRefereesFn() : Promise.resolve([]),
      ]);

      const eventsData = eventsResponse?.data ?? eventsResponse ?? [];
      const refereesData = refereesResponse?.data ?? refereesResponse ?? [];

      setEvents(Array.isArray(eventsData) ? eventsData : [eventsData]);
      setReferees(Array.isArray(refereesData) ? refereesData : [refereesData]);

      if ((Array.isArray(eventsData) ? eventsData : [eventsData]).length > 0 && !currentEvent) {
        setEvent((Array.isArray(eventsData) ? eventsData : [eventsData])[0]);
      }
    } catch (err) {
      setError(`Failed to load dashboard: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadEventFields = async (eventId) => {
    try {
      const listFieldsFn = competitionAPI.listFields || competitionAPI.getFields;
      const fieldsResponse = listFieldsFn ? await listFieldsFn(eventId) : [];
      const fieldsData = fieldsResponse?.data ?? fieldsResponse ?? [];
      setFields(Array.isArray(fieldsData) ? fieldsData : [fieldsData]);
    } catch (err) {
      setError(`Failed to load fields: ${err.message}`);
    }
  };

  const loadLiveStats = async (eventId) => {
    try {
      if (!adminAPI.getEventStats) {
        setLiveStats(null);
        return;
      }
      const statsResponse = await adminAPI.getEventStats(eventId);
      const statsData = statsResponse?.data ?? statsResponse ?? null;
      setLiveStats(statsData);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  useEffect(() => {
    if (currentEvent) {
      loadEventFields(currentEvent.id);
      loadLiveStats(currentEvent.id);
      const interval = setInterval(() => loadLiveStats(currentEvent.id), 10000);
      return () => clearInterval(interval);
    }
  }, [currentEvent]);

  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Stack alignItems="center" spacing={2}>
          <CircularProgress />
          <Typography color="text.secondary">Loading dashboard...</Typography>
        </Stack>
      </Container>
    );
  }

  if (!(user?.is_admin || user?.role === 'admin')) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Alert severity="error">
          <Typography variant="h6">Access Denied</Typography>
          <Typography>You must be an administrator to access this page.</Typography>
        </Alert>
      </Container>
    );
  }

  return (
    <ThemeProvider theme={lightTheme}>
      <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', py: { xs: 2, md: 4 } }}>
        <Container maxWidth="lg">
          <Stack spacing={3}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={2}
              alignItems={{ xs: 'flex-start', md: 'center' }}
              justifyContent="space-between"
            >
              <Box>
                <Typography variant="h4" fontWeight={700} gutterBottom>
                  Admin Dashboard
                </Typography>
                <Typography color="text.secondary">
                  Event management and live monitoring
                </Typography>
              </Box>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <Chip
                  label={isConnected ? 'Connected' : 'Offline'}
                  color={isConnected ? 'success' : 'warning'}
                  variant="outlined"
                  sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}
                />
                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <Select
                    value={currentEvent?.id || ''}
                    displayEmpty
                    onChange={(e) => {
                      const event = events.find(ev => ev.id === parseInt(e.target.value));
                      setEvent(event);
                    }}
                  >
                    <MenuItem value="">Select Event</MenuItem>
                    {events.map(event => (
                      <MenuItem key={event.id} value={event.id}>
                        {event.name || event.title}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="outlined"
                  onClick={() => navigate('/referee/dashboard')}
                >
                  Switch to Referee
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  onClick={() => logout()}
                >
                  Log out
                </Button>
              </Stack>
            </Stack>

            {error && (
              <Alert severity="error" action={<Button onClick={() => setError(null)}>Dismiss</Button>}>
                {error}
              </Alert>
            )}


            {/* You can add any admin dashboard content here, but tabs are removed as requested. */}
          </Stack>
        </Container>
      </Box>
    </ThemeProvider>
  );
}
