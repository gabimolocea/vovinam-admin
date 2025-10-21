import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress, Alert } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children, requireAdmin = false, requireRole = null }) => {
  const { user, isAuthenticated, isAdmin, isAthlete, isSupporter, userRole, loading } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If admin required but user is not admin, show access denied or redirect
  if (requireAdmin && !isAdmin) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
        sx={{ p: 3 }}
      >
        <Alert severity="error" sx={{ maxWidth: 400 }}>
          <h3>Access Denied</h3>
          <p>You don't have permission to access this page.</p>
          <p>Admin privileges are required.</p>
        </Alert>
      </Box>
    );
  }

  // If specific role required, check if user has that role
  if (requireRole) {
    const hasRequiredRole = 
      (requireRole === 'athlete' && isAthlete) ||
      (requireRole === 'supporter' && isSupporter) ||
      (requireRole === 'admin' && isAdmin);

    if (!hasRequiredRole) {
      return (
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          minHeight="100vh"
          sx={{ p: 3 }}
        >
          <Alert severity="warning" sx={{ maxWidth: 400 }}>
            <h3>Role Required</h3>
            <p>You need to be registered as a {requireRole} to access this page.</p>
            <p>Your current role: {userRole}</p>
          </Alert>
        </Box>
      );
    }
  }

  // User is authenticated and has required permissions
  return children;
};

export default ProtectedRoute;