import React from 'react';
import { Box, Container, Typography } from '@mui/material';
import Breadcrumbs from '../components/Breadcrumbs';

export default function CompetitionDetailPage() {
  // TODO: Fetch competition details from API using useParams
  return (
    <Box sx={{ bgcolor: '#fff', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="md">
        <Breadcrumbs />
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Competition Details
        </Typography>
        {/* Competition details go here */}
      </Container>
    </Box>
  );
}
