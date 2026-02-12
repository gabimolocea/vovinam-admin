import React from 'react';
import { Box, Container, Typography } from '@mui/material';
import Breadcrumbs from '../components/Breadcrumbs';

export default function MyAthletesPage() {
  // TODO: Fetch athletes from API
  return (
    <Box sx={{ bgcolor: '#fff', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="md">
        <Breadcrumbs />
        <Typography variant="h4" fontWeight={700} gutterBottom>
          My Athletes
        </Typography>
        {/* Athlete list goes here */}
      </Container>
    </Box>
  );
}
