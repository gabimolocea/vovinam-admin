import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
  Alert,
  Link,
  CircularProgress,
  Container,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Radio,
  RadioGroup,
  FormLabel,
  Divider,
  Stepper,
  Step,
  StepLabel
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import AthleteWorkflowAPI from '../services/athleteWorkflowAPI';

const EnhancedRegister = () => {
  const theme = useTheme();
  const { register, loading } = useAuth();
  const navigate = useNavigate();
  
  const [activeStep, setActiveStep] = useState(0);
  const [cities, setCities] = useState([]);
  const [loadingCities, setLoadingCities] = useState(false);
  
  const [formData, setFormData] = useState({
    // Basic user data
    username: '',
    email: '',
    first_name: '',
    last_name: '',
    password: '',
    password_confirm: '',
    
    // Enhanced user data
    role: '', // 'athlete' or 'supporter'
    phone_number: '',
    date_of_birth: null,
    city: ''
  });
  
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const steps = ['Choose Role', 'Basic Information', 'Additional Details'];

  useEffect(() => {
    loadCities();
  }, []);

  const loadCities = async () => {
    setLoadingCities(true);
    try {
      const citiesData = await AthleteWorkflowAPI.getCities();
      setCities(citiesData);
    } catch (error) {
      console.error('Error loading cities:', error);
    } finally {
      setLoadingCities(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleDateChange = (date) => {
    setFormData(prev => ({
      ...prev,
      date_of_birth: date
    }));
    if (errors.date_of_birth) {
      setErrors(prev => ({
        ...prev,
        date_of_birth: ''
      }));
    }
  };

  const validateStep = (step) => {
    const newErrors = {};
    
    if (step === 0) {
      // Role selection
      if (!formData.role) {
        newErrors.role = 'Please select your role';
      }
    } else if (step === 1) {
      // Basic information
      if (!formData.username) {
        newErrors.username = 'Username is required';
      } else if (formData.username.length < 3) {
        newErrors.username = 'Username must be at least 3 characters';
      }
      
      if (!formData.email) {
        newErrors.email = 'Email is required';
      } else if (!/\\S+@\\S+\\.\\S+/.test(formData.email)) {
        newErrors.email = 'Email is invalid';
      }
      
      if (!formData.first_name) {
        newErrors.first_name = 'First name is required';
      }
      
      if (!formData.last_name) {
        newErrors.last_name = 'Last name is required';
      }
      
      if (!formData.password) {
        newErrors.password = 'Password is required';
      } else if (formData.password.length < 6) {
        newErrors.password = 'Password must be at least 6 characters';
      }
      
      if (!formData.password_confirm) {
        newErrors.password_confirm = 'Please confirm your password';
      } else if (formData.password !== formData.password_confirm) {
        newErrors.password_confirm = 'Passwords do not match';
      }
    }
    // Step 2 (Additional Details) validation is optional
    
    return newErrors;
  };

  const handleNext = () => {
    const validationErrors = validateStep(activeStep);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    
    setErrors({});
    setActiveStep(prev => prev + 1);
  };

  const handleBack = () => {
    setActiveStep(prev => prev - 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate all required steps
    const allErrors = {};
    for (let i = 0; i <= 1; i++) {
      const stepErrors = validateStep(i);
      Object.assign(allErrors, stepErrors);
    }
    
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    // Prepare data for submission
    const submitData = {
      ...formData,
      date_of_birth: formData.date_of_birth ? formData.date_of_birth.toISOString().split('T')[0] : null,
      // Convert empty strings to null for optional fields
      phone_number: formData.phone_number || null,
      city: formData.city || null
    };

    const result = await register(submitData);
    
    if (result.success) {
      // Redirect based on role
      if (formData.role === 'athlete') {
        navigate('/athlete-registration'); // Go to athlete profile creation
      } else if (formData.role === 'supporter') {
        navigate('/dashboard'); // Go to supporter dashboard
      } else {
        navigate('/'); // Default dashboard
      }
    } else {
      setErrors(result.error);
    }
    
    setIsSubmitting(false);
  };

  const renderStepContent = (step) => {
    switch (step) {
      case 0:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Choose Your Role
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
              Please select how you'll be using the system
            </Typography>
            
            <FormControl component="fieldset" error={!!errors.role}>
              <FormLabel component="legend">I am registering as:</FormLabel>
              <RadioGroup
                value={formData.role}
                onChange={handleChange}
                name="role"
                sx={{ mt: 2 }}
              >
                <FormControlLabel
                  value="athlete"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="subtitle1">Athlete</Typography>
                      <Typography variant="body2" color="textSecondary">
                        I am an athlete and want to register my profile for competitions
                      </Typography>
                    </Box>
                  }
                />
                <FormControlLabel
                  value="supporter"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="subtitle1">Supporter (Parent/Guardian)</Typography>
                      <Typography variant="body2" color="textSecondary">
                        I am a parent/guardian and want to manage athlete profiles
                      </Typography>
                    </Box>
                  }
                />
              </RadioGroup>
            </FormControl>
            {errors.role && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {errors.role}
              </Alert>
            )}
          </Box>
        );

      case 1:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Basic Information
            </Typography>
            
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Username"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  error={!!errors.username}
                  helperText={errors.username}
                  required
                />
              </Grid>
              
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Email Address"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  error={!!errors.email}
                  helperText={errors.email}
                  required
                />
              </Grid>
              
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="First Name"
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleChange}
                  error={!!errors.first_name}
                  helperText={errors.first_name}
                  required
                />
              </Grid>
              
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Last Name"
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleChange}
                  error={!!errors.last_name}
                  helperText={errors.last_name}
                  required
                />
              </Grid>
              
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                  error={!!errors.password}
                  helperText={errors.password}
                  required
                />
              </Grid>
              
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Confirm Password"
                  name="password_confirm"
                  type="password"
                  value={formData.password_confirm}
                  onChange={handleChange}
                  error={!!errors.password_confirm}
                  helperText={errors.password_confirm}
                  required
                />
              </Grid>
            </Grid>
          </Box>
        );

      case 2:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Additional Details
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
              These details are optional but help us provide better service
            </Typography>
            
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Phone Number"
                  name="phone_number"
                  value={formData.phone_number}
                  onChange={handleChange}
                  error={!!errors.phone_number}
                  helperText={errors.phone_number}
                />
              </Grid>
              
              <Grid item xs={12}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <DatePicker
                    label="Date of Birth"
                    value={formData.date_of_birth}
                    onChange={handleDateChange}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        fullWidth
                        error={!!errors.date_of_birth}
                        helperText={errors.date_of_birth}
                      />
                    )}
                  />
                </LocalizationProvider>
              </Grid>
              
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>City</InputLabel>
                  <Select
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    label="City"
                    disabled={loadingCities}
                  >
                    {cities.map((city) => (
                      <MenuItem key={city.id} value={city.id}>
                        {city.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Box>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <Box 
        display="flex" 
        justifyContent="center" 
        alignItems="center" 
        minHeight="100vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container component="main" maxWidth="md">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          py: 3
        }}
      >
        <Card
          sx={{
            maxWidth: 700,
            width: '100%',
            boxShadow: theme.shadows[3],
            borderRadius: theme.shape.borderRadius
          }}
        >
          <CardContent sx={{ p: 4 }}>
            <Typography
              variant="h4"
              component="h1"
              gutterBottom
              align="center"
              sx={{
                color: theme.palette.primary.main,
                fontWeight: 'bold',
                mb: 3
              }}
            >
              Create Account
            </Typography>

            <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
              {steps.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>

            <form onSubmit={handleSubmit}>
              {renderStepContent(activeStep)}

              {/* Display general errors */}
              {typeof errors === 'string' && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {errors}
                </Alert>
              )}
              
              {typeof errors === 'object' && errors.non_field_errors && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {errors.non_field_errors.join(', ')}
                </Alert>
              )}

              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
                <Button
                  disabled={activeStep === 0}
                  onClick={handleBack}
                  variant="outlined"
                >
                  Back
                </Button>
                
                <Box>
                  {activeStep === steps.length - 1 ? (
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={isSubmitting}
                      sx={{ minWidth: 120 }}
                    >
                      {isSubmitting ? <CircularProgress size={24} /> : 'Register'}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleNext}
                      variant="contained"
                    >
                      Next
                    </Button>
                  )}
                </Box>
              </Box>
            </form>

            <Divider sx={{ my: 3 }} />
            
            <Typography align="center" variant="body2">
              Already have an account?{' '}
              <Link component={RouterLink} to="/login">
                Sign in here
              </Link>
            </Typography>
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
};

export default EnhancedRegister;