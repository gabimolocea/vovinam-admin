import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Paper,
  Chip,
  Avatar,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  ListItemSecondaryAction,
  IconButton,
  Divider
} from '@mui/material';
import {
  Person as PersonIcon,
  Group as GroupIcon,
  AdminPanelSettings as AdminIcon,
  PendingActions as PendingIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Visibility as VisibilityIcon
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import AthleteWorkflowAPI from '../services/athleteWorkflowAPI';

const UserDashboard = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { 
    user, 
    isAdmin, 
    isAthlete, 
    isSupporter, 
    hasAthleteProfile, 
    hasPendingAthleteProfile,
    userRole 
  } = useAuth();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    athleteProfile: null,
    supporterRelations: [],
    pendingApprovals: { pending_count: 0, profiles: [] },
    activityLog: []
  });
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboardData();
  }, [userRole]);

  const loadDashboardData = async () => {
    setLoading(true);
    setError('');

    try {
      const promises = [];

      // Load data based on user role
      if (isAthlete) {
        // Try to get athlete profile (might not exist yet)
        promises.push(
          AthleteWorkflowAPI.getMyAthleteProfile()
            .then(profile => ({ athleteProfile: profile }))
            .catch(error => {
              console.log('Athlete profile not found (expected for new athletes):', error.message);
              return { athleteProfile: null };
            })
        );
      }

      if (isSupporter) {
        promises.push(
          AthleteWorkflowAPI.getSupporterAthleteRelations()
            .then(relations => ({ supporterRelations: relations }))
            .catch(() => ({ supporterRelations: [] }))
        );
      }

      if (isAdmin) {
        promises.push(
          AthleteWorkflowAPI.getPendingApprovals()
            .then(approvals => ({ pendingApprovals: approvals }))
            .catch(() => ({ pendingApprovals: { pending_count: 0, profiles: [] } }))
        );
      }

      const results = await Promise.all(promises);
      const combinedData = results.reduce((acc, curr) => ({ ...acc, ...curr }), {});
      
      // Debug: Log athlete profile data to understand its structure
      if (combinedData.athleteProfile) {
        console.log('Athlete Profile Data:', combinedData.athleteProfile);
      }
      
      setData(prev => ({ ...prev, ...combinedData }));

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    let greeting = 'Good morning';
    if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
    else if (hour >= 17) greeting = 'Good evening';
    
    return `${greeting}, ${user?.first_name || user?.username}!`;
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

  const renderAthleteSection = () => {
    if (!isAthlete) return null;

    return (
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" mb={2}>
              <PersonIcon sx={{ mr: 1, color: theme.palette.primary.main }} />
              <Typography variant="h6">Athlete Profile Status</Typography>
            </Box>

            {hasAthleteProfile && data.athleteProfile ? (
              <Box>
                <Box display="flex" alignItems="center" mb={2}>
                  <CheckCircleIcon sx={{ color: 'success.main', mr: 1 }} />
                  <Typography variant="body1" color="success.main">
                    Profile Approved
                  </Typography>
                </Box>
                
                <Typography variant="body2" color="textSecondary" gutterBottom>
                  Your athlete profile has been approved and is active.
                </Typography>
                
                <Box mt={2}>
                  <Button
                    variant="outlined"
                    startIcon={<VisibilityIcon />}
                    onClick={() => {
                      // Navigate to athlete profile view using the athlete ID
                      if (data.athleteProfile && data.athleteProfile.id) {
                        navigate(`/athletes/${data.athleteProfile.id}/`);
                      } else {
                        navigate('/athlete-profile');
                      }
                    }}
                    sx={{ mr: 1 }}
                  >
                    View Profile
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<EditIcon />}
                    onClick={() => navigate('/athlete-profile/edit')}
                  >
                    Edit Profile
                  </Button>
                </Box>
              </Box>
            ) : hasPendingAthleteProfile ? (
              <Box>
                <Box display="flex" alignItems="center" mb={2}>
                  <PendingIcon sx={{ color: 'warning.main', mr: 1 }} />
                  <Typography variant="body1" color="warning.main">
                    Profile Pending Review
                  </Typography>
                </Box>
                
                <Typography variant="body2" color="textSecondary" gutterBottom>
                  Your athlete profile has been submitted and is waiting for admin approval.
                </Typography>
                
                <Box mt={2}>
                  <Button
                    variant="outlined"
                    startIcon={<VisibilityIcon />}
                    onClick={() => navigate('/athlete-profile-status')}
                  >
                    View Status
                  </Button>
                </Box>
              </Box>
            ) : (
              <Box>
                <Typography variant="body2" color="textSecondary" gutterBottom>
                  You haven't created your athlete profile yet. Create one to participate in competitions.
                </Typography>
                
                <Box mt={2}>
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => navigate('/athlete-registration')}
                  >
                    Create Athlete Profile
                  </Button>
                </Box>
              </Box>
            )}
          </CardContent>
        </Card>
      </Grid>
    );
  };

  const renderSupporterSection = () => {
    if (!isSupporter) return null;

    return (
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
              <Box display="flex" alignItems="center">
                <GroupIcon sx={{ mr: 1, color: theme.palette.primary.main }} />
                <Typography variant="h6">Managed Athletes</Typography>
              </Box>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => navigate('/supporter-management')}
                size="small"
              >
                Add Athlete
              </Button>
            </Box>

            {data.supporterRelations.length > 0 ? (
              <List>
                {data.supporterRelations.slice(0, 3).map((relation, index) => (
                  <React.Fragment key={relation.id}>
                    <ListItem>
                      <ListItemAvatar>
                        <Avatar>
                          {relation.athlete.first_name[0]}{relation.athlete.last_name[0]}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={`${relation.athlete.first_name} ${relation.athlete.last_name}`}
                        secondary={`${relation.relationship} • ${relation.can_edit ? 'Can edit' : 'View only'}`}
                      />
                      <ListItemSecondaryAction>
                        <IconButton
                          edge="end"
                          onClick={() => navigate(`/athlete/${relation.athlete.id}`)}
                        >
                          <VisibilityIcon />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                    {index < Math.min(data.supporterRelations.length, 3) - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            ) : (
              <Typography variant="body2" color="textSecondary">
                You haven't linked any athletes yet. Add athletes to manage their profiles and registrations.
              </Typography>
            )}

            {data.supporterRelations.length > 3 && (
              <Box textAlign="center" mt={2}>
                <Button
                  variant="text"
                  onClick={() => navigate('/supporter-management')}
                >
                  View All Athletes ({data.supporterRelations.length})
                </Button>
              </Box>
            )}
          </CardContent>
        </Card>
      </Grid>
    );
  };

  const renderAdminSection = () => {
    if (!isAdmin) return null;

    return (
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
              <Box display="flex" alignItems="center">
                <AdminIcon sx={{ mr: 1, color: theme.palette.primary.main }} />
                <Typography variant="h6">Admin Panel</Typography>
              </Box>
              <Chip
                label={`${data.pendingApprovals.pending_count} Pending`}
                color={data.pendingApprovals.pending_count > 0 ? 'warning' : 'default'}
                size="small"
              />
            </Box>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="h4" color="warning.main">
                    {data.pendingApprovals.pending_count}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Pending Approvals
                  </Typography>
                  <Button
                    variant="outlined"
                    size="small"
                    sx={{ mt: 1 }}
                    onClick={() => navigate('/admin/pending-approvals')}
                    disabled={data.pendingApprovals.pending_count === 0}
                  >
                    Review
                  </Button>
                </Paper>
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="h4" color="primary.main">
                    {data.pendingApprovals.profiles?.filter(p => p.status === 'approved').length || 0}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Recently Approved
                  </Typography>
                  <Button
                    variant="outlined"
                    size="small"
                    sx={{ mt: 1 }}
                    onClick={() => navigate('/admin/athlete-profiles')}
                  >
                    View All
                  </Button>
                </Paper>
              </Grid>
            </Grid>

            {data.pendingApprovals.profiles.length > 0 && (
              <Box mt={3}>
                <Typography variant="subtitle2" gutterBottom>
                  Recent Submissions:
                </Typography>
                <List dense>
                  {data.pendingApprovals.profiles.slice(0, 3).map((profile) => (
                    <ListItem key={profile.id}>
                      <ListItemText
                        primary={`${profile.first_name} ${profile.last_name}`}
                        secondary={`Submitted ${new Date(profile.submitted_date).toLocaleDateString()}`}
                      />
                      <Chip
                        label={profile.status}
                        color={getStatusColor(profile.status)}
                        size="small"
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </CardContent>
        </Card>
      </Grid>
    );
  };

  const renderWelcomeCard = () => (
    <Grid item xs={12}>
      <Card sx={{ background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`, color: 'white' }}>
        <CardContent>
          <Typography variant="h4" gutterBottom>
            {getGreeting()}
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.9 }}>
            Welcome to your {userRole} dashboard. Here you can manage your profile and activities.
          </Typography>
          <Box display="flex" alignItems="center" mt={2}>
            <Chip
              label={userRole.charAt(0).toUpperCase() + userRole.slice(1)}
              variant="outlined"
              sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}
            />
          </Box>
        </CardContent>
      </Card>
    </Grid>
  );

  const renderQuickActionsCard = () => (
    <Grid item xs={12} md={6}>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Quick Actions
          </Typography>
          
          <Box display="flex" flexDirection="column" gap={1}>
            {isAthlete && !hasAthleteProfile && !hasPendingAthleteProfile && (
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => navigate('/athlete-registration')}
                fullWidth
              >
                Create Athlete Profile
              </Button>
            )}
            
            {isSupporter && (
              <Button
                variant="outlined"
                startIcon={<GroupIcon />}
                onClick={() => navigate('/supporter-management')}
                fullWidth
              >
                Manage Athletes
              </Button>
            )}
            
            {isAdmin && (
              <Button
                variant="outlined"
                startIcon={<AdminIcon />}
                onClick={() => navigate('/admin/pending-approvals')}
                fullWidth
              >
                Review Pending Profiles
              </Button>
            )}
            
            <Button
              variant="outlined"
              startIcon={<EditIcon />}
              onClick={() => navigate('/profile')}
              fullWidth
            >
              Edit My Profile
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Grid>
  );

  const renderStatsCard = () => (
    <Grid item xs={12} md={6}>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Account Overview
          </Typography>
          
          <List dense>
            <ListItem>
              <ListItemText
                primary="Account Type"
                secondary={userRole.charAt(0).toUpperCase() + userRole.slice(1)}
              />
            </ListItem>
            
            <ListItem>
              <ListItemText
                primary="Member Since"
                secondary={new Date(user?.date_joined).toLocaleDateString()}
              />
            </ListItem>
            
            {isAthlete && (
              <ListItem>
                <ListItemText
                  primary="Profile Status"
                  secondary={
                    hasAthleteProfile ? 'Approved' :
                    hasPendingAthleteProfile ? 'Pending Review' : 'Not Created'
                  }
                />
                {hasAthleteProfile && <CheckCircleIcon color="success" />}
                {hasPendingAthleteProfile && <PendingIcon color="warning" />}
              </ListItem>
            )}
            
            {isSupporter && (
              <ListItem>
                <ListItemText
                  primary="Managed Athletes"
                  secondary={`${data.supporterRelations.length} athletes`}
                />
              </ListItem>
            )}
          </List>
        </CardContent>
      </Card>
    </Grid>
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {renderWelcomeCard()}
        {renderAthleteSection()}
        {renderSupporterSection()}
        {renderAdminSection()}
        {renderQuickActionsCard()}
        {renderStatsCard()}
      </Grid>
    </Container>
  );
};

export default UserDashboard;