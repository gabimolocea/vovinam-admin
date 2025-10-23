import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  IconButton,
  Tooltip,
  Link
} from '@mui/material';
import {
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Edit as RevisionIcon,
  Visibility as ViewIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import axios from './Axios';

const SubmissionManagement = () => {
  const [tabValue, setTabValue] = useState(0);
  const [gradeSubmissions, setGradeSubmissions] = useState([]);
  const [seminarSubmissions, setSeminarSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionDialog, setActionDialog] = useState({
    open: false,
    type: '',
    submission: null,
    submissionType: ''
  });
  const [actionNotes, setActionNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const [gradeResponse, seminarResponse] = await Promise.all([
        axios.get('grade-submissions/'),
        axios.get('seminar-submissions/')
      ]);
      
      setGradeSubmissions(gradeResponse.data.results || gradeResponse.data);
      setSeminarSubmissions(seminarResponse.data.results || seminarResponse.data);
    } catch (err) {
      console.error('Error fetching submissions:', err);
      setError('Failed to load submissions');
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

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending': return 'Pending Review';
      case 'approved': return 'Approved';
      case 'rejected': return 'Rejected';
      case 'revision_required': return 'Revision Required';
      default: return status;
    }
  };

  const handleAction = (action, submission, submissionType) => {
    setActionDialog({
      open: true,
      type: action,
      submission,
      submissionType
    });
    setActionNotes('');
  };

  const executeAction = async () => {
    setActionLoading(true);
    try {
      const endpoint = actionDialog.submissionType === 'grade' 
        ? `grade-submissions/${actionDialog.submission.id}/${actionDialog.type}/`
        : `seminar-submissions/${actionDialog.submission.id}/${actionDialog.type}/`;
      
      await axios.post(endpoint, {
        notes: actionNotes
      });
      
      // Refresh data
      await fetchSubmissions();
      setActionDialog({ open: false, type: '', submission: null, submissionType: '' });
      setActionNotes('');
    } catch (err) {
      console.error('Error executing action:', err);
      setError(err.response?.data?.detail || 'Failed to execute action');
    } finally {
      setActionLoading(false);
    }
  };

  const closeActionDialog = () => {
    setActionDialog({ open: false, type: '', submission: null, submissionType: '' });
    setActionNotes('');
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const renderGradeSubmissions = () => (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Athlete</TableCell>
            <TableCell>Grade</TableCell>
            <TableCell>Examination Date</TableCell>
            <TableCell>Location</TableCell>
            <TableCell>Examiner</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Submitted</TableCell>
            <TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {gradeSubmissions.map((submission) => (
            <TableRow key={submission.id}>
              <TableCell>{submission.athlete_name || 'Unknown Athlete'}</TableCell>
              <TableCell>{submission.grade_name || submission.grade}</TableCell>
              <TableCell>{formatDate(submission.examination_date)}</TableCell>
              <TableCell>{submission.location}</TableCell>
              <TableCell>{submission.examiner_name}</TableCell>
              <TableCell>
                <Chip 
                  label={getStatusLabel(submission.status)} 
                  color={getStatusColor(submission.status)}
                  size="small"
                />
              </TableCell>
              <TableCell>{formatDate(submission.submitted_date)}</TableCell>
              <TableCell>
                {submission.status === 'pending' && (
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Tooltip title="Approve">
                      <IconButton 
                        color="success" 
                        size="small"
                        onClick={() => handleAction('approve', submission, 'grade')}
                      >
                        <ApproveIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Request Revision">
                      <IconButton 
                        color="info" 
                        size="small"
                        onClick={() => handleAction('request_revision', submission, 'grade')}
                      >
                        <RevisionIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Reject">
                      <IconButton 
                        color="error" 
                        size="small"
                        onClick={() => handleAction('reject', submission, 'grade')}
                      >
                        <RejectIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
              </TableCell>
            </TableRow>
          ))}
          {gradeSubmissions.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} align="center">
                <Typography variant="body2" color="textSecondary">
                  No grade submissions found
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderSeminarSubmissions = () => (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Athlete</TableCell>
            <TableCell>Seminar</TableCell>
            <TableCell>Certificate</TableCell>
            <TableCell>Document</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Submitted</TableCell>
            <TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {seminarSubmissions.map((submission) => (
            <TableRow key={submission.id}>
              <TableCell>{submission.athlete_name || 'Unknown Athlete'}</TableCell>
              <TableCell>{submission.seminar_name || submission.seminar}</TableCell>
              <TableCell>
                {submission.participation_certificate ? (
                  <IconButton 
                    component={Link}
                    href={submission.participation_certificate}
                    target="_blank"
                    size="small"
                  >
                    <DownloadIcon />
                  </IconButton>
                ) : (
                  'No file'
                )}
              </TableCell>
              <TableCell>
                {submission.participation_document ? (
                  <IconButton 
                    component={Link}
                    href={submission.participation_document}
                    target="_blank"
                    size="small"
                  >
                    <DownloadIcon />
                  </IconButton>
                ) : (
                  'No file'
                )}
              </TableCell>
              <TableCell>
                <Chip 
                  label={getStatusLabel(submission.status)} 
                  color={getStatusColor(submission.status)}
                  size="small"
                />
              </TableCell>
              <TableCell>{formatDate(submission.submitted_date)}</TableCell>
              <TableCell>
                {submission.status === 'pending' && (
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Tooltip title="Approve">
                      <IconButton 
                        color="success" 
                        size="small"
                        onClick={() => handleAction('approve', submission, 'seminar')}
                      >
                        <ApproveIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Request Revision">
                      <IconButton 
                        color="info" 
                        size="small"
                        onClick={() => handleAction('request_revision', submission, 'seminar')}
                      >
                        <RevisionIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Reject">
                      <IconButton 
                        color="error" 
                        size="small"
                        onClick={() => handleAction('reject', submission, 'seminar')}
                      >
                        <RejectIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
              </TableCell>
            </TableRow>
          ))}
          {seminarSubmissions.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} align="center">
                <Typography variant="body2" color="textSecondary">
                  No seminar submissions found
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const getActionTitle = () => {
    const actionLabels = {
      approve: 'Approve',
      reject: 'Reject',
      request_revision: 'Request Revision'
    };
    const typeLabels = {
      grade: 'Grade Submission',
      seminar: 'Seminar Participation'
    };
    return `${actionLabels[actionDialog.type]} ${typeLabels[actionDialog.submissionType]}`;
  };

  return (
    <Box sx={{ width: '100%', p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Submission Management
      </Typography>
      
      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
          <Tab label="Grade Examinations" />
          <Tab label="Seminar Participations" />
        </Tabs>
      </Box>

      {loading ? (
        <Typography>Loading submissions...</Typography>
      ) : (
        <>
          {tabValue === 0 && renderGradeSubmissions()}
          {tabValue === 1 && renderSeminarSubmissions()}
        </>
      )}

      {/* Action Dialog */}
      <Dialog open={actionDialog.open} onClose={closeActionDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{getActionTitle()}</DialogTitle>
        <DialogContent>
          <TextField
            label="Notes (Optional)"
            value={actionNotes}
            onChange={(e) => setActionNotes(e.target.value)}
            fullWidth
            multiline
            rows={3}
            margin="normal"
            placeholder="Add any notes about this decision..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeActionDialog} disabled={actionLoading}>
            Cancel
          </Button>
          <Button 
            onClick={executeAction} 
            variant="contained" 
            disabled={actionLoading}
            color={actionDialog.type === 'approve' ? 'success' : actionDialog.type === 'reject' ? 'error' : 'primary'}
          >
            {actionLoading ? 'Processing...' : actionDialog.type.charAt(0).toUpperCase() + actionDialog.type.slice(1).replace('_', ' ')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SubmissionManagement;