import React, { useEffect, useState } from 'react';
import { Box, Button, Typography, Card, CardContent } from '@mui/material';
import AxiosInstance from '../components/Axios';
import { useAuth } from '../contexts/AuthContext';

const SessionTest = () => {
  const { user, isAuthenticated } = useAuth();
  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(false);

  const checkSession = async () => {
    setLoading(true);
    try {
      const response = await AxiosInstance.get('/auth/session-check/');
      setSessionData(response.data);
      console.log('Session check response:', response.data);
    } catch (error) {
      console.error('Session check error:', error);
      setSessionData({ error: error.message });
    }
    setLoading(false);
  };

  const convertSession = async () => {
    setLoading(true);
    try {
      const response = await AxiosInstance.post('/auth/session-login/');
      console.log('Session login response:', response.data);
      setSessionData(response.data);
    } catch (error) {
      console.error('Session login error:', error);
      setSessionData({ error: error.message });
    }
    setLoading(false);
  };

  useEffect(() => {
    checkSession();
  }, []);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Session Test Page
      </Typography>
      
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Frontend Auth State:
          </Typography>
          <Typography>
            Authenticated: {isAuthenticated ? 'Yes' : 'No'}
          </Typography>
          <Typography>
            User: {user ? `${user.first_name} ${user.last_name} (${user.email})` : 'None'}
          </Typography>
          <Typography>
            Role: {user?.role || 'None'}
          </Typography>
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Backend Session Check:
          </Typography>
          <Button 
            variant="contained" 
            onClick={checkSession} 
            disabled={loading}
            sx={{ mr: 2, mb: 2 }}
          >
            Check Session
          </Button>
          <Button 
            variant="outlined" 
            onClick={convertSession} 
            disabled={loading}
            sx={{ mb: 2 }}
          >
            Convert Session to JWT
          </Button>
          
          {sessionData && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle1">Response:</Typography>
              <pre style={{ 
                background: '#f5f5f5', 
                padding: '10px', 
                borderRadius: '4px',
                overflow: 'auto',
                fontSize: '12px'
              }}>
                {JSON.stringify(sessionData, null, 2)}
              </pre>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default SessionTest;