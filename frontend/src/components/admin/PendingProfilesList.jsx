// 4. PendingProfilesList.jsx (Admin Component)
import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Button, Chip, Grid, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Menu, MenuItem, Tooltip, Paper
} from '@mui/material';
import {
  Visibility, CheckCircle, Cancel, Edit, MoreVert, Schedule
} from '@mui/icons-material';
import AxiosInstance from '../Axios';

const PendingProfilesList = () => {
  const [profiles, setProfiles] = useState([]);
  const [statistics, setStatistics] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [actionDialog, setActionDialog] = useState({ open: false, action: '', profile: null });
  const [actionNotes, setActionNotes] = useState('');
  const [anchorEl, setAnchorEl] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [profilesRes, statsRes] = await Promise.all([
        AxiosInstance.get('/athlete-profiles/'),
        AxiosInstance.get('/athlete-profiles/statistics/')
      ]);
      setProfiles(profilesRes.data);
      setStatistics(statsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMenuOpen = (event, profileId) => {
    setAnchorEl({ ...anchorEl, [profileId]: event.currentTarget });
  };

  const handleMenuClose = (profileId) => {
    setAnchorEl({ ...anchorEl, [profileId]: null });
  };

  const handleActionDialog = (action, profile) => {
    setActionDialog({ open: true, action, profile });
    setActionNotes('');
    handleMenuClose(profile.id);
  };

  const handleActionSubmit = async () => {
    const { action, profile } = actionDialog;
    
    try {
      const endpoint = `/athlete-profiles/${profile.id}/${action}/`;
      await AxiosInstance.post(endpoint, {
        action,
        notes: actionNotes
      });
      
      setActionDialog({ open: false, action: '', profile: null });
      setActionNotes('');
      fetchData(); // Refresh data
      
      // Show success message
      alert(`Profile ${action}d successfully`);
    } catch (error) {
      console.error(`Error ${action}ing profile:`, error);
      alert(`Failed to ${action} profile`);
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

  const StatCard = ({ title, count, color = 'primary' }) => (
    <Card>
      <CardContent>
        <Typography variant="h4" color={color}>
          {count}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {title}
        </Typography>
      </CardContent>
    </Card>
  );

  if (loading) {
    return <Box>Loading...</Box>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Athlete Profile Management
      </Typography>

      {/* Statistics Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Pending" count={statistics.pending} color="warning.main" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Approved" count={statistics.approved} color="success.main" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Rejected" count={statistics.rejected} color="error.main" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Revision Required" count={statistics.revision_required} color="info.main" />
        </Grid>
      </Grid>

      {/* Profiles Table */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Athlete Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Submitted Date</TableCell>
                <TableCell>Club</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {profiles.map((profile) => (
                <TableRow key={profile.id}>
                  <TableCell>
                    {profile.first_name} {profile.last_name}
                  </TableCell>
                  <TableCell>{profile.user_email}</TableCell>
                  <TableCell>
                    <Chip 
                      label={profile.status_display} 
                      color={getStatusColor(profile.status)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {new Date(profile.submitted_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {profile.club ? `Club ${profile.club}` : 'No Club'}
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Actions">
                      <IconButton
                        onClick={(e) => handleMenuOpen(e, profile.id)}
                      >
                        <MoreVert />
                      </IconButton>
                    </Tooltip>
                    <Menu
                      anchorEl={anchorEl[profile.id]}
                      open={Boolean(anchorEl[profile.id])}
                      onClose={() => handleMenuClose(profile.id)}
                    >
                      <MenuItem onClick={() => setSelectedProfile(profile)}>
                        <Visibility sx={{ mr: 1 }} />
                        View Details
                      </MenuItem>
                      {profile.status === 'pending' && (
                        <>
                          <MenuItem onClick={() => handleActionDialog('approve', profile)}>
                            <CheckCircle sx={{ mr: 1 }} />
                            Approve
                          </MenuItem>
                          <MenuItem onClick={() => handleActionDialog('reject', profile)}>
                            <Cancel sx={{ mr: 1 }} />
                            Reject
                          </MenuItem>
                          <MenuItem onClick={() => handleActionDialog('request_revision', profile)}>
                            <Edit sx={{ mr: 1 }} />
                            Request Revision
                          </MenuItem>
                        </>
                      )}
                    </Menu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Profile Details Dialog */}
      <Dialog
        open={Boolean(selectedProfile)}
        onClose={() => setSelectedProfile(null)}
        maxWidth="md"
        fullWidth
      >
        {selectedProfile && (
          <>
            <DialogTitle>
              {selectedProfile.first_name} {selectedProfile.last_name} - Profile Details
            </DialogTitle>
            <DialogContent>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="subtitle2">Email</Typography>
                  <Typography variant="body2">{selectedProfile.user_email}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2">Date of Birth</Typography>
                  <Typography variant="body2">
                    {new Date(selectedProfile.date_of_birth).toLocaleDateString()}
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2">Address</Typography>
                  <Typography variant="body2">{selectedProfile.address || 'Not provided'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2">Mobile Number</Typography>
                  <Typography variant="body2">{selectedProfile.mobile_number || 'Not provided'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2">Emergency Contact</Typography>
                  <Typography variant="body2">
                    {selectedProfile.emergency_contact_name || 'Not provided'}
                    {selectedProfile.emergency_contact_phone && ` (${selectedProfile.emergency_contact_phone})`}
                  </Typography>
                </Grid>
                {selectedProfile.previous_experience && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle2">Previous Experience</Typography>
                    <Typography variant="body2">{selectedProfile.previous_experience}</Typography>
                  </Grid>
                )}
                {selectedProfile.admin_notes && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle2">Admin Notes</Typography>
                    <Typography variant="body2">{selectedProfile.admin_notes}</Typography>
                  </Grid>
                )}
              </Grid>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedProfile(null)}>
                Close
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Action Dialog */}
      <Dialog
        open={actionDialog.open}
        onClose={() => setActionDialog({ open: false, action: '', profile: null })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {actionDialog.action === 'approve' && 'Approve Profile'}
          {actionDialog.action === 'reject' && 'Reject Profile'}
          {actionDialog.action === 'request_revision' && 'Request Revision'}
        </DialogTitle>
        <DialogContent>
          {actionDialog.profile && (
            <Typography variant="body1" gutterBottom>
              {actionDialog.profile.first_name} {actionDialog.profile.last_name}
            </Typography>
          )}
          <TextField
            fullWidth
            multiline
            rows={4}
            label={
              actionDialog.action === 'approve' ? 'Approval Notes (Optional)' :
              actionDialog.action === 'reject' ? 'Rejection Reason (Required)' :
              'Revision Notes (Required)'
            }
            value={actionNotes}
            onChange={(e) => setActionNotes(e.target.value)}
            required={actionDialog.action !== 'approve'}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActionDialog({ open: false, action: '', profile: null })}>
            Cancel
          </Button>
          <Button
            onClick={handleActionSubmit}
            variant="contained"
            color={
              actionDialog.action === 'approve' ? 'success' :
              actionDialog.action === 'reject' ? 'error' : 'primary'
            }
            disabled={
              (actionDialog.action !== 'approve' && !actionNotes.trim())
            }
          >
            {actionDialog.action === 'approve' && 'Approve'}
            {actionDialog.action === 'reject' && 'Reject'}
            {actionDialog.action === 'request_revision' && 'Request Revision'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PendingProfilesList;