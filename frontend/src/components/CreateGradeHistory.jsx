import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import axios from './Axios';

const CreateGradeHistory = ({ open, onClose, onSuccess, grades = [] }) => {
  const [formData, setFormData] = useState({
    grade: '',
    examination_date: null,
    location: '',
    examiner_name: '',
    certificate_number: '',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const submitData = {
        ...formData,
        examination_date: formData.examination_date?.toISOString().split('T')[0] || null
      };

      await axios.post('grade-submissions/', submitData);
      
      onSuccess('Grade history submitted successfully and is pending admin approval');
      onClose();
      
      // Reset form
      setFormData({
        grade: '',
        examination_date: null,
        location: '',
        examiner_name: '',
        certificate_number: '',
        notes: ''
      });
    } catch (err) {
      console.error('Error submitting grade history:', err);
      setError(err.response?.data?.detail || 'Failed to submit grade history');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Typography variant="h6">Submit Grade Examination</Typography>
        <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
          Submit your grade examination for admin approval
        </Typography>
      </DialogTitle>
      
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {error && (
              <Alert severity="error" onClose={() => setError('')}>
                {error}
              </Alert>
            )}

            <FormControl fullWidth required>
              <InputLabel>Grade</InputLabel>
              <Select
                value={formData.grade}
                onChange={(e) => handleChange('grade', e.target.value)}
                label="Grade"
              >
                {grades.map((grade) => (
                  <MenuItem key={grade.id} value={grade.id}>
                    {grade.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DatePicker
                label="Examination Date *"
                value={formData.examination_date}
                onChange={(date) => handleChange('examination_date', date)}
                renderInput={(params) => (
                  <TextField {...params} fullWidth required />
                )}
                maxDate={new Date()}
              />
            </LocalizationProvider>

            <TextField
              label="Location"
              value={formData.location}
              onChange={(e) => handleChange('location', e.target.value)}
              fullWidth
              required
              placeholder="City, Country or Venue"
            />

            <TextField
              label="Examiner Name"
              value={formData.examiner_name}
              onChange={(e) => handleChange('examiner_name', e.target.value)}
              fullWidth
              required
              placeholder="Name of the examining instructor"
            />

            <TextField
              label="Certificate Number"
              value={formData.certificate_number}
              onChange={(e) => handleChange('certificate_number', e.target.value)}
              fullWidth
              placeholder="Certificate or document number (if applicable)"
            />

            <TextField
              label="Additional Notes"
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              fullWidth
              multiline
              rows={3}
              placeholder="Any additional information about the examination"
            />
          </Box>
        </DialogContent>
        
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            variant="contained" 
            disabled={loading || !formData.grade || !formData.examination_date || !formData.location || !formData.examiner_name}
          >
            {loading ? 'Submitting...' : 'Submit for Approval'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default CreateGradeHistory;