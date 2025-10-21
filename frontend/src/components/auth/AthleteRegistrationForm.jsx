// Frontend Components for Athlete Registration Workflow

// 1. AthleteRegistrationForm.jsx
import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, TextField, Button, Stepper, Step, StepLabel,
  Select, MenuItem, FormControl, InputLabel, Grid, Alert, CircularProgress
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AxiosInstance from './Axios';

const AthleteRegistrationForm = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [clubs, setClubs] = useState([]);
  const [cities, setCities] = useState([]);
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    // User data
    username: '',
    email: '',
    password: '',
    password_confirm: '',
    first_name: '',
    last_name: '',
    phone_number: '',
    date_of_birth: '',
    city: '',
    
    // Athlete profile data
    athlete_date_of_birth: '',
    address: '',
    mobile_number: '',
    club: '',
    athlete_city: '',
    previous_experience: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    profile_image: null,
    medical_certificate: null,
  });

  const steps = ['Personal Information', 'Athlete Details', 'Emergency Contact', 'Documents'];

  useEffect(() => {
    fetchClubsAndCities();
  }, []);

  const fetchClubsAndCities = async () => {
    try {
      const [clubsRes, citiesRes] = await Promise.all([
        AxiosInstance.get('/club/'),
        AxiosInstance.get('/city/')
      ]);
      setClubs(clubsRes.data);
      setCities(citiesRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: files ? files[0] : value
    }));
  };

  const handleNext = () => {
    setActiveStep(prev => prev + 1);
  };

  const handleBack = () => {
    setActiveStep(prev => prev - 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const submitData = new FormData();
      Object.keys(formData).forEach(key => {
        if (formData[key]) {
          submitData.append(key, formData[key]);
        }
      });

      const response = await AxiosInstance.post('/auth/register/athlete/', submitData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      // Store tokens
      localStorage.setItem('access_token', response.data.tokens.access);
      localStorage.setItem('refresh_token', response.data.tokens.refresh);
      
      // Redirect to status page
      navigate('/athlete-profile-status');
    } catch (error) {
      setError(error.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = (step) => {
    switch (step) {
      case 0:
        return (
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                name="first_name"
                label="First Name"
                value={formData.first_name}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                name="last_name"
                label="Last Name"
                value={formData.last_name}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                name="email"
                label="Email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                name="username"
                label="Username"
                value={formData.username}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                name="password"
                label="Password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                name="password_confirm"
                label="Confirm Password"
                type="password"
                value={formData.password_confirm}
                onChange={handleChange}
                required
              />
            </Grid>
          </Grid>
        );
      
      case 1:
        return (
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                name="athlete_date_of_birth"
                label="Date of Birth"
                type="date"
                value={formData.athlete_date_of_birth}
                onChange={handleChange}
                InputLabelProps={{ shrink: true }}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                name="mobile_number"
                label="Mobile Number"
                value={formData.mobile_number}
                onChange={handleChange}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                name="address"
                label="Address"
                multiline
                rows={3}
                value={formData.address}
                onChange={handleChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Club</InputLabel>
                <Select
                  name="club"
                  value={formData.club}
                  onChange={handleChange}
                >
                  {clubs.map(club => (
                    <MenuItem key={club.id} value={club.id}>
                      {club.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>City</InputLabel>
                <Select
                  name="athlete_city"
                  value={formData.athlete_city}
                  onChange={handleChange}
                >
                  {cities.map(city => (
                    <MenuItem key={city.id} value={city.id}>
                      {city.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                name="previous_experience"
                label="Previous Martial Arts Experience"
                multiline
                rows={3}
                value={formData.previous_experience}
                onChange={handleChange}
                placeholder="Describe any previous martial arts training..."
              />
            </Grid>
          </Grid>
        );
      
      case 2:
        return (
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                name="emergency_contact_name"
                label="Emergency Contact Name"
                value={formData.emergency_contact_name}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                name="emergency_contact_phone"
                label="Emergency Contact Phone"
                value={formData.emergency_contact_phone}
                onChange={handleChange}
                required
              />
            </Grid>
          </Grid>
        );
      
      case 3:
        return (
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Profile Image (Optional)
              </Typography>
              <input
                type="file"
                name="profile_image"
                accept="image/*"
                onChange={handleChange}
                style={{ marginBottom: 16 }}
              />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Medical Certificate (Optional)
              </Typography>
              <input
                type="file"
                name="medical_certificate"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={handleChange}
              />
            </Grid>
          </Grid>
        );
      
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
      <Card>
        <CardContent>
          <Typography variant="h4" gutterBottom>
            Athlete Registration
          </Typography>
          
          <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
            {steps.map(label => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            {renderStepContent(activeStep)}
            
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
              <Button
                disabled={activeStep === 0}
                onClick={handleBack}
              >
                Back
              </Button>
              
              {activeStep === steps.length - 1 ? (
                <Button
                  type="submit"
                  variant="contained"
                  disabled={loading}
                >
                  Submit Registration
                </Button>
              ) : (
                <Button
                  variant="contained"
                  onClick={handleNext}
                >
                  Next
                </Button>
              )}
            </Box>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
};

export default AthleteRegistrationForm;