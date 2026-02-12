import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children, requiredRole }) => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return <div className="loading-container"><p>Loading...</p></div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/referee/login" replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    if (!(requiredRole === 'referee' && user?.role === 'admin')) {
      return <Navigate to="/" replace />;
    }
  }

  return children;
};

export default ProtectedRoute;
