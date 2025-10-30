import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children, requireAdmin = false, requireRole = null }) => {
  const { user, isAuthenticated, isAdmin, isAthlete, isSupporter, userRole, loading } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If admin required but user is not admin, show access denied or redirect
  if (requireAdmin && !isAdmin) {
    return (
      <div className="flex justify-center items-center min-h-screen p-3">
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You don't have permission to access this page. Admin privileges are required.
          </AlertDescription>
        </Alert>
      </div>
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
        <div className="flex justify-center items-center min-h-screen p-3">
          <Alert className="max-w-md">
            <AlertTitle>Role Required</AlertTitle>
            <AlertDescription>
              You need to be registered as a {requireRole} to access this page.
              <br />
              Your current role: {userRole}
            </AlertDescription>
          </Alert>
        </div>
      );
    }
  }

  // User is authenticated and has required permissions
  return children;
};

export default ProtectedRoute;