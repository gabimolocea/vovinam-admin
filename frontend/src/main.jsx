import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import AppLayout from './components/AppLayout';
import App from './App.jsx';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';

const rootElement = document.getElementById('root');

if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <NotificationProvider>
            <AppLayout>
              <App />
            </AppLayout>
          </NotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
} else {
  console.error('Root element not found. Please check your HTML file.');
}