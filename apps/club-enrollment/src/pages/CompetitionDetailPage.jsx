import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { competitionAPI } from '../services/apis.js';
import { Container, Typography, CircularProgress, Paper, Chip } from '@mui/material';
import Breadcrumb from '../components/Breadcrumb';

const CompetitionDetailPage = () => {
  const { competitionId } = useParams();
  const [competition, setCompetition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    competitionAPI.get(competitionId)
      .then(res => {
        setCompetition(res.data);
        setLoading(false);
      })
      .catch(err => {
        setError('Failed to load competition');
        setLoading(false);
      });
  }, [competitionId]);

  if (loading) return <Container sx={{ py: 4 }}><CircularProgress /></Container>;
  if (error) return <Container sx={{ py: 4 }}><Typography color="error">{error}</Typography></Container>;
  if (!competition) return null;

  return (
    <Container sx={{ py: 4 }}>
      <Breadcrumb
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Competitions', path: '/dashboard/competitions' },
          { label: competition.title, path: `/dashboard/competitions/${competition.id}` },
        ]}
      />
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h4" gutterBottom>{competition.title}</Typography>
        <Typography variant="body1" color="text.secondary" gutterBottom>
          {competition.city_name}
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {new Date(competition.start_date).toLocaleDateString()} - {new Date(competition.end_date).toLocaleDateString()}
        </Typography>
        <Chip label={competition.status} color={competition.status === 'ongoing' ? 'success' : 'default'} sx={{ mt: 1 }} />
        {/* Add more competition details here as needed */}
      </Paper>
    </Container>
  );
};

export default CompetitionDetailPage;
