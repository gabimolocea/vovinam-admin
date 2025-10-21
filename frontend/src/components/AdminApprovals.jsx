import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  Avatar,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ButtonGroup
} from '@mui/material';
import {
  Visibility as VisibilityIcon,
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Edit as RevisionIcon,
  History as HistoryIcon,
  FilterList as FilterIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import AthleteWorkflowAPI from '../services/athleteWorkflowAPI';

const AdminApprovals = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState([]);
  const [filteredProfiles, setFilteredProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [activityLog, setActivityLog] = useState([]);
  const [actionDialog, setActionDialog] = useState({ open: false, type: '', profile: null });
  const [actionNotes, setActionNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Filters and search
  const [statusFilter, setStatusFilter] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/dashboard');
      return;
    }
    loadProfiles();
  }, [isAdmin, navigate]);

  useEffect(() => {
    filterProfiles();
  }, [profiles, statusFilter, searchTerm]);

  const loadProfiles = async () => {
    setLoading(true);
    setError('');
    
    try {
      const data = await AthleteWorkflowAPI.getAllAthleteProfiles();
      setProfiles(data);
    } catch (error) {
      console.error('Error loading profiles:', error);
      setError('Failed to load athlete profiles');
    } finally {
      setLoading(false);
    }
  };

  const filterProfiles = () => {
    let filtered = profiles;

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(profile => profile.status === statusFilter);
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(profile =>
        profile.first_name.toLowerCase().includes(term) ||
        profile.last_name.toLowerCase().includes(term) ||
        profile.user?.email.toLowerCase().includes(term)
      );
    }

    setFilteredProfiles(filtered);
  };

  const loadActivityLog = async (profileId) => {
    try {
      const log = await AthleteWorkflowAPI.getProfileActivityLog(profileId);
      setActivityLog(log);
    } catch (error) {
      console.error('Error loading activity log:', error);
    }
  };

  const handleViewProfile = async (profile) => {
    setSelectedProfile(profile);
    await loadActivityLog(profile.id);
  };

  const handleActionClick = (type, profile) => {
    setActionDialog({ open: true, type, profile });
    setActionNotes('');
  };

  const handleActionConfirm = async () => {
    const { type, profile } = actionDialog;
    setIsProcessing(true);
    setError('');
    setSuccess('');

    try {
      await AthleteWorkflowAPI.processProfileApplication(profile.id, type, actionNotes);
      
      // Update the profile in the list
      setProfiles(prev => prev.map(p => 
        p.id === profile.id 
          ? { ...p, status: type === 'approve' ? 'approved' : type === 'reject' ? 'rejected' : 'revision_required' }
          : p
      ));

      setSuccess(`Profile ${type}d successfully`);
      setActionDialog({ open: false, type: '', profile: null });
      
      // Refresh the selected profile if it's the same one
      if (selectedProfile?.id === profile.id) {
        await loadActivityLog(profile.id);
      }

    } catch (error) {
      setError(error.message || `Failed to ${type} profile`);
    } finally {
      setIsProcessing(false);
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
      case 'approved': return <ApproveIcon />;
      case 'rejected': return <RejectIcon />;
      case 'revision_required': return <RevisionIcon />;
      default: return null;
    }
  };

  const renderProfilesTable = () => (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Athlete</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Submitted</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Club</TableCell>
            <TableCell align="center">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredProfiles.map((profile) => (
            <TableRow key={profile.id} hover>
              <TableCell>
                <Box display="flex" alignItems="center">
                  <Avatar sx={{ mr: 2 }}>
                    {profile.first_name[0]}{profile.last_name[0]}
                  </Avatar>
                  <Box>
                    <Typography variant="body2" fontWeight="bold">
                      {profile.first_name} {profile.last_name}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      DOB: {new Date(profile.date_of_birth).toLocaleDateString()}
                    </Typography>
                  </Box>
                </Box>
              </TableCell>
              <TableCell>{profile.user?.email}</TableCell>
              <TableCell>
                {new Date(profile.submitted_date).toLocaleDateString()}
              </TableCell>
              <TableCell>
                <Chip
                  label={profile.status.replace('_', ' ')}
                  color={getStatusColor(profile.status)}
                  size="small"
                  icon={getStatusIcon(profile.status)}
                />
              </TableCell>
              <TableCell>
                {profile.club?.name || 'No club'}
              </TableCell>
              <TableCell align="center">
                <ButtonGroup size="small">
                  <IconButton
                    size="small"
                    onClick={() => handleViewProfile(profile)}
                    color="primary"
                  >
                    <VisibilityIcon />
                  </IconButton>
                  
                  {profile.status === 'pending' && (
                    <>
                      <IconButton
                        size="small"
                        onClick={() => handleActionClick('approve', profile)}
                        color="success"
                      >
                        <ApproveIcon />
                      </IconButton>
                      
                      <IconButton
                        size="small"
                        onClick={() => handleActionClick('reject', profile)}
                        color="error"
                      >
                        <RejectIcon />
                      </IconButton>
                      
                      <IconButton
                        size="small"
                        onClick={() => handleActionClick('request_revision', profile)}
                        color="info"
                      >
                        <RevisionIcon />
                      </IconButton>
                    </>
                  )}
                </ButtonGroup>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      
      {filteredProfiles.length === 0 && (
        <Box p={3} textAlign="center">
          <Typography color="textSecondary">
            No profiles found matching your criteria
          </Typography>
        </Box>
      )}
    </TableContainer>
  );

  const renderProfileDetails = () => (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h6">
            {selectedProfile.first_name} {selectedProfile.last_name}
          </Typography>
          <Chip
            label={selectedProfile.status.replace('_', ' ')}
            color={getStatusColor(selectedProfile.status)}
            icon={getStatusIcon(selectedProfile.status)}
          />
        </Box>

        <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} sx={{ mb: 3 }}>
          <Tab label="Profile Details" />
          <Tab label={`Activity Log (${activityLog.length})`} />
        </Tabs>

        {tabValue === 0 && (
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Typography variant="subtitle2" color="textSecondary">Personal Information</Typography>
              <Typography variant="body2">Email: {selectedProfile.user?.email}</Typography>
              <Typography variant="body2">Phone: {selectedProfile.mobile_number || 'Not provided'}</Typography>
              <Typography variant="body2">Date of Birth: {new Date(selectedProfile.date_of_birth).toLocaleDateString()}</Typography>
              <Typography variant="body2">Address: {selectedProfile.address || 'Not provided'}</Typography>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <Typography variant="subtitle2" color="textSecondary">Sport Information</Typography>
              <Typography variant="body2">Club: {selectedProfile.club?.name || 'No club'}</Typography>
              <Typography variant="body2">City: {selectedProfile.city?.name || 'Not specified'}</Typography>
              <Typography variant="body2">Emergency Contact: {selectedProfile.emergency_contact_name || 'Not provided'}</Typography>
              <Typography variant="body2">Emergency Phone: {selectedProfile.emergency_contact_phone || 'Not provided'}</Typography>
            </Grid>
            
            {selectedProfile.previous_experience && (
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="textSecondary">Previous Experience</Typography>
                <Typography variant="body2">{selectedProfile.previous_experience}</Typography>
              </Grid>
            )}
            
            {selectedProfile.admin_notes && (
              <Grid item xs={12}>
                <Alert severity="info">
                  <Typography variant="subtitle2">Admin Notes:</Typography>
                  <Typography variant="body2">{selectedProfile.admin_notes}</Typography>
                </Alert>
              </Grid>
            )}
          </Grid>
        )}

        {tabValue === 1 && (
          <List>
            {activityLog.map((activity, index) => (
              <React.Fragment key={activity.id}>
                <ListItem>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: theme.palette.primary.main }}>
                      <HistoryIcon />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={activity.action.replace('_', ' ').toUpperCase()}
                    secondary={
                      <Box>
                        <Typography variant="body2">
                          By: {activity.performed_by}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          {new Date(activity.timestamp).toLocaleString()}
                        </Typography>
                        {activity.notes && (
                          <Typography variant="body2" sx={{ mt: 1 }}>
                            Notes: {activity.notes}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
                {index < activityLog.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        )}

        {selectedProfile.status === 'pending' && (
          <Box mt={3} display="flex" gap={2}>
            <Button
              variant="contained"
              color="success"
              startIcon={<ApproveIcon />}
              onClick={() => handleActionClick('approve', selectedProfile)}
            >
              Approve
            </Button>
            <Button
              variant="contained"
              color="error"
              startIcon={<RejectIcon />}
              onClick={() => handleActionClick('reject', selectedProfile)}
            >
              Reject
            </Button>
            <Button
              variant="contained"
              color="info"
              startIcon={<RevisionIcon />}
              onClick={() => handleActionClick('request_revision', selectedProfile)}
            >
              Request Revision
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  if (!isAdmin) {
    return (
      <Container maxWidth="sm">
        <Alert severity="error" sx={{ mt: 4 }}>
          Access denied. Admin privileges required.
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

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        Athlete Profile Approvals
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1 }} />
                }}
              />
            </Grid>
            
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  label="Status"
                >
                  <MenuItem value="all">All Statuses</MenuItem>
                  <MenuItem value="pending">Pending</MenuItem>
                  <MenuItem value="approved">Approved</MenuItem>
                  <MenuItem value="rejected">Rejected</MenuItem>
                  <MenuItem value="revision_required">Revision Required</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={5}>
              <Typography variant="body2" color="textSecondary">
                Showing {filteredProfiles.length} of {profiles.length} profiles
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        {/* Profiles Table */}
        <Grid item xs={12} lg={selectedProfile ? 8 : 12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Athlete Profiles
              </Typography>
              {renderProfilesTable()}
            </CardContent>
          </Card>
        </Grid>

        {/* Profile Details */}
        {selectedProfile && (
          <Grid item xs={12} lg={4}>
            {renderProfileDetails()}
          </Grid>
        )}
      </Grid>

      {/* Action Dialog */}
      <Dialog open={actionDialog.open} onClose={() => setActionDialog({ open: false, type: '', profile: null })}>
        <DialogTitle>
          {actionDialog.type === 'approve' && 'Approve Profile'}
          {actionDialog.type === 'reject' && 'Reject Profile'}
          {actionDialog.type === 'request_revision' && 'Request Revision'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {actionDialog.profile && `${actionDialog.profile.first_name} ${actionDialog.profile.last_name}`}
          </Typography>
          
          {(actionDialog.type === 'reject' || actionDialog.type === 'request_revision') && (
            <TextField
              fullWidth
              multiline
              rows={4}
              label="Notes (required)"
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder="Please provide a reason for this action..."
              required
            />
          )}
          
          {actionDialog.type === 'approve' && (
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Notes (optional)"
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder="Any additional notes..."
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setActionDialog({ open: false, type: '', profile: null })}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleActionConfirm}
            variant="contained"
            disabled={isProcessing || ((actionDialog.type === 'reject' || actionDialog.type === 'request_revision') && !actionNotes.trim())}
            color={
              actionDialog.type === 'approve' ? 'success' :
              actionDialog.type === 'reject' ? 'error' : 'info'
            }
          >
            {isProcessing ? <CircularProgress size={20} /> : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default AdminApprovals;