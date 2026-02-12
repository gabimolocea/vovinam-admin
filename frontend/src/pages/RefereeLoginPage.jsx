import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api, { competitionAPI, refereeAPI } from '../services/api';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
  Alert,
} from '@mui/material';

const RefereeLoginPage = () => {
  const { login, loading, error, user, isAdmin, isReferee, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [events, setEvents] = React.useState([]);
  const [categories, setCategories] = React.useState([]);
  const [fields, setFields] = React.useState([]);
  const [selectedEventId, setSelectedEventId] = React.useState('');
  const [matches, setMatches] = React.useState([]);
  const hasRedirectedRef = useRef(false);
  const [showDashboard, setShowDashboard] = React.useState(false);
  const [dashboardLoading, setDashboardLoading] = React.useState(false);

  // Load categories and fields if user is logged in
  useEffect(() => {
    if (!isAuthenticated || (!isAdmin && !isReferee)) return;

    if (!hasRedirectedRef.current) {
      if ((isReferee || isAdmin) && location.pathname === '/referee/login') {
        hasRedirectedRef.current = true;
        navigate('/referee/dashboard', { replace: true });
      }
    }

    if (isReferee && !isAdmin) {
      loadRefereeAssignments();
    } else {
      loadEvents();
    }
  }, [isAuthenticated, isAdmin, isReferee, navigate, location.pathname]);

  const loadRefereeAssignments = async () => {
    try {
      setDashboardLoading(true);
      const [catsRes, matchesRes] = await Promise.all([
        refereeAPI.getAssignedCategories(),
        refereeAPI.getAssignedMatches(),
      ]);

      const cats = catsRes?.data?.results || catsRes?.data || [];
      const matchesData = matchesRes?.data?.results || matchesRes?.data || [];
      setCategories(Array.isArray(cats) ? cats : [cats]);
      setMatches(Array.isArray(matchesData) ? matchesData : [matchesData]);

      const fieldNumbers = new Set();
      (Array.isArray(cats) ? cats : [cats]).forEach((cat) => {
        if (cat?.field_number) fieldNumbers.add(cat.field_number);
      });
      (Array.isArray(matchesData) ? matchesData : [matchesData]).forEach((match) => {
        if (match?.field_number) fieldNumbers.add(match.field_number);
      });

      setFields(
        Array.from(fieldNumbers)
          .sort((a, b) => a - b)
          .map((num) => ({ id: `field-${num}`, field_number: num }))
      );
      setShowDashboard(true);
    } catch (err) {
      console.error('Failed to load referee assignments:', err);
      setCategories([]);
      setMatches([]);
      setFields([]);
    } finally {
      setDashboardLoading(false);
    }
  };

  const loadEvents = async () => {
    try {
      setDashboardLoading(true);
      const eventsResponse = competitionAPI.listEvents
        ? await competitionAPI.listEvents()
        : await competitionAPI.list();
      let nextEvents = [];
      if (eventsResponse && eventsResponse.data) {
        nextEvents = Array.isArray(eventsResponse.data) ? eventsResponse.data : [eventsResponse.data];
      } else if (Array.isArray(eventsResponse)) {
        nextEvents = eventsResponse;
      }
      setEvents(nextEvents);
      if (nextEvents.length > 0) {
        const now = new Date();
        const ongoing = nextEvents.find((ev) => {
          const start = ev.start_date ? new Date(ev.start_date) : null;
          const end = ev.end_date ? new Date(ev.end_date) : null;
          if (start && end) return start <= now && now <= end;
          if (start && !end) return start <= now;
          return false;
        });
        if (ongoing) {
          setSelectedEventId(ongoing.id);
        } else {
          const sorted = [...nextEvents].sort((a, b) => {
            const aStart = a.start_date ? new Date(a.start_date).getTime() : 0;
            const bStart = b.start_date ? new Date(b.start_date).getTime() : 0;
            return bStart - aStart;
          });
          setSelectedEventId(sorted[0].id);
        }
      }
      setShowDashboard(true);
    } catch (err) {
      console.error('Failed to load events:', err);
      setEvents([]);
    } finally {
      setDashboardLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedEventId) {
      setCategories([]);
      setFields([]);
      setMatches([]);
      return;
    }

    const event = events.find((ev) => String(ev.id) === String(selectedEventId));
    setCategories(event?.categories || []);

    const loadEventFields = async () => {
      try {
        const fieldsResponse = await api.get('/competition-fields/', {
          params: { event_id: selectedEventId },
        });
        if (fieldsResponse && fieldsResponse.data) {
          setFields(Array.isArray(fieldsResponse.data) ? fieldsResponse.data : [fieldsResponse.data]);
        } else if (Array.isArray(fieldsResponse)) {
          setFields(fieldsResponse);
        } else {
          setFields([]);
        }
      } catch (err) {
        console.warn('Could not load fields:', err);
        setFields([]);
      }
    };

    const loadEventMatches = async () => {
      try {
        const matchesResponse = await api.get('/matches/', {
          params: { event_id: selectedEventId },
        });
        if (matchesResponse && matchesResponse.data) {
          setMatches(Array.isArray(matchesResponse.data) ? matchesResponse.data : [matchesResponse.data]);
        } else if (Array.isArray(matchesResponse)) {
          setMatches(matchesResponse);
        } else {
          setMatches([]);
        }
      } catch (err) {
        console.warn('Could not load matches:', err);
        setMatches([]);
      }
    };

    loadEventFields();
    loadEventMatches();
  }, [selectedEventId, events]);


  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const userData = await login(email, password);
      if (userData?.role === 'admin') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/referee/dashboard', { replace: true });
      }
    } catch (err) {
      console.error('Login failed:', err);
    }
  };

  if (loading) {
    return (
      <Box sx={{ bgcolor: '#fff', minHeight: '100vh', py: 4 }}>
        <Container maxWidth="sm">
          <Paper elevation={0} variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
            <Typography>Loading session...</Typography>
          </Paper>
        </Container>
      </Box>
    );
  }

  // If user is logged in and is admin or referee, show dashboard
  if (isAuthenticated && (isAdmin || isReferee)) {
    if (dashboardLoading) {
      return (
        <Box sx={{ bgcolor: '#fff', minHeight: '100vh', py: 4 }}>
          <Container maxWidth="sm">
            <Paper elevation={0} variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
              <Typography>Loading your dashboard...</Typography>
            </Paper>
          </Container>
        </Box>
      );
    }
    return (
      <Box sx={{ bgcolor: '#fff', minHeight: '100vh', py: { xs: 2, md: 4 } }}>
        <Container maxWidth="lg">
          <Paper elevation={0} variant="outlined" sx={{ p: 3, mb: 3, borderRadius: 2 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between">
              <Box>
                <Typography variant="h4" fontWeight={700} gutterBottom>
                  Referee Dashboard
                </Typography>
                <Typography color="text.secondary" sx={{ mb: 1 }}>
                  Scoring overview and assignments
                </Typography>
                <Chip
                  color={isAdmin ? 'secondary' : 'primary'}
                  label={isAdmin ? 'Administrator' : isReferee ? 'Referee' : user?.role}
                />
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
                {isAdmin && (
                  <Button
                    variant="outlined"
                    onClick={() => navigate('/admin')}
                  >
                    Switch to Admin
                  </Button>
                )}
                <Button
                  variant="contained"
                  color="error"
                  onClick={async () => {
                    await logout();
                    navigate('/referee/login', { replace: true });
                  }}
                >
                  Log out
                </Button>
              </Stack>
            </Stack>
          </Paper>

          {dashboardLoading ? (
            <Paper elevation={0} variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
              <Typography>Loading your assignments...</Typography>
            </Paper>
          ) : (
            <Stack spacing={3}>
              {[1, 2].map((fieldNumber) => {
                const field = fields.find((f) => f.field_number === fieldNumber);
                const fieldId = field?.id;
                const fieldCategories = categories.filter(
                  (cat) => fieldId && String(cat.field_id) === String(fieldId)
                );
                const fieldMatches = matches.filter((m) => m.field_number === fieldNumber);

                return (
                  <Paper elevation={0} variant="outlined" sx={{ p: 3, borderRadius: 2 }} key={fieldNumber}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" sx={{ mb: 2 }} spacing={1.5}>
                      <Box>
                        <Typography variant="h6" fontWeight={600}>Field {fieldNumber}</Typography>
                        <Typography color="text.secondary">Assignments and matches</Typography>
                      </Box>
                      <Chip label={`${fieldCategories.length} Categories`} color="primary" />
                    </Stack>
                    <Divider sx={{ mb: 2 }} />
                    {fieldCategories.length > 0 ? (
                      <Grid container spacing={2}>
                        {fieldCategories.map((category) => (
                          <Grid item xs={12} md={6} lg={4} key={category.id}>
                            <Card variant="outlined" sx={{ height: '100%' }}>
                              <CardContent>
                                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                                  {category.name}
                                </Typography>
                                <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                                  <Chip size="small" label={category.field_status || 'not_started'} />
                                  <Chip size="small" variant="outlined" label={`${category.athletes_count || 0} Athletes`} />
                                </Stack>
                                {isReferee && !isAdmin && (
                                  <Button variant="contained" onClick={() => navigate('/referee/score')}>
                                    Score Athletes
                                  </Button>
                                )}
                              </CardContent>
                            </Card>
                          </Grid>
                        ))}
                      </Grid>
                    ) : (
                      <Alert severity="info">No categories assigned.</Alert>
                    )}

                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Matches</Typography>
                    {fieldMatches.length > 0 ? (
                      <Grid container spacing={2}>
                        {fieldMatches.map((match) => (
                          <Grid item xs={12} md={6} lg={4} key={match.id}>
                            <Card variant="outlined" sx={{ height: '100%' }}>
                              <CardContent>
                                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                                  {match.category_name}
                                </Typography>
                                <Typography color="text.secondary" sx={{ mb: 1 }}>
                                  {match.match_type}
                                </Typography>
                                <Typography color="text.secondary">
                                  {match.red_corner_full_name} vs {match.blue_corner_full_name}
                                </Typography>
                              </CardContent>
                            </Card>
                          </Grid>
                        ))}
                      </Grid>
                    ) : (
                      <Alert severity="info">No matches assigned.</Alert>
                    )}
                  </Paper>
                );
              })}

              {isReferee && !isAdmin && (
                <Box>
                  <Button variant="contained" size="large" onClick={() => navigate('/referee/score')}>
                    Begin Scoring
                  </Button>
                </Box>
              )}
            </Stack>
          )}
        </Container>
      </Box>
    );
  }

  // Show login form if not logged in
  return (
    <Box sx={{ bgcolor: '#fff', minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <Container maxWidth="sm">
        <Paper elevation={0} variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h4" gutterBottom>
                Referee Scoring System
              </Typography>
              <Typography color="text.secondary">
                Referees & Admins — Login to manage scoring
              </Typography>
            </Box>

            {error && <Alert severity="error">{error}</Alert>}

            <Box component="form" onSubmit={handleSubmit} sx={{ display: 'grid', gap: 2 }}>
              <TextField
                id="email"
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                fullWidth
              />
              <TextField
                id="password"
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                fullWidth
              />
              <Button type="submit" variant="contained" size="large" disabled={loading}>
                {loading ? 'Logging in...' : 'Login'}
              </Button>
            </Box>

            <Divider />
            <Typography color="text.secondary">Or scan your QR code for quick access</Typography>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Test Credentials
              </Typography>
              <Typography variant="body2">
                Referee: referee_test / testpass123
              </Typography>
              <Typography variant="body2">
                Admin: admin_test / adminpass123
              </Typography>
            </Paper>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
};

export default RefereeLoginPage;
