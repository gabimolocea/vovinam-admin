import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@shared/contexts/AuthContext';
import { DisplayPreviewProvider } from './contexts/DisplayPreviewContext';
import App from './App';
import '@shared/styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DisplayPreviewProvider>
          <App />
        </DisplayPreviewProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
