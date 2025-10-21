import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Box, Paper, Typography, Button } from '@mui/material';

const AuthTest = () => {
  const { user, loading, isAuthenticated, isAdmin, login } = useAuth();

  const handleTestLogin = async () => {
    console.log('Testing login...');
    const result = await login('admin@frvv.com', 'admin123');
    console.log('Login result:', result);
  };

  return (
    <Box sx={{ p: 2 }}>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Authentication Test
        </Typography>
        
        <Typography variant="body2" sx={{ mb: 1 }}>
          Loading: {loading ? 'true' : 'false'}
        </Typography>
        
        <Typography variant="body2" sx={{ mb: 1 }}>
          Is Authenticated: {isAuthenticated ? 'true' : 'false'}
        </Typography>
        
        <Typography variant="body2" sx={{ mb: 1 }}>
          Is Admin: {isAdmin ? 'true' : 'false'}
        </Typography>
        
        <Typography variant="body2" sx={{ mb: 2 }}>
          User: {user ? `${user.first_name} ${user.last_name} (${user.email})` : 'None'}
        </Typography>

        <Button variant="contained" onClick={handleTestLogin} disabled={loading}>
          Test Login
        </Button>
      </Paper>
    </Box>
  );
};

export default AuthTest;