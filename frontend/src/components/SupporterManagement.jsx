import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Alert,
  CircularProgress,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Divider,
  Chip,
  Paper,
  Autocomplete
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Person as PersonIcon,
  Sports as SportsIcon,
  Visibility as VisibilityIcon,
  Link as LinkIcon
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import AthleteWorkflowAPI from '../services/athleteWorkflowAPI';

const SupporterManagement = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { isSupporter, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [relations, setRelations] = useState([]);
  const [availableAthletes, setAvailableAthletes] = useState([]);
  const [addDialog, setAddDialog] = useState(false);
  const [editDialog, setEditDialog] = useState({ open: false, relation: null });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, relation: null });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [newRelation, setNewRelation] = useState({
    athlete: null,
    relationship: 'parent',
    can_edit: true,
    can_register_competitions: true
  });

  const relationshipTypes = [
    { value: 'parent', label: 'Parent' },
    { value: 'guardian', label: 'Legal Guardian' },
    { value: 'coach', label: 'Coach' },
    { value: 'other', label: 'Other' }
  ];

  useEffect(() => {
    if (!isSupporter) {
      navigate('/dashboard');
      return;
    }
    loadData();
  }, [isSupporter, navigate]);

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const [relationsData, athletesData] = await Promise.all([
        AthleteWorkflowAPI.getSupporterAthleteRelations(),
        AthleteWorkflowAPI.getApprovedAthletes()
      ]);

      setRelations(relationsData);
      
      // Filter out athletes that are already linked
      const linkedAthleteIds = relationsData.map(r => r.athlete.id);
      const availableAthletes = athletesData.filter(athlete => 
        !linkedAthleteIds.includes(athlete.id)
      );
      setAvailableAthletes(availableAthletes);

    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load supporter data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRelation = async () => {
    if (!newRelation.athlete) {
      setError('Please select an athlete');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const relationData = {
        athlete: newRelation.athlete.id,
        relationship: newRelation.relationship,
        can_edit: newRelation.can_edit,
        can_register_competitions: newRelation.can_register_competitions
      };

      const createdRelation = await AthleteWorkflowAPI.createSupporterAthleteRelation(relationData);
      
      setRelations(prev => [...prev, createdRelation]);
      setAvailableAthletes(prev => prev.filter(athlete => athlete.id !== newRelation.athlete.id));
      
      setAddDialog(false);
      setNewRelation({
        athlete: null,
        relationship: 'parent',
        can_edit: true,
        can_register_competitions: true
      });
      
      setSuccess('Athlete relationship added successfully');

    } catch (error) {
      setError(error.message || 'Failed to add athlete relationship');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditRelation = async () => {
    const { relation } = editDialog;
    setIsSubmitting(true);
    setError('');

    try {
      const updatedRelation = await AthleteWorkflowAPI.updateSupporterAthleteRelation(
        relation.id,
        {
          relationship: relation.relationship,
          can_edit: relation.can_edit,
          can_register_competitions: relation.can_register_competitions
        }
      );

      setRelations(prev => prev.map(r => r.id === relation.id ? updatedRelation : r));
      setEditDialog({ open: false, relation: null });
      setSuccess('Relationship updated successfully');

    } catch (error) {
      setError(error.message || 'Failed to update relationship');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRelation = async () => {
    const { relation } = deleteDialog;
    setIsSubmitting(true);
    setError('');

    try {
      await AthleteWorkflowAPI.deleteSupporterAthleteRelation(relation.id);
      
      setRelations(prev => prev.filter(r => r.id !== relation.id));
      setAvailableAthletes(prev => [...prev, relation.athlete]);
      
      setDeleteDialog({ open: false, relation: null });
      setSuccess('Athlete relationship removed successfully');

    } catch (error) {
      setError(error.message || 'Failed to remove relationship');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (relation) => {
    setEditDialog({
      open: true,
      relation: {
        ...relation,
        relationship: relation.relationship,
        can_edit: relation.can_edit,
        can_register_competitions: relation.can_register_competitions
      }
    });
  };

  const renderAthleteCard = (relation) => (
    <Card key={relation.id} sx={{ mb: 2 }}>
      <CardContent>
        <Grid container spacing={2} alignItems="center">
          <Grid item>
            <Avatar sx={{ bgcolor: theme.palette.primary.main }}>
              <PersonIcon />
            </Avatar>
          </Grid>
          
          <Grid item xs>
            <Typography variant="h6">
              {relation.athlete.first_name} {relation.athlete.last_name}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Relationship: {relationshipTypes.find(r => r.value === relation.relationship)?.label}
            </Typography>
            <Box mt={1}>
              <Chip
                size="small"
                label={relation.can_edit ? 'Can Edit' : 'View Only'}
                color={relation.can_edit ? 'success' : 'default'}
                sx={{ mr: 1 }}
              />
              <Chip
                size="small"
                label={relation.can_register_competitions ? 'Can Register' : 'No Registration'}
                color={relation.can_register_competitions ? 'primary' : 'default'}
              />
            </Box>
          </Grid>
          
          <Grid item>
            <Box display="flex" flexDirection="column" gap={1}>
              <Button
                size="small"
                startIcon={<VisibilityIcon />}
                onClick={() => navigate(`/athlete/${relation.athlete.id}`)}
                variant="outlined"
              >
                View
              </Button>
              <Button
                size="small"
                startIcon={<EditIcon />}
                onClick={() => openEditDialog(relation)}
                variant="outlined"
              >
                Edit
              </Button>
              <Button
                size="small"
                startIcon={<DeleteIcon />}
                onClick={() => setDeleteDialog({ open: true, relation })}
                color="error"
                variant="outlined"
              >
                Remove
              </Button>
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );

  const renderAddDialog = () => (
    <Dialog open={addDialog} onClose={() => setAddDialog(false)} maxWidth="sm" fullWidth>
      <DialogTitle>Add Athlete Relationship</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2 }}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Autocomplete
                options={availableAthletes}
                getOptionLabel={(athlete) => `${athlete.first_name} ${athlete.last_name}`}
                value={newRelation.athlete}
                onChange={(event, value) => setNewRelation(prev => ({ ...prev, athlete: value }))}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Select Athlete"
                    required
                    helperText="Choose from approved athletes"
                  />
                )}
                renderOption={(props, athlete) => (
                  <li {...props}>
                    <Box display="flex" alignItems="center">
                      <Avatar sx={{ mr: 2, width: 32, height: 32 }}>
                        {athlete.first_name[0]}{athlete.last_name[0]}
                      </Avatar>
                      <Box>
                        <Typography variant="body2">
                          {athlete.first_name} {athlete.last_name}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          {athlete.club?.name || 'No club'}
                        </Typography>
                      </Box>
                    </Box>
                  </li>
                )}
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Relationship</InputLabel>
                <Select
                  value={newRelation.relationship}
                  onChange={(e) => setNewRelation(prev => ({ ...prev, relationship: e.target.value }))}
                  label="Relationship"
                >
                  {relationshipTypes.map((type) => (
                    <MenuItem key={type.value} value={type.value}>
                      {type.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Permissions
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    checked={newRelation.can_edit}
                    onChange={(e) => setNewRelation(prev => ({ ...prev, can_edit: e.target.checked }))}
                  />
                }
                label="Can edit athlete profile"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={newRelation.can_register_competitions}
                    onChange={(e) => setNewRelation(prev => ({ ...prev, can_register_competitions: e.target.checked }))}
                  />
                }
                label="Can register for competitions"
              />
            </Grid>
          </Grid>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setAddDialog(false)} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleAddRelation}
          variant="contained"
          disabled={isSubmitting || !newRelation.athlete}
        >
          {isSubmitting ? <CircularProgress size={20} /> : 'Add Relationship'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  const renderEditDialog = () => (
    <Dialog open={editDialog.open} onClose={() => setEditDialog({ open: false, relation: null })} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Relationship</DialogTitle>
      <DialogContent>
        {editDialog.relation && (
          <Box sx={{ pt: 2 }}>
            <Typography variant="body1" gutterBottom>
              <strong>{editDialog.relation.athlete.first_name} {editDialog.relation.athlete.last_name}</strong>
            </Typography>
            
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Relationship</InputLabel>
                  <Select
                    value={editDialog.relation.relationship}
                    onChange={(e) => setEditDialog(prev => ({
                      ...prev,
                      relation: { ...prev.relation, relationship: e.target.value }
                    }))}
                    label="Relationship"
                  >
                    {relationshipTypes.map((type) => (
                      <MenuItem key={type.value} value={type.value}>
                        {type.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12}>
                <Typography variant="subtitle2" gutterBottom>
                  Permissions
                </Typography>
                <FormControlLabel
                  control={
                    <Switch
                      checked={editDialog.relation.can_edit}
                      onChange={(e) => setEditDialog(prev => ({
                        ...prev,
                        relation: { ...prev.relation, can_edit: e.target.checked }
                      }))}
                    />
                  }
                  label="Can edit athlete profile"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={editDialog.relation.can_register_competitions}
                      onChange={(e) => setEditDialog(prev => ({
                        ...prev,
                        relation: { ...prev.relation, can_register_competitions: e.target.checked }
                      }))}
                    />
                  }
                  label="Can register for competitions"
                />
              </Grid>
            </Grid>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setEditDialog({ open: false, relation: null })} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleEditRelation}
          variant="contained"
          disabled={isSubmitting}
        >
          {isSubmitting ? <CircularProgress size={20} /> : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  const renderDeleteDialog = () => (
    <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, relation: null })}>
      <DialogTitle>Remove Athlete Relationship</DialogTitle>
      <DialogContent>
        {deleteDialog.relation && (
          <Typography>
            Are you sure you want to remove your relationship with{' '}
            <strong>{deleteDialog.relation.athlete.first_name} {deleteDialog.relation.athlete.last_name}</strong>?
            You will no longer be able to manage their profile or registrations.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setDeleteDialog({ open: false, relation: null })} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleDeleteRelation}
          color="error"
          variant="contained"
          disabled={isSubmitting}
        >
          {isSubmitting ? <CircularProgress size={20} /> : 'Remove'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  if (!isSupporter) {
    return (
      <Container maxWidth="sm">
        <Alert severity="error" sx={{ mt: 4 }}>
          Access denied. Supporter privileges required.
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
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Typography variant="h4">
          Athlete Management
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setAddDialog(true)}
          disabled={availableAthletes.length === 0}
        >
          Add Athlete
        </Button>
      </Box>

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

      <Grid container spacing={3}>
        {/* Statistics Cards */}
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h3" color="primary.main">
              {relations.length}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Managed Athletes
            </Typography>
          </Paper>
        </Grid>
        
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h3" color="success.main">
              {relations.filter(r => r.can_edit).length}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Editable Profiles
            </Typography>
          </Paper>
        </Grid>
        
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h3" color="info.main">
              {relations.filter(r => r.can_register_competitions).length}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Can Register
            </Typography>
          </Paper>
        </Grid>

        {/* Athletes List */}
        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom>
            Your Athletes
          </Typography>
          
          {relations.length > 0 ? (
            <Box>
              {relations.map(relation => renderAthleteCard(relation))}
            </Box>
          ) : (
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 6 }}>
                <SportsIcon sx={{ fontSize: 64, color: 'grey.400', mb: 2 }} />
                <Typography variant="h6" color="textSecondary" gutterBottom>
                  No Athletes Added Yet
                </Typography>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
                  Start by adding an athlete to manage their profile and competition registrations.
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setAddDialog(true)}
                  disabled={availableAthletes.length === 0}
                >
                  Add First Athlete
                </Button>
                {availableAthletes.length === 0 && (
                  <Typography variant="caption" display="block" sx={{ mt: 2 }}>
                    No approved athletes available to link
                  </Typography>
                )}
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>

      {/* Dialogs */}
      {renderAddDialog()}
      {renderEditDialog()}
      {renderDeleteDialog()}
    </Container>
  );
};

export default SupporterManagement;