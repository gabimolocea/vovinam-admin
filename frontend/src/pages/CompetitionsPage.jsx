import React from 'react';
import { Box, Container, Typography } from '@mui/material';
import Breadcrumbs from '../components/Breadcrumbs';

export default function CompetitionsPage() {
  // TODO: Fetch competitions from API
  return (
    <Box sx={{ bgcolor: '#fff', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="md">
        <Breadcrumbs />
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Competitions
        </Typography>
        {/* Competition list goes here */}
      </Container>
    </Box>
  );
}
