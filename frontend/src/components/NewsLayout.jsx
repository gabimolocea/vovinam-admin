import React from 'react';
import { Outlet } from 'react-router-dom';
import { Box, Container } from '@mui/material';

const NewsLayout = () => {
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          marginLeft: { xs: 0, md: '250px' },
          transition: 'margin-left 0.3s ease',
        }}
      >
        <Container>
          <Outlet />
        </Container>
      </Box>
    </Box>
  );
};

export default NewsLayout;