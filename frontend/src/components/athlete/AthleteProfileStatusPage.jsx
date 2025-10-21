// 3. AthleteProfileStatusPage.jsx
import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Alert, Button, Chip, Timeline,
  TimelineItem, TimelineSeparator, TimelineConnector, TimelineContent,
  TimelineDot, CircularProgress, Grid
} from '@mui/material';
import { 
  Pending, CheckCircle, Cancel, Edit, Person, Schedule 
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import AxiosInstance from '../Axios';

const AthleteProfileStatusPage = () => {
  const [profile, setProfile] = useState(null);
  const [activityLog, setActivityLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchProfileStatus();
  }, []);

  const fetchProfileStatus = async () => {
    try {
      const [profileRes, activityRes] = await Promise.all([
        AxiosInstance.get('/athlete-profiles/my-profile/'),
        AxiosInstance.get(`/athlete-profiles/${profileRes.data.id}/activity_log/`)
      ]);
      setProfile(profileRes.data);
      setActivityLog(activityRes.data);
    } catch (error) {
      setError('Failed to fetch profile status');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending':
        return <Pending color="warning" />;
      case 'approved':
        return <CheckCircle color="success" />;
      case 'rejected':
        return <Cancel color="error" />;
      case 'revision_required':
        return <Edit color="info" />;
      default:
        return <Schedule />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return 'warning';
      case 'approved':
        return 'success';
      case 'rejected':
        return 'error';
      case 'revision_required':
        return 'info';
      default:
        return 'default';
    }
  };

  const getStatusMessage = (status) => {
    switch (status) {
      case 'pending':
        return 'Your athlete profile is being reviewed by our administrators. You will receive an email notification once reviewed.';
      case 'approved':
        return 'Congratulations! Your athlete profile has been approved. You now have full access to athlete features.';
      case 'rejected':
        return 'Your athlete profile has been rejected. Please see the admin notes below for details.';
      case 'revision_required':
        return 'Your athlete profile requires some changes. Please see the admin notes below and update your profile.';
      default:
        return '';
    }
  };

  const handleEditProfile = () => {
    navigate('/athlete-profile-edit');
  };

  const handleViewAthleteDashboard = () => {
    navigate('/athlete-dashboard');
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Athlete Profile Status
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2} mb={2}>
                {getStatusIcon(profile.status)}
                <Typography variant="h5">
                  {profile.first_name} {profile.last_name}
                </Typography>
                <Chip 
                  label={profile.status_display} 
                  color={getStatusColor(profile.status)}
                  variant="outlined"
                />
              </Box>

              <Alert 
                severity={getStatusColor(profile.status)} 
                sx={{ mb: 3 }}
              >
                {getStatusMessage(profile.status)}
              </Alert>

              {profile.admin_notes && (
                <Alert severity="info" sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Admin Notes:
                  </Typography>
                  {profile.admin_notes}
                </Alert>
              )}

              <Typography variant="h6" gutterBottom>
                Profile Information
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Email
                  </Typography>
                  <Typography variant="body1">
                    {profile.user_email}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Date of Birth
                  </Typography>
                  <Typography variant="body1">
                    {new Date(profile.date_of_birth).toLocaleDateString()}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Submitted Date
                  </Typography>
                  <Typography variant="body1">
                    {new Date(profile.submitted_date).toLocaleDateString()}
                  </Typography>
                </Grid>
                {profile.reviewed_date && (
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Reviewed Date
                    </Typography>
                    <Typography variant="body1">
                      {new Date(profile.reviewed_date).toLocaleDateString()}
                    </Typography>
                  </Grid>
                )}
              </Grid>

              <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
                {profile.status === 'revision_required' && (
                  <Button
                    variant="contained"
                    startIcon={<Edit />}
                    onClick={handleEditProfile}
                  >
                    Update Profile
                  </Button>
                )}
                {profile.status === 'approved' && (
                  <Button
                    variant="contained"
                    startIcon={<Person />}
                    onClick={handleViewAthleteDashboard}
                  >
                    Go to Athlete Dashboard
                  </Button>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Activity Timeline
              </Typography>
              <Timeline>
                {activityLog.map((activity, index) => (
                  <TimelineItem key={activity.id}>
                    <TimelineSeparator>
                      <TimelineDot color="primary" />
                      {index < activityLog.length - 1 && <TimelineConnector />}
                    </TimelineSeparator>
                    <TimelineContent>
                      <Typography variant="subtitle2">
                        {activity.action_display}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(activity.timestamp).toLocaleDateString()}
                      </Typography>
                      {activity.notes && (
                        <Typography variant="caption" display="block">
                          {activity.notes}
                        </Typography>
                      )}
                    </TimelineContent>
                  </TimelineItem>
                ))}
              </Timeline>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AthleteProfileStatusPage;