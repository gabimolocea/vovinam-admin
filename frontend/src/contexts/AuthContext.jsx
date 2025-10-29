import React, { createContext, useContext, useEffect, useState } from 'react';
import AxiosInstance from '../components/Axios';
import AthleteWorkflowAPI from '../services/athleteWorkflowAPI';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const isTokenExpired = (token) => {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch (error) {
    return true;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Initialize tokens and validate them
  const initializeTokens = () => {
    const accessToken = localStorage.getItem('access_token');
    const refreshToken = localStorage.getItem('refresh_token');
    
    // Clear expired tokens
    if (accessToken && isTokenExpired(accessToken)) {
      localStorage.removeItem('access_token');
    }
    if (refreshToken && isTokenExpired(refreshToken)) {
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('access_token'); // Clear access too if refresh is expired
    }
    
    return {
      access: isTokenExpired(accessToken) ? null : accessToken,
      refresh: isTokenExpired(refreshToken) ? null : refreshToken
    };
  };
  
  const [tokens, setTokens] = useState(initializeTokens());

  // Configure axios interceptors for automatic token handling
  useEffect(() => {
    // Request interceptor to add auth header
    const requestInterceptor = AxiosInstance.interceptors.request.use(
      (config) => {
        if (tokens.access) {
          config.headers.Authorization = `Bearer ${tokens.access}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor to handle token refresh
    const responseInterceptor = AxiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        
        // Prevent infinite loops by checking if this is already a retry or a refresh request
        if (error.response?.status === 401 && 
            tokens.refresh && 
            !originalRequest._retry && 
            !originalRequest.url.includes('/auth/token/refresh/')) {
          
          originalRequest._retry = true;
          
          try {
            const response = await AxiosInstance.post('/auth/token/refresh/', {
              refresh: tokens.refresh
            });
            const newAccessToken = response.data.access;
            setTokens(prev => ({ ...prev, access: newAccessToken }));
            localStorage.setItem('access_token', newAccessToken);
            
            // Retry the original request with new token
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            return AxiosInstance.request(originalRequest);
          } catch (refreshError) {
            console.log('Token refresh failed:', refreshError);
            // Refresh failed, log out user
            logout();
            return Promise.reject(refreshError);
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      AxiosInstance.interceptors.request.eject(requestInterceptor);
      AxiosInstance.interceptors.response.eject(responseInterceptor);
    };
  }, [tokens.access, tokens.refresh]);

  // Load user profile if tokens exist or check for backend session
  useEffect(() => {
    const loadUser = async () => {
      console.log('loadUser called with tokens:', tokens);
      // First, try to load user with JWT tokens if they exist
      if (tokens.access) {
        console.log('Attempting JWT token authentication...');
        try {
          // Use enhanced profile endpoint for additional role information
          const response = await AthleteWorkflowAPI.getUserProfile();
          console.log('JWT profile response:', response);
          setUser(response);
          setLoading(false);
          return;
        } catch (error) {
          console.log('JWT token invalid, clearing tokens...');
          // Clear invalid tokens
          setTokens({ access: null, refresh: null });
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
      }

      // If no JWT tokens or they're invalid, check for backend session
      try {
        console.log('Checking for existing backend session...');
        const response = await AxiosInstance.get('/auth/session-check/', {
          withCredentials: true // Include session cookies
        });
        
        if (response.data.authenticated) {
          console.log('Found existing backend session for user:', response.data.user);
          setUser(response.data.user);
          
          // Optional: Get JWT tokens for this session user
          try {
            const tokenResponse = await AxiosInstance.post('/auth/session-login/', {}, {
              withCredentials: true
            });
            if (tokenResponse.data.tokens) {
              setTokens(tokenResponse.data.tokens);
              localStorage.setItem('access_token', tokenResponse.data.tokens.access);
              localStorage.setItem('refresh_token', tokenResponse.data.tokens.refresh);
            }
          } catch (tokenError) {
            console.log('Could not get JWT tokens for session user:', tokenError);
          }
        }
      } catch (error) {
        console.log('No backend session found:', error.response?.status);
      }
      
      setLoading(false);
    };

    loadUser();
  }, [tokens.access]);

  const login = async (email, password) => {
    try {
      const response = await AxiosInstance.post('/auth/login/', {
        email,
        password
      });
      
      const { user: userData, tokens: userTokens } = response.data;
      
      setUser(userData);
      setTokens(userTokens);
      localStorage.setItem('access_token', userTokens.access);
      localStorage.setItem('refresh_token', userTokens.refresh);
      
      return { success: true, user: userData };
    } catch (error) {
      const errorMessage = error.response?.data?.non_field_errors?.[0] || 
                          error.response?.data?.detail || 
                          'Login failed';
      return { success: false, error: errorMessage };
    }
  };

  const register = async (userData) => {
    try {
      const response = await AthleteWorkflowAPI.registerUser(userData);
      
      const { user: newUser, tokens: userTokens } = response;
      
      setUser(newUser);
      setTokens(userTokens);
      localStorage.setItem('access_token', userTokens.access);
      localStorage.setItem('refresh_token', userTokens.refresh);
      
      return { success: true, user: newUser };
    } catch (error) {
      return { success: false, error: error.errors || error.message };
    }
  };

  const clearTokens = () => {
    setUser(null);
    setTokens({ access: null, refresh: null });
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  };

  const logout = async () => {
    try {
      // Logout from JWT
      if (tokens.refresh) {
        await AxiosInstance.post('/auth/logout/', {
          refresh: tokens.refresh
        });
      }
      
      // Also logout from Django session if it exists
      try {
        await AxiosInstance.post('/auth/session-logout/', {}, {
          withCredentials: true
        });
      } catch (sessionError) {
        console.log('No session to logout from:', sessionError);
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearTokens();
    }
  };

  const updateProfile = async (profileData) => {
    try {
      const response = await AthleteWorkflowAPI.updateUserProfile(profileData);
      setUser(response);
      return { success: true, user: response };
    } catch (error) {
      return { success: false, error: error.errors || error.message };
    }
  };



  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    isAdmin: user?.is_admin || false,
    isAthlete: user?.is_athlete || false,
    isSupporter: user?.is_supporter || false,
    hasAthleteProfile: user?.has_approved_athlete_profile || false,
    hasPendingAthleteProfile: user?.has_pending_athlete_profile || false,
    userRole: user?.role || 'user',
    login,
    register,
    logout,
    updateProfile,
    tokens
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;