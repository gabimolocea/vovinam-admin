import React from 'react';
import { useLocation } from 'react-router-dom';
import Navbar from './navbar/Navbar';

const AppLayout = ({ children }) => {
  const location = useLocation();
  
  // Routes that should not show the navigation
  const authRoutes = ['/login', '/register'];
  
  // Check if current route is an auth route
  const isAuthRoute = authRoutes.includes(location.pathname);
  
  // If it's an auth route, render without navigation
  if (isAuthRoute) {
    return children;
  }
  
  // Otherwise, render with navigation
  return <Navbar content={children} />;
};

export default AppLayout;