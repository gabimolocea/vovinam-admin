import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Box, Paper, Typography, Button } from '@mui/material';

const AuthDebug = () => {
  const { user, loading, isAuthenticated, isAdmin, tokens } = useAuth();

  const handleTestLogin = async () => {
    try {
      // Simulate a login by setting tokens manually for testing
      const testTokens = {
        access: "test-access-token",
        refresh: "test-refresh-token"
      };
      localStorage.setItem('access_token', testTokens.access);
      localStorage.setItem('refresh_token', testTokens.refresh);
      window.location.reload();
    } catch (error) {
      console.error('Test login failed:', error);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Authentication Debug Info
        </Typography>
        
        <Typography variant="body2" component="pre" sx={{ mb: 1 }}>
          Loading: {loading ? 'true' : 'false'}
        </Typography>
        
        <Typography variant="body2" component="pre" sx={{ mb: 1 }}>
          Is Authenticated: {isAuthenticated ? 'true' : 'false'}
        </Typography>
        
        <Typography variant="body2" component="pre" sx={{ mb: 1 }}>
          Is Admin: {isAdmin ? 'true' : 'false'}
        </Typography>
        
        <Typography variant="body2" component="pre" sx={{ mb: 1 }}>
          User: {JSON.stringify(user, null, 2)}
        </Typography>
        
        <Typography variant="body2" component="pre" sx={{ mb: 1 }}>
          Tokens: {JSON.stringify(tokens, null, 2)}
        </Typography>

        <Button variant="outlined" onClick={handleTestLogin} sx={{ mr: 1 }}>
          Test Login (Set Dummy Tokens)
        </Button>
        
        <Button 
          variant="outlined" 
          onClick={() => {
            localStorage.clear();
            window.location.reload();
          }}
        >
          Clear Storage
        </Button>
      </Paper>
    </Box>
  );
};

export default AuthDebug;