import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  Alert,
  CircularProgress,
  Chip,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Divider,
  Button,
  Paper
} from '@mui/material';
import {
  PendingActions as PendingIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Edit as EditIcon,
  History as HistoryIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import AthleteWorkflowAPI from '../services/athleteWorkflowAPI';

const AthleteProfileStatus = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { isAthlete, hasPendingAthleteProfile, hasAthleteProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [activityLog, setActivityLog] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAthlete) {
      navigate('/dashboard');
      return;
    }
    
    if (!hasPendingAthleteProfile && !hasAthleteProfile) {
      navigate('/athlete-registration');
      return;
    }

    loadProfileData();
  }, [isAthlete, hasPendingAthleteProfile, hasAthleteProfile, navigate]);

  const loadProfileData = async () => {
    setLoading(true);
    setError('');

    try {
      const profileData = await AthleteWorkflowAPI.getMyAthleteProfile();
      setProfile(profileData);

      // Load activity log
      const activityData = await AthleteWorkflowAPI.getProfileActivityLog(profileData.id);
      setActivityLog(activityData);

    } catch (error) {
      console.error('Error loading profile data:', error);
      setError('Failed to load profile data');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'warning';
      case 'approved': return 'success';
      case 'rejected': return 'error';
      case 'revision_required': return 'info';
      default: return 'default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending': return <PendingIcon />;
      case 'approved': return <CheckCircleIcon />;
      case 'rejected': return <CancelIcon />;
      case 'revision_required': return <EditIcon />;
      default: return null;
    }
  };

  const getStatusMessage = (status) => {
    switch (status) {
      case 'pending':
        return 'Your athlete profile has been submitted and is waiting for admin review. You will be notified once a decision is made.';
      case 'approved':
        return 'Congratulations! Your athlete profile has been approved. You can now participate in competitions.';
      case 'rejected':
        return 'Your athlete profile has been rejected. Please review the admin notes below and consider resubmitting.';
      case 'revision_required':
        return 'The admin has requested revisions to your profile. Please review the notes below and update your profile accordingly.';
      default:
        return 'Status unknown.';
    }
  };

  const canEdit = profile?.status === 'revision_required' || profile?.status === 'pending';

  if (!isAthlete) {
    return (
      <Container maxWidth="sm">
        <Alert severity="warning" sx={{ mt: 4 }}>
          You must be registered as an athlete to view this page.
        </Alert>
      </Container>
    );
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={loadProfileData}
        >
          Retry
        </Button>
      </Container>
    );
  }

  if (!profile) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="info">
          No athlete profile found. Please create your profile first.
        </Alert>
        <Box mt={2}>
          <Button
            variant="contained"
            onClick={() => navigate('/athlete-registration')}
          >
            Create Profile
          </Button>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        Athlete Profile Status
      </Typography>

      {/* Status Overview */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Typography variant="h6">
              {profile.first_name} {profile.last_name}
            </Typography>
            <Chip
              label={profile.status.replace('_', ' ').toUpperCase()}
              color={getStatusColor(profile.status)}
              icon={getStatusIcon(profile.status)}
            />
          </Box>

          <Alert 
            severity={getStatusColor(profile.status)} 
            sx={{ mb: 2 }}
            icon={getStatusIcon(profile.status)}
          >
            {getStatusMessage(profile.status)}
          </Alert>

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="textSecondary">
                Submitted: {new Date(profile.submitted_date).toLocaleDateString()}
              </Typography>
            </Grid>
            {profile.reviewed_date && (
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="textSecondary">
                  Reviewed: {new Date(profile.reviewed_date).toLocaleDateString()}
                </Typography>
              </Grid>
            )}
          </Grid>

          {profile.admin_notes && (
            <Paper sx={{ p: 2, mt: 2, bgcolor: 'grey.50' }}>
              <Typography variant="subtitle2" gutterBottom>
                Admin Notes:
              </Typography>
              <Typography variant="body2">
                {profile.admin_notes}
              </Typography>
            </Paper>
          )}

          <Box mt={3} display="flex" gap={2}>
            {canEdit && (
              <Button
                variant="contained"
                startIcon={<EditIcon />}
                onClick={() => navigate('/athlete-registration')}
              >
                Edit Profile
              </Button>
            )}
            
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={loadProfileData}
            >
              Refresh Status
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Profile Summary */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Profile Summary
          </Typography>
          
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="textSecondary">Email</Typography>
              <Typography variant="body1">{profile.user?.email}</Typography>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="textSecondary">Date of Birth</Typography>
              <Typography variant="body1">
                {new Date(profile.date_of_birth).toLocaleDateString()}
              </Typography>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="textSecondary">Club</Typography>
              <Typography variant="body1">{profile.club?.name || 'No club'}</Typography>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="textSecondary">City</Typography>
              <Typography variant="body1">{profile.city?.name || 'Not specified'}</Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Activity Log */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Activity Log
          </Typography>
          
          {activityLog.length > 0 ? (
            <List>
              {activityLog.map((activity, index) => (
                <React.Fragment key={activity.id}>
                  <ListItem alignItems="flex-start">
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: theme.palette.primary.main }}>
                        <HistoryIcon />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={activity.action.replace('_', ' ').toUpperCase()}
                      secondary={
                        <Box>
                          <Typography variant="body2" color="textSecondary">
                            {new Date(activity.timestamp).toLocaleString()}
                          </Typography>
                          <Typography variant="body2">
                            By: {activity.performed_by}
                          </Typography>
                          {activity.notes && (
                            <Typography variant="body2" sx={{ mt: 1 }}>
                              {activity.notes}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                  {index < activityLog.length - 1 && <Divider variant="inset" component="li" />}
                </React.Fragment>
              ))}
            </List>
          ) : (
            <Typography variant="body2" color="textSecondary">
              No activity recorded yet.
            </Typography>
          )}
        </CardContent>
      </Card>
    </Container>
  );
};

export default AthleteProfileStatus;