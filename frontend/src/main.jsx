import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import AppLayout from './components/AppLayout';
import App from './App.jsx';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { buildTheme, fetchThemeFromBackend } from './theme';
import { AuthProvider } from './contexts/AuthContext';

// Theme wrapper component to handle async theme loading
const ThemeWrapper = ({ children }) => {
  const [theme, setTheme] = useState(buildTheme()); // Start with default theme
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        console.log('🚀 Starting theme loading process...');
        const backendTokens = await fetchThemeFromBackend();
        console.log('🔧 Building theme with tokens:', Object.keys(backendTokens));
        const dynamicTheme = buildTheme(backendTokens);
        console.log('✨ Theme built successfully:', {
          primaryColor: dynamicTheme.palette.primary.main,
          secondaryColor: dynamicTheme.palette.secondary.main,
          backgroundColor: dynamicTheme.palette.background.default
        });
        setTheme(dynamicTheme);
        
        // Force a test color temporarily to verify theme system works
        console.log('🧪 Testing theme application...');
      } catch (error) {
        console.warn('❌ Failed to load backend theme, using default:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTheme();
  }, []);

  // Optional: Show loading state
  if (isLoading) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100vh',
          fontFamily: 'BeVietnam, Roboto, sans-serif'
        }}>
          Loading theme...
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
};

const rootElement = document.getElementById('root');

if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <ThemeWrapper>
        <BrowserRouter>
          <AuthProvider>
            <AppLayout>
              <App />
            </AppLayout>
          </AuthProvider>
        </BrowserRouter>
      </ThemeWrapper>
    </React.StrictMode>
  );
} else {
  console.error('Root element not found. Please check your HTML file.');
}