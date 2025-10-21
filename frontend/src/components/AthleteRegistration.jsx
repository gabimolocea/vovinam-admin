import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  Container,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stepper,
  Step,
  StepLabel,
  Avatar,
  IconButton,
  Paper,
  Divider
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  PhotoCamera as PhotoCameraIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import AthleteWorkflowAPI from '../services/athleteWorkflowAPI';

const AthleteRegistration = () => {
  const theme = useTheme();
  const { user, isAthlete, hasPendingAthleteProfile, hasAthleteProfile } = useAuth();
  const navigate = useNavigate();
  
  const [activeStep, setActiveStep] = useState(0);
  const [clubs, setClubs] = useState([]);
  const [cities, setCities] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  
  const [formData, setFormData] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    date_of_birth: null,
    address: '',
    mobile_number: user?.phone_number || '',
    club: '',
    city: user?.city?.id || '',
    previous_experience: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    profile_image: null,
    medical_certificate: null
  });

  const [imagePreview, setImagePreview] = useState(null);
  const [certificateFile, setCertificateFile] = useState(null);

  const steps = [
    'Personal Information',
    'Sport Details', 
    'Emergency Contact',
    'Documents'
  ];

  useEffect(() => {
    // Redirect if user is not an athlete or already has a profile
    if (!isAthlete) {
      navigate('/dashboard');
      return;
    }
    
    if (hasAthleteProfile) {
      navigate('/athlete-profile');
      return;
    }

    loadReferenceData();
  }, [isAthlete, hasAthleteProfile, navigate]);

  const loadReferenceData = async () => {
    setLoadingData(true);
    try {
      const [clubsData, citiesData] = await Promise.all([
        AthleteWorkflowAPI.getClubs(),
        AthleteWorkflowAPI.getCities()
      ]);
      setClubs(clubsData);
      setCities(citiesData);
    } catch (error) {
      console.error('Error loading reference data:', error);
      setErrors({ general: 'Failed to load required data. Please refresh the page.' });
    } finally {
      setLoadingData(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    clearError(name);
  };

  const handleDateChange = (date) => {
    setFormData(prev => ({
      ...prev,
      date_of_birth: date
    }));
    clearError('date_of_birth');
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setErrors(prev => ({ ...prev, profile_image: 'Please select a valid image file' }));
        return;
      }
      
      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        setErrors(prev => ({ ...prev, profile_image: 'Image must be smaller than 5MB' }));
        return;
      }

      setFormData(prev => ({ ...prev, profile_image: file }));
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target.result);
      reader.readAsDataURL(file);
      
      clearError('profile_image');
    }
  };

  const handleCertificateChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type (PDF, images)
      const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!validTypes.includes(file.type)) {
        setErrors(prev => ({ 
          ...prev, 
          medical_certificate: 'Please select a PDF or image file' 
        }));
        return;
      }
      
      // Validate file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        setErrors(prev => ({ 
          ...prev,
          medical_certificate: 'File must be smaller than 10MB' 
        }));
        return;
      }

      setFormData(prev => ({ ...prev, medical_certificate: file }));
      setCertificateFile(file);
      clearError('medical_certificate');
    }
  };

  const clearError = (field) => {
    if (errors[field]) {
      setErrors(prev => {
        const { [field]: removed, ...rest } = prev;
        return rest;
      });
    }
  };

  const removeImage = () => {
    setFormData(prev => ({ ...prev, profile_image: null }));
    setImagePreview(null);
  };

  const removeCertificate = () => {
    setFormData(prev => ({ ...prev, medical_certificate: null }));
    setCertificateFile(null);
  };

  const validateStep = (step) => {
    const newErrors = {};
    
    switch (step) {
      case 0: // Personal Information
        if (!formData.first_name) {
          newErrors.first_name = 'First name is required';
        }
        if (!formData.last_name) {
          newErrors.last_name = 'Last name is required';
        }
        if (!formData.date_of_birth) {
          newErrors.date_of_birth = 'Date of birth is required';
        } else {
          const age = new Date().getFullYear() - formData.date_of_birth.getFullYear();
          if (age < 5 || age > 100) {
            newErrors.date_of_birth = 'Please enter a valid date of birth';
          }
        }
        if (!formData.mobile_number) {
          newErrors.mobile_number = 'Mobile number is required';
        }
        break;
        
      case 1: // Sport Details - All optional
        break;
        
      case 2: // Emergency Contact - All optional but recommended
        break;
        
      case 3: // Documents - All optional
        break;
    }
    
    return newErrors;
  };

  const handleNext = () => {
    const stepErrors = validateStep(activeStep);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
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
    for (let i = 0; i < steps.length; i++) {
      const stepErrors = validateStep(i);
      Object.assign(allErrors, stepErrors);
    }
    
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      // Prepare form data for submission
      const submitData = {
        ...formData,
        date_of_birth: formData.date_of_birth ? 
          formData.date_of_birth.toISOString().split('T')[0] : null,
        // Convert empty strings to null for optional foreign key fields
        club: formData.club || null,
        city: formData.city || null,
        // Convert empty strings to null for optional text fields
        address: formData.address || null,
        mobile_number: formData.mobile_number || null,
        previous_experience: formData.previous_experience || null,
        emergency_contact_name: formData.emergency_contact_name || null,
        emergency_contact_phone: formData.emergency_contact_phone || null
      };

      const result = await AthleteWorkflowAPI.createAthleteProfile(submitData);
      
      // Success - redirect to profile status page
      navigate('/athlete-profile-status');
      
    } catch (error) {
      setErrors({ 
        general: error.message || 'Failed to create athlete profile. Please try again.' 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepContent = (step) => {
    switch (step) {
      case 0:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Personal Information
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
              Please provide your personal details
            </Typography>
            
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
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
              
              <Grid item xs={12} sm={6}>
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
              
              <Grid item xs={12} sm={6}>
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
                        required
                      />
                    )}
                    maxDate={new Date()}
                  />
                </LocalizationProvider>
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Mobile Number"
                  name="mobile_number"
                  value={formData.mobile_number}
                  onChange={handleChange}
                  error={!!errors.mobile_number}
                  helperText={errors.mobile_number}
                  required
                />
              </Grid>
              
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Address"
                  name="address"
                  multiline
                  rows={3}
                  value={formData.address}
                  onChange={handleChange}
                  error={!!errors.address}
                  helperText={errors.address}
                />
              </Grid>
            </Grid>
          </Box>
        );

      case 1:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Sport Details
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
              Information about your martial arts background
            </Typography>
            
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Club</InputLabel>
                  <Select
                    name="club"
                    value={formData.club}
                    onChange={handleChange}
                    label="Club"
                    disabled={loadingData}
                  >
                    <MenuItem value="">
                      <em>None</em>
                    </MenuItem>
                    {clubs.map((club) => (
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
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    label="City"
                    disabled={loadingData}
                  >
                    <MenuItem value="">
                      <em>None</em>
                    </MenuItem>
                    {cities.map((city) => (
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
                  label="Previous Experience"
                  name="previous_experience"
                  multiline
                  rows={4}
                  value={formData.previous_experience}
                  onChange={handleChange}
                  helperText="Describe your previous martial arts experience, training, competitions, etc."
                />
              </Grid>
            </Grid>
          </Box>
        );

      case 2:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Emergency Contact
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
              Person to contact in case of emergency during competitions
            </Typography>
            
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Emergency Contact Name"
                  name="emergency_contact_name"
                  value={formData.emergency_contact_name}
                  onChange={handleChange}
                />
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Emergency Contact Phone"
                  name="emergency_contact_phone"
                  value={formData.emergency_contact_phone}
                  onChange={handleChange}
                />
              </Grid>
            </Grid>
          </Box>
        );

      case 3:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Documents
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
              Upload your profile image and medical certificate (optional)
            </Typography>
            
            <Grid container spacing={3}>
              {/* Profile Image Upload */}
              <Grid item xs={12} sm={6}>
                <Paper sx={{ p: 3, textAlign: 'center', border: '2px dashed #ccc' }}>
                  <Typography variant="subtitle1" gutterBottom>
                    Profile Image
                  </Typography>
                  
                  {imagePreview ? (
                    <Box>
                      <Avatar
                        src={imagePreview}
                        sx={{ width: 100, height: 100, mx: 'auto', mb: 2 }}
                      />
                      <Box>
                        <Button
                          startIcon={<DeleteIcon />}
                          onClick={removeImage}
                          color="error"
                          size="small"
                        >
                          Remove
                        </Button>
                      </Box>
                    </Box>
                  ) : (
                    <Box>
                      <PhotoCameraIcon sx={{ fontSize: 48, color: 'grey.400', mb: 2 }} />
                      <input
                        accept="image/*"
                        style={{ display: 'none' }}
                        id="profile-image-upload"
                        type="file"
                        onChange={handleImageChange}
                      />
                      <label htmlFor="profile-image-upload">
                        <Button variant="outlined" component="span">
                          Upload Image
                        </Button>
                      </label>
                    </Box>
                  )}
                  
                  {errors.profile_image && (
                    <Typography color="error" variant="caption" display="block" sx={{ mt: 1 }}>
                      {errors.profile_image}
                    </Typography>
                  )}
                </Paper>
              </Grid>

              {/* Medical Certificate Upload */}
              <Grid item xs={12} sm={6}>
                <Paper sx={{ p: 3, textAlign: 'center', border: '2px dashed #ccc' }}>
                  <Typography variant="subtitle1" gutterBottom>
                    Medical Certificate
                  </Typography>
                  
                  {certificateFile ? (
                    <Box>
                      <Typography variant="body2" sx={{ mb: 2 }}>
                        {certificateFile.name}
                      </Typography>
                      <Button
                        startIcon={<DeleteIcon />}
                        onClick={removeCertificate}
                        color="error"
                        size="small"
                      >
                        Remove
                      </Button>
                    </Box>
                  ) : (
                    <Box>
                      <CloudUploadIcon sx={{ fontSize: 48, color: 'grey.400', mb: 2 }} />
                      <input
                        accept=".pdf,image/*"
                        style={{ display: 'none' }}
                        id="medical-certificate-upload"
                        type="file"
                        onChange={handleCertificateChange}
                      />
                      <label htmlFor="medical-certificate-upload">
                        <Button variant="outlined" component="span">
                          Upload Certificate
                        </Button>
                      </label>
                      <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                        PDF or Image files only
                      </Typography>
                    </Box>
                  )}
                  
                  {errors.medical_certificate && (
                    <Typography color="error" variant="caption" display="block" sx={{ mt: 1 }}>
                      {errors.medical_certificate}
                    </Typography>
                  )}
                </Paper>
              </Grid>
            </Grid>
          </Box>
        );

      default:
        return null;
    }
  };

  if (!isAthlete) {
    return (
      <Container maxWidth="sm">
        <Alert severity="warning" sx={{ mt: 4 }}>
          You must be registered as an athlete to access this page.
        </Alert>
      </Container>
    );
  }

  if (loadingData) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container component="main" maxWidth="md">
      <Box sx={{ py: 4 }}>
        <Card sx={{ boxShadow: theme.shadows[3] }}>
          <CardContent sx={{ p: 4 }}>
            <Typography
              variant="h4"
              component="h1"
              gutterBottom
              align="center"
              sx={{ color: theme.palette.primary.main, fontWeight: 'bold', mb: 3 }}
            >
              Create Athlete Profile
            </Typography>

            <Typography variant="body1" align="center" sx={{ mb: 4 }}>
              Complete your athlete profile to participate in competitions. 
              Your profile will be reviewed by administrators before approval.
            </Typography>

            <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
              {steps.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>

            {errors.general && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {errors.general}
              </Alert>
            )}

            <form onSubmit={handleSubmit}>
              {renderStepContent(activeStep)}

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
                      {isSubmitting ? <CircularProgress size={24} /> : 'Submit Profile'}
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
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
};

export default AthleteRegistration;