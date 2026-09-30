import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@shared/contexts/AuthContext';
import { DisplayPreviewProvider } from './contexts/DisplayPreviewContext';
import { ToastProvider } from './contexts/ToastContext';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <div className="competition-admin-app">
      <BrowserRouter>
        <AuthProvider>
          <DisplayPreviewProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </DisplayPreviewProvider>
        </AuthProvider>
      </BrowserRouter>
    </div>
  </React.StrictMode>,
);
