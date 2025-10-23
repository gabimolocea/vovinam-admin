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
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import axios from './Axios';

const CreateSeminarParticipation = ({ open, onClose, onSuccess, trainingSeminars = [] }) => {
  const [formData, setFormData] = useState({
    seminar: '',
    participation_certificate: null,
    participation_document: null,
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

  const handleFileChange = (field, file) => {
    setFormData(prev => ({
      ...prev,
      [field]: file
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const submitFormData = new FormData();
      
      // Add text fields
      submitFormData.append('seminar', formData.seminar);
      if (formData.notes) {
        submitFormData.append('notes', formData.notes);
      }
      
      // Add files if present
      if (formData.participation_certificate) {
        submitFormData.append('participation_certificate', formData.participation_certificate);
      }
      if (formData.participation_document) {
        submitFormData.append('participation_document', formData.participation_document);
      }

      await axios.post('seminar-submissions/', submitFormData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      onSuccess('Seminar participation submitted successfully and is pending admin approval');
      onClose();
      
      // Reset form
      setFormData({
        seminar: '',
        participation_certificate: null,
        participation_document: null,
        notes: ''
      });
    } catch (err) {
      console.error('Error submitting seminar participation:', err);
      setError(err.response?.data?.detail || 'Failed to submit seminar participation');
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
        Submit Training Seminar Participation
      </DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            Submit your training seminar participation for admin approval
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {error && (
              <Alert severity="error" onClose={() => setError('')}>
                {error}
              </Alert>
            )}

            <FormControl fullWidth required>
              <InputLabel>Training Seminar</InputLabel>
              <Select
                value={formData.seminar}
                onChange={(e) => handleChange('seminar', e.target.value)}
                label="Training Seminar"
              >
                {trainingSeminars && trainingSeminars.length > 0 ? (
                  trainingSeminars.map((seminar) => (
                    <MenuItem key={seminar.id} value={seminar.id}>
                      {seminar.name} - {new Date(seminar.start_date).toLocaleDateString()} to {new Date(seminar.end_date).toLocaleDateString()}
                    </MenuItem>
                  ))
                ) : (
                  <MenuItem disabled>No training seminars available</MenuItem>
                )}
              </Select>
            </FormControl>

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Participation Certificate
              </Typography>
              <Button
                variant="outlined"
                component="label"
                fullWidth
                sx={{ mb: 1 }}
              >
                {formData.participation_certificate ? formData.participation_certificate.name : 'Upload Certificate'}
                <input
                  type="file"
                  hidden
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={(e) => handleFileChange('participation_certificate', e.target.files[0])}
                />
              </Button>
              <Typography variant="caption" color="textSecondary">
                Upload your participation certificate (PDF, images, or documents)
              </Typography>
            </Box>

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Additional Documentation
              </Typography>
              <Button
                variant="outlined"
                component="label"
                fullWidth
                sx={{ mb: 1 }}
              >
                {formData.participation_document ? formData.participation_document.name : 'Upload Document (Optional)'}
                <input
                  type="file"
                  hidden
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={(e) => handleFileChange('participation_document', e.target.files[0])}
                />
              </Button>
              <Typography variant="caption" color="textSecondary">
                Upload any additional documentation (Optional)
              </Typography>
            </Box>

            <TextField
              label="Notes"
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              fullWidth
              multiline
              rows={3}
              placeholder="Any additional information about your participation"
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
            disabled={loading || !formData.seminar}
          >
            {loading ? 'Submitting...' : 'Submit for Approval'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default CreateSeminarParticipation;