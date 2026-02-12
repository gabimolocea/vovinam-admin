import React, { useState } from 'react';
import { competitionAPI } from '../services/api';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Grid,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

/**
 * Field Management Panel - Create and manage competition fields
 */
export default function FieldManagementPanel({ event, fields, onFieldsUpdated }) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    field_number: '',
    location_description: '',
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

      await competitionAPI.createField({
        ...formData,
        event_id: event.id,
      });

      setFormData({
        name: '',
        field_number: '',
        location_description: '',
      });
      setShowForm(false);
      onFieldsUpdated();
    } catch (err) {
      setError(`Failed to create field: ${err.message}`);
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
              <Typography variant="h6" fontWeight={600}>Fields for {event.name || event.title}</Typography>
              <Typography color="text.secondary">Manage event locations and tatamis.</Typography>
            </Box>
            <Button variant={showForm ? 'outlined' : 'contained'} onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancel' : 'Add Field'}
            </Button>
          </Stack>

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
          )}

          {showForm && (
            <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    required
                    label="Field Name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g., Ring A, Mat 1"
                  />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Field Number"
                    name="field_number"
                    value={formData.field_number}
                    onChange={handleInputChange}
                    placeholder="1"
                  />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField
                    fullWidth
                    label="Location"
                    name="location_description"
                    value={formData.location_description}
                    onChange={handleInputChange}
                    placeholder="Hall A"
                  />
                </Grid>
                <Grid item xs={12}>
                  <Button type="submit" variant="contained" disabled={loading}>
                    {loading ? 'Creating...' : 'Add Field'}
                  </Button>
                </Grid>
              </Grid>
            </Box>
          )}
        </CardContent>
      </Card>

      <Divider />

      {fields.length === 0 ? (
        <Alert severity="info">No fields created yet.</Alert>
      ) : (
        <Grid container spacing={2}>
          {fields.map((field) => (
            <Grid item xs={12} md={6} key={field.id}>
              <Card variant="outlined">
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle1" fontWeight={600}>{field.name}</Typography>
                    <Typography color="text.secondary">#{field.field_number}</Typography>
                  </Stack>
                  {field.location_description && (
                    <Typography color="text.secondary" sx={{ mt: 1 }}>📍 {field.location_description}</Typography>
                  )}
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 1 }}>
                    <Typography variant="body2">Active Categories: <strong>{field.categories_count || 0}</strong></Typography>
                    <Typography variant="body2">Referees: <strong>{field.referees_count || 0}</strong></Typography>
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
