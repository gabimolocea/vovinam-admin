import React, { useState } from 'react';
import { competitionAPI } from '../services/api';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

/**
 * Event Setup Panel - Create and manage competitions/events
 */
export default function EventSetupPanel({ events, onEventCreated }) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    location: '',
    start_date: '',
    end_date: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);

      await competitionAPI.createEvent(formData);

      setFormData({
        name: '',
        description: '',
        location: '',
        start_date: '',
        end_date: '',
      });
      setShowForm(false);
      onEventCreated();
    } catch (err) {
      setError(`Failed to create event: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Card variant="outlined">
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between">
            <Box>
              <Typography variant="h6" fontWeight={600}>Events</Typography>
              <Typography color="text.secondary">Create and manage competition events.</Typography>
            </Box>
            <Button variant={showForm ? 'outlined' : 'contained'} onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancel' : 'Create Event'}
            </Button>
          </Stack>

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
          )}

          {showForm && (
            <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    required
                    label="Event Name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g., National Championship 2024"
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    multiline
                    minRows={3}
                    placeholder="Event details..."
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    label="Location"
                    name="location"
                    value={formData.location}
                    onChange={handleInputChange}
                    placeholder="City/Venue"
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    required
                    type="date"
                    label="Start Date"
                    name="start_date"
                    value={formData.start_date}
                    onChange={handleInputChange}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    type="date"
                    label="End Date"
                    name="end_date"
                    value={formData.end_date}
                    onChange={handleInputChange}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Button type="submit" variant="contained" disabled={loading}>
                    {loading ? 'Creating...' : 'Create Event'}
                  </Button>
                </Grid>
              </Grid>
            </Box>
          )}
        </CardContent>
      </Card>

      <Divider />

      {events.length === 0 ? (
        <Alert severity="info">No events created yet.</Alert>
      ) : (
        <Grid container spacing={2}>
          {events.map((event) => (
            <Grid item xs={12} md={6} key={event.id}>
              <Card variant="outlined">
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle1" fontWeight={600}>
                      {event.name || event.title}
                    </Typography>
                    <Chip size="small" label={event.status || 'active'} />
                  </Stack>
                  {event.description && (
                    <Typography color="text.secondary" sx={{ mt: 1 }}>
                      {event.description}
                    </Typography>
                  )}
                  <Stack direction="row" spacing={2} sx={{ mt: 1, flexWrap: 'wrap' }}>
                    {event.location && <Typography variant="body2">📍 {event.location}</Typography>}
                    {event.start_date && (
                      <Typography variant="body2">📅 {new Date(event.start_date).toLocaleDateString()}</Typography>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Stack>
  );
}
