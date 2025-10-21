import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Typography,
  Button,
  Alert,
  Avatar,
  Grid,
  Divider,
  Chip,
  IconButton
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../contexts/AuthContext';
import { Person, AdminPanelSettings, Email, Badge, ArrowBack, Logout } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

const Profile = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user, updateProfile, isAdmin, logout } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [formData, setFormData] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    email: user?.email || '',
    username: user?.username || ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleSave = async () => {
    setLoading(true);
    setMessage('');

    try {
      const result = await updateProfile(formData);
      
      if (result.success) {
        setMessage('Profile updated successfully!');
        setIsEditing(false);
      } else {
        const errorMessage = typeof result.error === 'object' 
          ? Object.values(result.error).flat().join(', ')
          : result.error || 'Error updating profile. Please try again.';
        setMessage(errorMessage);
      }
    } catch (error) {
      setMessage('Network error. Please check your connection and try again.');
    }
    
    setLoading(false);
  };

  const handleCancel = () => {
    setFormData({
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      email: user?.email || '',
      username: user?.username || ''
    });
    setIsEditing(false);
    setMessage('');
  };

  if (!user) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <Typography>Loading profile...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ mb: 3 }}>
        My Profile
      </Typography>

      {message && (
        <Alert 
          severity={message.includes('successfully') ? 'success' : 'error'} 
          sx={{ mb: 3 }}
        >
          {message}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" alignItems="center" mb={3}>
            <Avatar
              sx={{
                width: 80,
                height: 80,
                fontSize: 32,
                backgroundColor: theme.palette.primary.main,
                mr: 3
              }}
            >
              {user.first_name[0]}{user.last_name[0]}
            </Avatar>
            <Box>
              <Typography variant="h5" gutterBottom>
                {user.first_name} {user.last_name}
              </Typography>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <Email fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">
                  {user.email}
                </Typography>
              </Box>
              <Chip
                icon={isAdmin ? <AdminPanelSettings /> : <Person />}
                label={isAdmin ? 'Admin' : 'User'}
                color={isAdmin ? 'primary' : 'default'}
                size="small"
              />
            </Box>
          </Box>

          <Divider sx={{ my: 3 }} />

          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="First Name"
                name="first_name"
                value={formData.first_name}
                onChange={handleChange}
                disabled={!isEditing}
                InputProps={{
                  startAdornment: <Person sx={{ mr: 1, color: 'action.active' }} />
                }}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Last Name"
                name="last_name"
                value={formData.last_name}
                onChange={handleChange}
                disabled={!isEditing}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Username"
                name="username"
                value={formData.username}
                onChange={handleChange}
                disabled={!isEditing}
                InputProps={{
                  startAdornment: <Badge sx={{ mr: 1, color: 'action.active' }} />
                }}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                disabled={!isEditing}
                InputProps={{
                  startAdornment: <Email sx={{ mr: 1, color: 'action.active' }} />
                }}
              />
            </Grid>
          </Grid>

          <Box display="flex" gap={2} mt={4}>
            {!isEditing ? (
              <Button
                variant="contained"
                onClick={() => setIsEditing(true)}
                sx={{
                  backgroundColor: theme.palette.primary.main,
                  '&:hover': {
                    backgroundColor: theme.palette.primary.dark,
                  }
                }}
              >
                Edit Profile
              </Button>
            ) : (
              <>
                <Button
                  variant="contained"
                  onClick={handleSave}
                  disabled={loading}
                  sx={{
                    backgroundColor: theme.palette.primary.main,
                    '&:hover': {
                      backgroundColor: theme.palette.primary.dark,
                    }
                  }}
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleCancel}
                  disabled={loading}
                >
                  Cancel
                </Button>
              </>
            )}
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Account Information
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                Member Since
              </Typography>
              <Typography variant="body1">
                {new Date(user.date_joined).toLocaleDateString()}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                Account Type
              </Typography>
              <Typography variant="body1">
                {isAdmin ? 'Administrator' : 'Standard User'}
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Logout Section */}
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ color: 'text.primary' }}>
            Account Actions
          </Typography>
          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body1" gutterBottom>
                Sign Out
              </Typography>
              <Typography variant="body2" color="text.secondary">
                End your current session and return to the login page
              </Typography>
            </Box>
            <Button
              variant="contained"
              color="error"
              startIcon={<Logout />}
              onClick={handleLogout}
              sx={{ 
                minWidth: 140,
                height: 'fit-content'
              }}
            >
              Sign Out
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Profile;