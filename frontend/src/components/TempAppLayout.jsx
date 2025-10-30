import React from 'react';
import { useLocation } from 'react-router-dom';
import Navbar from './navbar/NewNavbar';

const AppLayout = ({ children }) => {
  const location = useLocation();
  
  // Routes that should not show the navigation
  const authRoutes = ['/login', '/register'];
  
  // Check if current route is an auth route
  const isAuthRoute = authRoutes.includes(location.pathname);
  
  // If it's an auth route, render without navigation
  if (isAuthRoute) {
    return (
      <div className="min-h-screen bg-background">
        {children}
      </div>
    );
  }
  
  // Otherwise, render with the new navigation
  return <Navbar content={children} />;
};

export default AppLayout;