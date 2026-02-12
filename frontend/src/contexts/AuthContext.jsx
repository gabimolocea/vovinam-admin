import React, { createContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('authToken'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize from stored token
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('authToken');
      const cachedUserRaw = localStorage.getItem('authUser');
      if (cachedUserRaw) {
        try {
          setUser(JSON.parse(cachedUserRaw));
        } catch (e) {
          localStorage.removeItem('authUser');
        }
      }
      if (storedToken) {
        try {
          setToken(storedToken);
          const response = await authAPI.getCurrentUser();
          setUser(response.data);
          localStorage.setItem('authUser', JSON.stringify(response.data));
          setError(null);
        } catch (err) {
          if (err.response?.status === 401) {
            localStorage.removeItem('authToken');
            localStorage.removeItem('userRole');
            localStorage.removeItem('authUser');
            setToken(null);
            setUser(null);
          }
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      setError(null);
      setLoading(true);
      const response = await authAPI.login(email, password);
      console.log('Login response:', response.data); // DEBUG: log full response
      // Extract access token from response.data.tokens.access
      const userData = response.data.user;
      const access = response.data.tokens?.access;
      
      if (!access) {
        throw new Error('No access token returned from server');
      }
      localStorage.setItem('authToken', access);
      localStorage.setItem('userRole', userData.role);
      localStorage.setItem('authUser', JSON.stringify(userData));
      
      setToken(access);
      setUser(userData);
      
      return userData;
    } catch (err) {
      const message = err.response?.data?.detail || err.message || 'Login failed';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authAPI.logout();
    } catch (err) {
      if (err.response?.status !== 400) {
        console.error('Logout error:', err);
      }
    } finally {
      localStorage.removeItem('authToken');
      localStorage.removeItem('userRole');
      localStorage.removeItem('authUser');
      setToken(null);
      setUser(null);
      setError(null);
    }
  }, []);

  const isAuthenticated = !!token && !!user;
  const isReferee = user?.role === 'referee';
  const isAdmin = user?.role === 'admin';

  const value = {
    user,
    token,
    loading,
    error,
    login,
    logout,
    isAuthenticated,
    isReferee,
    isAdmin,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
