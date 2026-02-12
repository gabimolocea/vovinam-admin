import React, { useState, useEffect } from 'react';
import { competitionAPI } from '../services/api';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

/**
 * Referee Assignment Panel - Assign categories to fields
 */
export default function RefereeAssignmentPanel({ event, fields, onAssignmentUpdated }) {
  const [showAssignment, setShowAssignment] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [selectedField, setSelectedField] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load assignments when component mounts
  useEffect(() => {
    loadAssignments();
    loadCategories();
  }, [event.id]);

  const getEventId = () => {
    const raw = event?.id;
    if (raw === undefined || raw === null) return null;
    const normalized = String(raw).split(':')[0];
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const loadAssignments = async () => {
    try {
      const eventId = getEventId();
      if (!eventId) {
        setAssignments([]);
        return;
      }
      if (!competitionAPI.listAssignments) {
        setAssignments([]);
        return;
      }
      const response = await competitionAPI.listAssignments(eventId);
      const data = response?.data ?? response ?? [];
      setAssignments(Array.isArray(data) ? data : [data]);
    } catch (err) {
      setError(`Failed to load assignments: ${err.message}`);
    }
  };

  const loadCategories = async () => {
    try {
      const eventId = getEventId();
      if (!eventId) {
        setCategories([]);
        return;
      }
      if (!competitionAPI.listCategories) {
        setCategories([]);
        return;
      }
      const response = await competitionAPI.listCategories(eventId);
      const data = response?.data ?? response ?? [];
      setCategories(Array.isArray(data) ? data : [data]);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!selectedField || !selectedCategory) {
      setError('Please select field and category');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (!competitionAPI.createAssignment) {
        setError('Referee assignment API is not available.');
        return;
      }
      await competitionAPI.createAssignment({
        field: parseInt(selectedField),
        category: parseInt(selectedCategory),
      });

      setSelectedField('');
      setSelectedCategory('');
      setShowAssignment(false);
      loadAssignments();
      onAssignmentUpdated();
    } catch (err) {
      setError(`Failed to assign referee: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getFieldName = (id) => {
    const field = fields.find(f => f.id === id);
    return field ? field.name : 'Unknown';
  };

  const getCategoryName = (id) => {
    const cat = categories.find(c => c.id === id);
    return cat ? cat.name : 'Unknown';
  };

  return (
    <Stack spacing={2}>
      <Card variant="outlined">
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between">
            <Box>
              <Typography variant="h6" fontWeight={600}>Category Field Assignments</Typography>
              <Typography color="text.secondary">Assign categories to fields for scheduling.</Typography>
            </Box>
            <Button variant={showAssignment ? 'outlined' : 'contained'} onClick={() => setShowAssignment(!showAssignment)}>
              {showAssignment ? 'Cancel' : 'New Assignment'}
            </Button>
          </Stack>

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
          )}

          {showAssignment && (
            <Box component="form" onSubmit={handleAssign} sx={{ mt: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={5}>
                  <FormControl fullWidth required>
                    <InputLabel>Field</InputLabel>
                    <Select
                      value={selectedField}
                      label="Field"
                      onChange={(e) => setSelectedField(e.target.value)}
                    >
                      <MenuItem value="">Select Field</MenuItem>
                      {fields.map((field) => (
                        <MenuItem key={field.id} value={field.id}>
                          {field.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={5}>
                  <FormControl fullWidth required>
                    <InputLabel>Category</InputLabel>
                    <Select
                      value={selectedCategory}
                      label="Category"
                      onChange={(e) => setSelectedCategory(e.target.value)}
                    >
                      <MenuItem value="">Select Category</MenuItem>
                      {categories.map((cat) => (
                        <MenuItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={2} sx={{ display: 'flex', alignItems: 'center' }}>
                  <Button type="submit" variant="contained" fullWidth disabled={loading}>
                    {loading ? 'Assigning...' : 'Assign'}
                  </Button>
                </Grid>
              </Grid>
            </Box>
          )}
        </CardContent>
      </Card>

      <Divider />

      {assignments.length === 0 ? (
        <Alert severity="info">No assignments yet.</Alert>
      ) : (
        <Card variant="outlined">
          <CardContent>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Field</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {assignments.map((assignment) => (
                  <TableRow key={assignment.id}>
                    <TableCell>{assignment.field_name || getFieldName(assignment.field_id || assignment.field)}</TableCell>
                    <TableCell>{assignment.category_name || getCategoryName(assignment.category_id || assignment.category)}</TableCell>
                    <TableCell>{assignment.status || 'Active'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
